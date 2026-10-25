import { and, asc, desc, eq, gte, ilike, inArray, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Database } from "../database";
import { movies } from "../schema/movies";
import { theaters } from "../schema/theaters";
import { showtimes } from "../schema/showtimes";
import { auditoriums } from "../schema/auditoriums";
import { supportsProjection } from "../utils/auditoriums";
import { requireUser, assertAccess } from "./users";
import { AppError } from "../errors";
import {
  showtimeSchema,
  type Filters,
  type User,
  type Showtime,
} from "../../features/reconciliation/schemas";

const iso = (column: AnyPgColumn) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const columns = {
  id: showtimes.id,
  theaterId: showtimes.theaterId,
  movieId: showtimes.movieId,
  movieTitle: movies.title,
  movieStatus: movies.movieStatus,
  partnerTitle: showtimes.partnerTitle,
  auditorium: auditoriums.name,
  startTime: iso(showtimes.startTime),
  endTime: iso(showtimes.endTime),
  language: showtimes.language,
  format: showtimes.format,
  rating: showtimes.rating,
  partnerLastUpdated: iso(showtimes.partnerLastUpdated),
  lastUpdated: iso(showtimes.lastUpdated),
  status: showtimes.status,
};
export function assertRevision(actual: number, expected: number) {
  if (actual !== expected)
    throw new AppError(
      409,
      "Schedule changed; refresh and generate a new preview.",
    );
}
export async function lockTheater(
  db: Database,
  userId: string,
  theaterId: string,
) {
  const [theater] = await db
    .select()
    .from(theaters)
    .where(eq(theaters.id, theaterId))
    .for("update");
  if (!theater) throw new AppError(404, "Theater not found.");
  const user = await requireUser(db, userId);
  assertAccess(user, theaterId, true);
  return theater;
}
export async function advanceRevision(db: Database, theaterId: string) {
  await db
    .update(theaters)
    .set({ revision: sql`${theaters.revision} + 1` })
    .where(eq(theaters.id, theaterId));
}
export async function readSnapshot(db: Database, theaterId: string) {
  const rows = await db
    .select(columns)
    .from(showtimes)
    .innerJoin(movies, eq(movies.id, showtimes.movieId))
    .innerJoin(auditoriums, eq(auditoriums.id, showtimes.auditoriumId))
    .where(eq(showtimes.theaterId, theaterId))
    .orderBy(showtimes.id)
    .limit(201);
  // ponytail: bounded full-schedule imports; use candidate retrieval/batching for larger imports.
  if (rows.length > 200)
    throw new AppError(
      413,
      "Full-schedule reconciliation supports at most 200 saved screenings; nothing was truncated.",
    );
  return rows.map((row) => showtimeSchema.parse(row));
}
export async function readSchedule(db: Database, user: User, q: Filters) {
  if (user.role !== "admin" && (q.movieStatus || q.sort === "movieStatus"))
    throw new AppError(403, "Review status is admin-only.");
  if (q.theaterId !== "all") assertAccess(user, q.theaterId);
  const scope =
    q.theaterId !== "all"
      ? eq(showtimes.theaterId, q.theaterId)
      : user.allTheaters
        ? undefined
        : user.theaterIds.length
          ? inArray(showtimes.theaterId, user.theaterIds)
          : sql`false`;
  const where = and(
    scope,
    q.search
      ? ilike(movies.title, `%${q.search.replace(/[\\%_]/g, "\\$&")}%`)
      : undefined,
    q.status !== "all" ? eq(showtimes.status, q.status) : undefined,
    ...(["format", "language", "rating"] as const).map((key) =>
      q[key] ? eq(showtimes[key], q[key]) : undefined,
    ),
    q.auditorium ? eq(auditoriums.name, q.auditorium) : undefined,
    q.movieStatus ? eq(movies.movieStatus, q.movieStatus) : undefined,
    q.startDate
      ? gte(showtimes.startTime, `${q.startDate}T00:00:00Z`)
      : undefined,
    q.endDate
      ? lt(
          showtimes.startTime,
          new Date(
            Date.parse(`${q.endDate}T00:00:00Z`) + 86400000,
          ).toISOString(),
        )
      : undefined,
  );
  const sorts = {
    movieTitle: movies.title,
    movieStatus: movies.movieStatus,
    theaterName: theaters.name,
    startTime: showtimes.startTime,
    endTime: showtimes.endTime,
    lastUpdated: showtimes.lastUpdated,
  };
  return db.transaction(
    async (tx) => {
      const [counts] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          activeCount: sql<number>`count(*) filter (where ${showtimes.status} = 'active')::int`,
        })
        .from(showtimes)
        .innerJoin(movies, eq(movies.id, showtimes.movieId))
        .innerJoin(auditoriums, eq(auditoriums.id, showtimes.auditoriumId))
        .where(where);
      const rows = await tx
        .select(columns)
        .from(showtimes)
        .innerJoin(movies, eq(movies.id, showtimes.movieId))
        .innerJoin(auditoriums, eq(auditoriums.id, showtimes.auditoriumId))
        .innerJoin(theaters, eq(theaters.id, showtimes.theaterId))
        .where(where)
        .orderBy(
          (q.order === "asc" ? asc : desc)(sorts[q.sort]),
          asc(showtimes.id),
        )
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize);
      const options = {
        formats: [] as string[],
        languages: [] as string[],
        ratings: [] as string[],
        auditoriums: [] as string[],
        movieStatuses: [] as string[],
      };
      for (const [key, column] of Object.entries({
        formats: showtimes.format,
        languages: showtimes.language,
        ratings: showtimes.rating,
        auditoriums: auditoriums.name,
        movieStatuses: movies.movieStatus,
      })) {
        if (key === "movieStatuses" && user.role !== "admin") continue;
        const values = await tx
          .selectDistinct({ value: column })
          .from(showtimes)
          .innerJoin(movies, eq(movies.id, showtimes.movieId))
          .innerJoin(auditoriums, eq(auditoriums.id, showtimes.auditoriumId))
          .where(scope)
          .orderBy(column)
          .limit(100);
        options[key as keyof typeof options] = values.map((row) => row.value);
      }
      return {
        ...counts,
        page: q.page,
        pageSize: q.pageSize,
        options,
        showtimes: rows.map((row) => {
          const parsed = showtimeSchema.parse(row);
          if (user.role === "admin") return parsed;
          const { movieStatus: _status, ...visible } = parsed;
          void _status;
          return visible;
        }),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function clearSchedule(
  db: Database,
  userId: string,
  theaterId: string,
) {
  return db.transaction(async (tx) => {
    await lockTheater(tx, userId, theaterId);
    const changed = await tx
      .update(showtimes)
      .set({ status: "archived", lastUpdated: new Date().toISOString() })
      .where(
        and(
          eq(showtimes.theaterId, theaterId),
          sql`${showtimes.status} <> 'archived'`,
        ),
      )
      .returning({ id: showtimes.id });
    if (changed.length) await advanceRevision(tx, theaterId);
    return { archived: changed.length };
  });
}
export async function changeStatus(
  db: Database,
  userId: string,
  id: string,
  status: Showtime["status"] | Showtime["movieStatus"],
  kind: "movie" | "showtime",
) {
  return db.transaction(async (tx) => {
    const table = kind === "movie" ? movies : showtimes;
    const [found] = await tx
      .select({ theaterId: table.theaterId })
      .from(table)
      .where(eq(table.id, id));
    if (!found) throw new AppError(404, "Record not found.");
    await lockTheater(tx, userId, found.theaterId);
    if (kind === "showtime" && status === "active") {
      const [projection] = await tx
        .select({
          format: showtimes.format,
          movieFormats: movies.supportedFormats,
          roomFormats: auditoriums.supportedFormats,
        })
        .from(showtimes)
        .innerJoin(movies, eq(movies.id, showtimes.movieId))
        .innerJoin(auditoriums, eq(auditoriums.id, showtimes.auditoriumId))
        .where(eq(showtimes.id, id));
      if (
        !projection ||
        !supportsProjection(
          projection.format,
          projection.movieFormats,
          projection.roomFormats,
        )
      )
        throw new AppError(
          409,
          "Movie and auditorium do not both support this screening format.",
        );
    }
    if (kind === "movie")
      await tx
        .update(movies)
        .set({ movieStatus: status as Showtime["movieStatus"] })
        .where(eq(movies.id, id));
    else
      await tx
        .update(showtimes)
        .set({
          status: status as Showtime["status"],
          lastUpdated: new Date().toISOString(),
        })
        .where(eq(showtimes.id, id));
    await advanceRevision(tx, found.theaterId);
    return { saved: true };
  });
}
