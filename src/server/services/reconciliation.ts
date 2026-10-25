import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "../database";
import { theaters } from "../schema/theaters";
import { movies } from "../schema/movies";
import { showtimes } from "../schema/showtimes";
import { getSettings } from "../../env.js";
import { AppError } from "../errors";
import { parseCsv, uniqueRows } from "../utils/csv";
import {
  compilePreview,
  exactProposal,
  finalBlockers,
  revisePreview,
} from "../utils/reconciliation";
import { signPreview, verifyPreview } from "../utils/preview";
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
  SignedPreview,
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
      return { theater, rows: await readSnapshot(tx, theaterId) };
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
  const rows = uniqueRows(parseCsv(bytes));
  const snapshot = await snapshotFor(db, personaId, theaterId);
  if (rows.some((row) => row.theaterName !== snapshot.theater.name))
    throw new AppError(
      400,
      "Every CSV record must belong to the selected theater.",
    );
  const exact = exactProposal(rows, snapshot.rows);
  const generated = exact
    ? { proposal: exact, model: "not-required" }
    : await generateProposal(rows, snapshot.rows, signal);
  const preview = compilePreview(rows, snapshot.rows, generated.proposal, {
    personaId,
    theaterId,
    revision: snapshot.theater.revision,
    expiresAt: Date.now() + 15 * 60000,
    model: generated.model,
  });
  return signPreview(preview, getSettings().PREVIEW_SIGNING_SECRET);
}
export async function reviewPreview(
  db: Database,
  personaId: string,
  theaterId: string,
  input: z.infer<typeof reviewSchema>,
) {
  const secret = getSettings().PREVIEW_SIGNING_SECRET;
  const preview = verifyPreview(input.preview, secret, personaId, theaterId);
  const snapshot = await snapshotFor(db, personaId, theaterId);
  assertRevision(snapshot.theater.revision, preview.revision);
  return signPreview(
    revisePreview(preview, snapshot.rows, input.edits),
    secret,
  );
}
export function validateConfirmation(
  preview: Preview,
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
) {
  if (
    preview.blockers.length ||
    finalBlockers(snapshot, preview.entries).length
  )
    throw new AppError(409, "Resolve preview blockers before confirming.");
  const known = new Map(snapshot.map((s) => [s.id, s]));
  const used = new Set<string>();
  const changes = preview.entries.filter(
    (e) => !e.excluded && ["add", "update", "archive"].includes(e.kind),
  );
  for (const entry of changes) {
    const after = entry.after;
    if (!after || after.theaterId !== preview.theaterId || used.has(after.id))
      throw new AppError(400, "Invalid preview target.");
    used.add(after.id);
    if (entry.kind === "add") {
      if (known.has(after.id))
        throw new AppError(409, "Preview addition already exists.");
    } else if (
      !entry.before ||
      JSON.stringify(known.get(after.id)) !== JSON.stringify(entry.before)
    ) {
      throw new AppError(409, "Reviewed screening changed; upload again.");
    }
  }
  return changes;
}
export async function confirmPreview(
  db: Database,
  personaId: string,
  theaterId: string,
  token: SignedPreview,
) {
  const preview = verifyPreview(
    token,
    getSettings().PREVIEW_SIGNING_SECRET,
    personaId,
    theaterId,
  );
  return db.transaction(async (tx) => {
    const theater = await lockTheater(tx, personaId, theaterId);
    assertRevision(theater.revision, preview.revision);
    const changes = validateConfirmation(
      preview,
      await readSnapshot(tx, theaterId),
    );
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
      const { movieTitle: _title, movieStatus: _status, ...values } = after;
      void _title;
      void _status;
      values.lastUpdated = new Date().toISOString();
      if (entry.kind === "add") await tx.insert(showtimes).values(values);
      else
        await tx
          .update(showtimes)
          .set(values)
          .where(
            and(eq(showtimes.id, after.id), eq(showtimes.theaterId, theaterId)),
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
