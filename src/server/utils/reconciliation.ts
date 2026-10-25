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
    if (entry.kind === "ambiguous")
      blockers.push(
        `CSV row ${(entry.sourceRow ?? 0) + 2}: resolve or exclude the uncertain match.`,
      );
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
  const newMovies = new Map<string, string>();
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
        after: null,
        reason: d.reason,
        excluded: false,
      });
      continue;
    }
    const before =
      d.kind === "match" && d.showtimeId ? known.get(d.showtimeId) : undefined;
    if (d.kind === "match" && (!before || used.has(before.id)))
      throw new AppError(
        502,
        "Model referenced an unknown or repeated screening.",
      );
    if (d.movieId && !catalog.has(d.movieId))
      throw new AppError(502, "Model referenced a foreign movie.");
    if (before) used.add(before.id);
    const title =
      before?.movieTitle ??
      (d.movieId ? catalog.get(d.movieId)! : (d.title ?? row.movieTitle));
    const canonicalId = [...catalog].find(
      ([, t]) => nameKey(t) === nameKey(title),
    )?.[0];
    if (!before && !d.movieId && canonicalId)
      throw new AppError(502, "Model must reuse the known movie identity.");
    const movieId =
      before?.movieId ??
      d.movieId ??
      newMovies.get(nameKey(title)) ??
      randomUUID();
    newMovies.set(nameKey(title), movieId);
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
  return { ...metadata, entries: safe, blockers };
}
export function revisePreview(
  preview: Preview,
  snapshot: Showtime[],
  edits: z.infer<typeof reviewSchema>["edits"],
): Preview {
  const entries = structuredClone(preview.entries);
  if (new Set(edits.map((e) => e.index)).size !== edits.length)
    throw new AppError(400, "Edit each proposal once.");
  for (const edit of edits) {
    const entry = entries[edit.index];
    if (!entry) throw new AppError(400, "Unknown preview entry.");
    if (edit.fields && Object.keys(edit.fields).length) {
      if (!entry.after || !["add", "update", "unchanged"].includes(entry.kind))
        throw new AppError(400, "This proposal cannot be edited.");
      entry.after = showtimeSchema.parse({ ...entry.after, ...edit.fields });
      entry.kind = !entry.before
        ? "add"
        : imported.every((key) => entry.before![key] === entry.after![key])
          ? "unchanged"
          : "update";
    }
    entry.excluded = edit.excluded ?? entry.excluded;
  }
  const blockers = finalBlockers(snapshot, entries);
  if (blockers.length)
    for (const e of entries) if (e.kind === "archive") e.excluded = true;
  return { ...preview, entries, blockers };
}
