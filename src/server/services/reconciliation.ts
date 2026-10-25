import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "../database";
import { theaters } from "../schema/theaters";
import { movies } from "../schema/movies";
import { showtimes } from "../schema/showtimes";
import { AppError } from "../errors";
import { csvHeaders, parseCsv, uniqueRows } from "../utils/csv";
import { exactHeaders } from "../utils/headers";
import { mapHeaders } from "../ai/headers";
import { readCapabilities } from "./auditoriums";
import { validateAssignments } from "../utils/auditoriums";
import {
  compilePreview,
  exactProposal,
  finalBlockers,
  revisePreview,
} from "../utils/reconciliation";
import { readPreview } from "../utils/preview";
import { showtimeSchema } from "../../features/reconciliation/schemas";
import { nameKey } from "../utils/reconciliation";
import { generateProposal } from "../ai/model";
import { assertAccess, requireUser } from "./users";
import {
  readSnapshot,
  lockTheater,
  advanceRevision,
  assertRevision,
} from "./schedule";
import type {
  Preview,
  reviewSchema,
} from "../../features/reconciliation/schemas";

async function snapshotFor(db: Database, personaId: string, theaterId: string) {
  return db.transaction(
    async (tx) => {
      const user = await requireUser(tx, personaId);
      assertAccess(user, theaterId, true);
      const [theater] = await tx
        .select()
        .from(theaters)
        .where(eq(theaters.id, theaterId));
      if (!theater) throw new AppError(404, "Theater not found.");
      return {
        theater,
        rows: await readSnapshot(tx, theaterId),
        capabilities: await readCapabilities(tx, theaterId),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function createPreview(
  db: Database,
  personaId: string,
  theaterId: string,
  bytes: Uint8Array,
  signal: AbortSignal,
) {
  const snapshot = await snapshotFor(db, personaId, theaterId);
  const headers = csvHeaders(bytes);
  const mapping = exactHeaders(headers) ?? (await mapHeaders(headers, signal));
  const rows = uniqueRows(parseCsv(bytes, mapping));
  if (rows.some((row) => row.theaterName !== snapshot.theater.name))
    throw new AppError(
      400,
      "Every CSV record must belong to the selected theater.",
    );
  const exact = exactProposal(rows, snapshot.rows);
  const generated = exact
    ? { proposal: exact, model: "not-required" }
    : await generateProposal(
        rows,
        snapshot.rows,
        signal,
        snapshot.capabilities,
      );
  const compiled = compilePreview(rows, snapshot.rows, generated.proposal, {
    personaId,
    theaterId,
    revision: snapshot.theater.revision,
    model: generated.model,
    headerMappings: headers.flatMap((from, i) =>
      from === mapping[i] ? [] : [{ from, to: mapping[i]! }],
    ),
  });
  const preview = validateAssignments(
    compiled,
    snapshot.capabilities.auditoriums,
    snapshot.capabilities.movies,
  );
  return readPreview(preview, personaId, theaterId);
}
export async function reviewPreview(
  db: Database,
  personaId: string,
  theaterId: string,
  input: z.infer<typeof reviewSchema>,
) {
  const preview = readPreview(input.preview, personaId, theaterId);
  const snapshot = await snapshotFor(db, personaId, theaterId);
  assertRevision(snapshot.theater.revision, preview.revision);
  const revised = revisePreview(preview, snapshot.rows, input.edits);
  validateChanges(revised, snapshot.rows);
  return readPreview(
    validateAssignments(
      revised,
      snapshot.capabilities.auditoriums,
      snapshot.capabilities.movies,
    ),
    personaId,
    theaterId,
  );
}
export function validateChanges(
  preview: Preview,
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
) {
  const known = new Map(snapshot.map((s) => [s.id, s]));
  const used = new Set<string>();
  const included = preview.entries.filter(
    (e) => !e.excluded && e.kind !== "ambiguous",
  );
  const changes = included.filter((e) => e.kind !== "unchanged");
  const movieStatuses = new Map<string, string>();
  for (const entry of included) {
    if (!entry.after || entry.kind === "archive") continue;
    const { movieId, movieStatus } = entry.after;
    if (
      movieStatuses.has(movieId) &&
      movieStatuses.get(movieId) !== movieStatus
    )
      throw new AppError(
        400,
        "Choose one review status for all showtimes of the same movie.",
      );
    movieStatuses.set(movieId, movieStatus);
  }
  for (const entry of included) {
    const after = entry.after;
    if (!after || after.theaterId !== preview.theaterId || used.has(after.id))
      throw new AppError(400, "Invalid preview target.");
    used.add(after.id);
    if (entry.kind === "add") {
      if (entry.before || known.has(after.id) || after.status !== "active")
        throw new AppError(
          409,
          "Invalid addition or screening already exists.",
        );
      const movie = snapshot.find((s) => s.movieId === after.movieId);
      if (movie && after.movieTitle !== movie.movieTitle)
        throw new AppError(400, "Import cannot change movie identity.");
      if (
        !movie &&
        snapshot.some(
          (s) => nameKey(s.movieTitle) === nameKey(after.movieTitle),
        )
      )
        throw new AppError(409, "Reuse the existing movie identity.");
      if (
        changes.some(
          (e) =>
            e.kind === "add" &&
            e.after &&
            e.after.movieId !== after.movieId &&
            nameKey(e.after.movieTitle) === nameKey(after.movieTitle),
        )
      )
        throw new AppError(
          409,
          "New screenings of the same title must reuse one movie identity.",
        );
      const other = changes.find(
        (e) => e !== entry && e.after?.movieId === after.movieId,
      );
      if (other?.after && other.after.movieTitle !== after.movieTitle)
        throw new AppError(400, "Inconsistent movie identity.");
      continue;
    }
    const actual = known.get(after.id);
    const fields = showtimeSchema.keyof().options;
    if (
      !actual ||
      !entry.before ||
      fields.some((key) => actual[key] !== entry.before![key])
    )
      throw new AppError(409, "Reviewed screening changed; upload again.");
    const immutable = ["id", "theaterId", "movieId", "movieTitle"] as const;
    if (immutable.some((key) => actual[key] !== after[key]))
      throw new AppError(400, "Import cannot change screening identity.");
    if (
      entry.kind === "archive" &&
      (after.status !== "archived" ||
        fields.some(
          (key) =>
            key !== "status" &&
            key !== "lastUpdated" &&
            actual[key] !== after[key],
        ))
    )
      throw new AppError(400, "Archival cannot modify unrelated fields.");
    if (entry.kind === "update" && after.status !== "active")
      throw new AppError(400, "Import updates must be active screenings.");
    if (
      entry.kind === "unchanged" &&
      fields.some((key) => actual[key] !== after[key])
    )
      throw new AppError(400, "Unchanged entries must match the database.");
  }
  return changes;
}
export function validateConfirmation(
  preview: Preview,
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
) {
  const changes = validateChanges(preview, snapshot);
  // Recompute final identities from actual DB rows plus validated writes, not client 'unchanged' rows.
  const candidates = [
    ...changes,
    ...preview.entries.filter((e) => e.kind === "ambiguous"),
  ];
  if (preview.blockers.length || finalBlockers(snapshot, candidates).length)
    throw new AppError(409, "Resolve preview blockers before confirming.");
  return changes;
}
export async function confirmPreview(
  db: Database,
  personaId: string,
  theaterId: string,
  input: Preview,
) {
  const preview = readPreview(input, personaId, theaterId);
  return db.transaction(async (tx) => {
    const theater = await lockTheater(tx, personaId, theaterId);
    assertRevision(theater.revision, preview.revision);
    const capabilities = await readCapabilities(tx, theaterId);
    const checked = validateAssignments(
      preview,
      capabilities.auditoriums,
      capabilities.movies,
    );
    const snapshot = await readSnapshot(tx, theaterId);
    const changes = validateConfirmation(checked, snapshot);
    if (!changes.length) throw new AppError(409, "No changes to confirm.");
    // Deactivate affected rows before reactivation, preserving the partial unique index during swaps.
    for (const entry of changes)
      if (entry.before)
        await tx
          .update(showtimes)
          .set({ status: "inactive" })
          .where(
            and(
              eq(showtimes.id, entry.before.id),
              eq(showtimes.theaterId, theaterId),
            ),
          );
    for (const entry of changes) {
      const after = entry.after!;
      if (entry.kind === "add") {
        await tx
          .insert(movies)
          .values({
            id: after.movieId,
            theaterId,
            title: after.movieTitle,
            movieStatus: after.movieStatus,
            supportedFormats: [
              ...new Set(
                changes
                  .filter(
                    (e) =>
                      e.kind === "add" && e.after?.movieId === after.movieId,
                  )
                  .map((e) => e.after!.format),
              ),
            ],
          })
          .onConflictDoNothing();
        const [movie] = await tx
          .select()
          .from(movies)
          .where(eq(movies.id, after.movieId));
        if (
          !movie ||
          movie.theaterId !== theaterId ||
          movie.title !== after.movieTitle
        )
          throw new AppError(409, "Movie identity conflict.");
      }
      const {
        movieTitle: _title,
        movieStatus: _status,
        auditorium,
        ...record
      } = after;
      void _title;
      void _status;
      const room = capabilities.auditoriums.find((r) => r.name === auditorium);
      if (!room) throw new AppError(409, "Auditorium no longer exists.");
      const values = {
        ...record,
        auditoriumId: room.id,
        lastUpdated: new Date().toISOString(),
      };
      if (entry.kind === "add") await tx.insert(showtimes).values(values);
      else
        await tx
          .update(showtimes)
          .set(values)
          .where(
            and(eq(showtimes.id, after.id), eq(showtimes.theaterId, theaterId)),
          );
    }
    // Movie review status belongs to the movie, including screenings not in this upload.
    const updatedMovies = new Set<string>();
    for (const entry of changes) {
      const after = entry.after!;
      if (entry.kind === "archive" || updatedMovies.has(after.movieId))
        continue;
      updatedMovies.add(after.movieId);
      const existing = snapshot.find((s) => s.movieId === after.movieId);
      if (existing && existing.movieStatus !== after.movieStatus)
        await tx
          .update(movies)
          .set({ movieStatus: after.movieStatus })
          .where(
            and(eq(movies.id, after.movieId), eq(movies.theaterId, theaterId)),
          );
    }
    await advanceRevision(tx, theaterId);
    return {
      added: changes.filter((e) => e.kind === "add").length,
      updated: changes.filter((e) => e.kind === "update").length,
      archived: changes.filter((e) => e.kind === "archive").length,
      revision: theater.revision + 1,
    };
  });
}
