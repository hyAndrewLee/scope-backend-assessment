import {
  pgTable,
  text,
  timestamp,
  foreignKey,
  uniqueIndex,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { movies } from "./movies";
import { auditoriums } from "./auditoriums";
export const showtimes = pgTable(
  "showtimes",
  {
    id: text("id").primaryKey(),
    theaterId: text("theater_id").notNull(),
    movieId: text("movie_id").notNull(),
    partnerTitle: text("partner_title").notNull(),
    auditoriumId: text("auditorium_id").notNull(),
    startTime: timestamp("start_time", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    endTime: timestamp("end_time", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    language: text("language").notNull(),
    format: text("format").notNull(),
    rating: text("rating").notNull(),
    partnerLastUpdated: timestamp("partner_last_updated", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastUpdated: timestamp("last_updated", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    status: text("status", {
      enum: ["active", "inactive", "archived"],
    }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.theaterId, t.movieId],
      foreignColumns: [movies.theaterId, movies.id],
    }),
    foreignKey({
      columns: [t.theaterId, t.auditoriumId],
      foreignColumns: [auditoriums.theaterId, auditoriums.id],
    }),
    uniqueIndex("showtimes_active_identity")
      .on(t.theaterId, t.movieId, t.startTime)
      .where(sql`${t.status} = 'active'`),
    index("showtimes_theater_start").on(t.theaterId, t.startTime, t.id),
    check("showtimes_time_order", sql`${t.endTime} > ${t.startTime}`),
    check(
      "showtimes_status",
      sql`${t.status} in ('active','inactive','archived')`,
    ),
    check("showtimes_language", sql`${t.language} in ('EN','KO','JA','FR')`),
    check("showtimes_format", sql`${t.format} in ('2D','3D','IMAX')`),
    check(
      "showtimes_rating",
      sql`${t.rating} in ('G','PG','PG-13','R','NC-17','NR')`,
    ),
    check("showtimes_names", sql`length(${t.partnerTitle}) between 1 and 256`),
  ],
);
