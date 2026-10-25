import { randomUUID } from "node:crypto";
import {
  proposalSchema,
  showtimeSchema,
  fieldsSchema,
  type CsvRow,
  type Entry,
  type Preview,
  type Proposal,
  type Showtime,
  type reviewSchema,
} from "../../features/reconciliation/schemas";
import type { z } from "zod";
import { AppError } from "../errors";

export const nameKey = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const imported = [
  "partnerTitle",
  "auditorium",
  "startTime",
  "endTime",
  "language",
  "format",
  "rating",
  "movieStatus",
  "status",
] as const;
export function exactProposal(
  rows: CsvRow[],
  snapshot: Showtime[],
): Proposal | null {
  const live = snapshot.filter((s) => s.status !== "archived");
  if (rows.length !== live.length) return null;
  const used = new Set<string>();
  const decisions: Proposal["decisions"] = [];
  for (const [sourceRow, row] of rows.entries()) {
    const matches = live.filter(
      (s) =>
        nameKey(s.movieTitle) === nameKey(row.movieTitle) &&
        s.startTime === row.startTime &&
        s.endTime === row.endTime &&
        s.auditorium === row.auditorium &&
        s.language === row.language &&
        s.format === row.format &&
        s.rating === row.rating &&
        s.status === "active",
    );
    const match = matches[0];
    if (matches.length !== 1 || !match || used.has(match.id)) return null;
    used.add(match.id);
    decisions.push({
      sourceRow,
      kind: "match",
      showtimeId: match.id,
      movieId: null,
      title: null,
      auditorium: null,
      reason: "Matches the persisted screening after title normalization.",
    });
  }
  return { decisions };
}
export function finalBlockers(snapshot: Showtime[], entries: Entry[]) {
  const blockers: string[] = [];
  const final = new Map(snapshot.map((s) => [s.id, s]));
  for (const entry of entries) {
    if (entry.excluded) continue;
    if (entry.kind === "ambiguous") {
      blockers.push(
        `CSV row ${(entry.sourceRow ?? 0) + 2}: choose an existing screening or add a new one, then confirm your edits.`,
      );
      continue; // An unresolved draft is not a proposed database write.
    }
    if (entry.after) final.set(entry.after.id, entry.after);
  }
  const active = new Set<string>();
  for (const s of final.values())
    if (s.status === "active") {
      const identity = `${s.movieId}:${s.startTime}`;
      if (active.has(identity))
        blockers.push(
          "Duplicate active movie/start identity; correct or exclude the conflicting proposal.",
        );
      active.add(identity);
    }
  if (final.size > 200)
    blockers.push("Result exceeds the 200-screening reconciliation limit.");
  return [...new Set(blockers)];
}
function sourceDraft(
  row: CsvRow,
  theaterId: string,
  now = new Date().toISOString(),
): Showtime {
  const { movieTitle, theaterName: _theater, ...source } = row;
  void _theater;
  return showtimeSchema.parse({
    ...source,
    id: randomUUID(),
    movieId: randomUUID(),
    theaterId,
    movieTitle,
    partnerTitle: movieTitle,
    movieStatus: "draft",
    status: "active",
    lastUpdated: now,
  });
}
export function compilePreview(
  rows: CsvRow[],
  snapshot: Showtime[],
  value: unknown,
  metadata: Omit<Preview, "entries" | "blockers">,
  now = new Date().toISOString(),
): Preview {
  const parsed = proposalSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError(502, "Invalid model output; no changes were made.");
  const decisions = parsed.data.decisions;
  if (
    decisions.length !== rows.length ||
    new Set(decisions.map((d) => d.sourceRow)).size !== rows.length ||
    decisions.some((d) => d.sourceRow >= rows.length)
  )
    throw new AppError(502, "Model did not account for every CSV row.");
  const known = new Map(snapshot.map((s) => [s.id, s]));
  const catalog = new Map(snapshot.map((s) => [s.movieId, s.movieTitle]));
  const newMovies = new Map<string, { id: string; title: string }>();
  const used = new Set<string>();
  const entries: Entry[] = [];
  for (const d of [...decisions].sort((a, b) => a.sourceRow - b.sourceRow)) {
    const row = rows[d.sourceRow]!;
    if (
      (d.kind !== "match" && d.showtimeId !== null) ||
      (d.kind !== "add" && d.movieId !== null)
    )
      throw new AppError(502, "Model returned inconsistent references.");
    if (d.kind === "ambiguous") {
      entries.push({
        kind: "ambiguous",
        sourceRow: d.sourceRow,
        original: row,
        before: null,
        after: sourceDraft(row, metadata.theaterId, now),
        reason: d.reason,
        excluded: false,
      });
      continue;
    }
    const before =
      d.kind === "match" && d.showtimeId
        ? known.get(d.showtimeId)
        : d.kind === "add" && d.movieId
          ? snapshot.find(
              (s) =>
                s.movieId === d.movieId &&
                s.startTime === row.startTime &&
                s.status !== "archived",
            )
          : undefined;
    if ((d.kind === "match" && !before) || (before && used.has(before.id)))
      throw new AppError(
        502,
        "Model referenced an unknown or repeated screening.",
      );
    if (d.movieId && !catalog.has(d.movieId))
      throw new AppError(502, "Model referenced a foreign movie.");
    if (before) used.add(before.id);
    const suggestedTitle =
      before?.movieTitle ??
      (d.movieId ? catalog.get(d.movieId)! : (d.title ?? row.movieTitle));
    const title =
      newMovies.get(nameKey(suggestedTitle))?.title ?? suggestedTitle;
    const canonicalId = [...catalog].find(
      ([, t]) => nameKey(t) === nameKey(title),
    )?.[0];
    if (!before && !d.movieId && canonicalId)
      throw new AppError(502, "Model must reuse the known movie identity.");
    const movieId =
      before?.movieId ??
      d.movieId ??
      newMovies.get(nameKey(title))?.id ??
      randomUUID();
    newMovies.set(nameKey(title), { id: movieId, title });
    const { movieTitle: _title, theaterName: _theater, ...sourceFields } = row;
    void _title;
    void _theater;
    const after = showtimeSchema.parse({
      ...fieldsSchema.parse({
        ...sourceFields,
        partnerTitle: title,
        auditorium: d.auditorium ?? row.auditorium,
      }),
      id: before?.id ?? randomUUID(),
      theaterId: metadata.theaterId,
      movieId,
      movieTitle: title,
      movieStatus:
        before?.movieStatus ??
        snapshot.find((s) => s.movieId === movieId)?.movieStatus ??
        "draft",
      status: "active",
      lastUpdated: now,
    });
    const kind = !before
      ? "add"
      : imported.every((field) => before[field] === after[field])
        ? "unchanged"
        : "update";
    entries.push({
      kind,
      sourceRow: d.sourceRow,
      original: row,
      before: before ?? null,
      after: kind === "unchanged" ? before! : after,
      reason: d.reason,
      suggestedMovieStatus: d.suggestedMovieStatus,
      movieStatusReason: d.movieStatusReason,
      excluded: false,
    });
  }
  if (!entries.some((e) => e.kind === "ambiguous")) {
    for (const row of snapshot)
      if (!used.has(row.id) && row.status !== "archived")
        entries.push({
          kind: "archive",
          sourceRow: null,
          original: null,
          before: row,
          after: { ...row, status: "archived", lastUpdated: now },
          reason: "Missing from the full theater schedule.",
          excluded: false,
        });
  }
  const blockers = finalBlockers(snapshot, entries);
  // Never include destructive archival while a match or final identity is uncertain.
  const safe = blockers.length
    ? entries.filter((e) => e.kind !== "archive")
    : entries;
  return {
    ...metadata,
    entries: safe,
    blockers,
    ...(entries.some((e) => e.kind === "ambiguous")
      ? { existingShowtimes: snapshot }
      : {}),
  };
}
export function revisePreview(
  preview: Preview,
  snapshot: Showtime[],
  edits: z.infer<typeof reviewSchema>["edits"],
): Preview {
  const entries = structuredClone(preview.entries);
  if (new Set(edits.map((e) => e.index)).size !== edits.length)
    throw new AppError(400, "Edit each proposal once.");
  const movieStatuses = new Map<string, Showtime["movieStatus"]>();
  for (const edit of edits) {
    const entry = entries[edit.index];
    if (!entry) throw new AppError(400, "Unknown preview entry.");
    if (entry.kind === "ambiguous" && !entry.after && entry.original)
      entry.after = sourceDraft(entry.original, preview.theaterId);
    if (edit.fields && Object.keys(edit.fields).length) {
      if (!entry.after || entry.kind === "archive")
        throw new AppError(400, "This proposal cannot be edited.");
      entry.after = showtimeSchema.parse({ ...entry.after, ...edit.fields });
    }
    if (edit.resolution) {
      if (entry.kind === "ambiguous") {
        if (!entry.after)
          throw new AppError(400, "This row has no editable source values.");
        const draft = entry.after;
        if (edit.resolution.kind === "match") {
          const showtimeId = edit.resolution.showtimeId;
          const before = snapshot.find(
            (row) =>
              row.id === showtimeId && row.theaterId === preview.theaterId,
          );
          if (!before)
            throw new AppError(
              400,
              "Choose an existing screening from this theater.",
            );
          entry.before = before;
          entry.after = showtimeSchema.parse({
            ...draft,
            id: before.id,
            movieId: before.movieId,
            movieTitle: before.movieTitle,
            movieStatus: edit.fields?.movieStatus ?? before.movieStatus,
          });
        } else {
          const catalog = [
            ...new Map(
              [
                ...snapshot,
                ...entries
                  .filter(
                    (other) =>
                      other !== entry &&
                      !other.excluded &&
                      other.kind !== "ambiguous" &&
                      other.after,
                  )
                  .map((other) => other.after!),
              ].map((row) => [row.movieId, row]),
            ).values(),
          ];
          const movies = catalog.filter(
            (row) => nameKey(row.movieTitle) === nameKey(draft.partnerTitle),
          );
          if (movies.length > 1)
            throw new AppError(
              400,
              "Movie title has multiple identities; select an existing screening instead.",
            );
          const movie = movies[0];
          entry.before = null;
          entry.after = showtimeSchema.parse({
            ...draft,
            id: snapshot.some((row) => row.id === draft.id)
              ? randomUUID()
              : draft.id,
            movieId: movie?.movieId ?? draft.movieId,
            movieTitle: movie?.movieTitle ?? draft.partnerTitle,
            movieStatus:
              edit.fields?.movieStatus ??
              movie?.movieStatus ??
              draft.movieStatus,
          });
        }
        entry.kind = entry.before ? "update" : "add";
        entry.reason = `${entry.reason.slice(0, 400)} Resolved by the reviewer.`;
      } else if (
        !(edit.resolution.kind === "new" && entry.kind === "add") &&
        !(
          edit.resolution.kind === "match" &&
          entry.before?.id === edit.resolution.showtimeId
        )
      ) {
        throw new AppError(
          400,
          "An existing proposal's identity cannot be changed.",
        );
      }
    }
    if (entry.after && entry.kind !== "ambiguous" && entry.kind !== "archive")
      entry.kind = !entry.before
        ? "add"
        : imported.every((key) => entry.before![key] === entry.after![key])
          ? "unchanged"
          : "update";
    const movieId = entry.after?.movieId;
    const status = edit.fields?.movieStatus;
    if (movieId && status && entry.kind !== "ambiguous") {
      if (movieStatuses.has(movieId) && movieStatuses.get(movieId) !== status)
        throw new AppError(
          400,
          "Choose one review status for all showtimes of the same movie.",
        );
      movieStatuses.set(movieId, status);
    }
    entry.excluded = edit.excluded ?? entry.excluded;
  }
  for (const entry of entries) {
    if (!entry.after || entry.kind === "archive" || entry.kind === "ambiguous")
      continue;
    const status = movieStatuses.get(entry.after.movieId);
    if (!status) continue;
    entry.after = { ...entry.after, movieStatus: status };
    entry.kind = !entry.before
      ? "add"
      : imported.every((key) => entry.before![key] === entry.after![key])
        ? "unchanged"
        : "update";
  }
  const blockers = finalBlockers(snapshot, entries);
  if (blockers.length)
    for (const e of entries) if (e.kind === "archive") e.excluded = true;
  return { ...preview, entries, blockers };
}
