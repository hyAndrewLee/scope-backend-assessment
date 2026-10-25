import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/server/database";
import { getSettings } from "../src/env.js";
import { assessmentData } from "../src/data/assessment-data";
import { users } from "../src/server/schema/users";
import { theaters } from "../src/server/schema/theaters";
import { userTheaters } from "../src/server/schema/user-theaters";
import { movies } from "../src/server/schema/movies";
import { showtimes } from "../src/server/schema/showtimes";
import {
  showtimeSchema,
  type Showtime,
} from "../src/features/reconciliation/schemas";
const settings = getSettings();
const { client, db } = createDatabase(
  settings.DATABASE_URL,
  settings.DATABASE_SSL_CA,
);
try {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(721981)`);
    for (const table of [users, theaters, movies, showtimes]) {
      if ((await tx.select({ id: table.id }).from(table).limit(1)).length)
        throw new Error(
          "Seed requires empty application tables; existing data was not changed.",
        );
    }
    await tx.insert(theaters).values(assessmentData.theaters);
    await tx
      .insert(users)
      .values(
        assessmentData.users.map(({ theaterIds, ...user }) => ({
          ...user,
          allTheaters: theaterIds.length === assessmentData.theaters.length,
        })),
      );
    const memberships = assessmentData.users.flatMap((u) =>
      u.theaterIds.map((theaterId) => ({ userId: u.id, theaterId })),
    );
    await tx.insert(userTheaters).values(memberships);
    const catalog = new Map<
      string,
      {
        id: string;
        theaterId: string;
        title: string;
        movieStatus: Showtime["movieStatus"];
      }
    >();
    // The starter gives Dune different per-screening statuses. Preserve the more restrictive movie status.
    const priority = { approved: 0, draft: 1, "needs-review": 2, flagged: 3 };
    for (const row of assessmentData.showtimes) {
      const key = `${row.theaterId}:${row.movieTitle}`;
      const existing = catalog.get(key);
      if (!existing)
        catalog.set(key, {
          id: randomUUID(),
          theaterId: row.theaterId,
          title: row.movieTitle,
          movieStatus: row.movieStatus!,
        });
      else if (priority[row.movieStatus!] > priority[existing.movieStatus])
        existing.movieStatus = row.movieStatus!;
    }
    await tx.insert(movies).values([...catalog.values()]);
    for (const row of assessmentData.showtimes) {
      const movie = catalog.get(`${row.theaterId}:${row.movieTitle}`)!;
      const parsed = showtimeSchema.parse({
        ...row,
        movieId: movie.id,
        movieStatus: movie.movieStatus,
        partnerTitle: row.movieTitle,
        partnerLastUpdated: row.lastUpdated,
      });
      const { movieTitle: _title, movieStatus: _status, ...record } = parsed;
      void _title;
      void _status;
      await tx.insert(showtimes).values(record);
    }
  });
  console.log("Starter records seeded into hosted database once.");
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith("Seed requires")
      ? error.message
      : "Seed failed; transaction rolled back. Check schema, records, and server role.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
