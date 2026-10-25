import { pgTable, text, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { theaters } from "./theaters";

export const auditoriums = pgTable(
  "auditoriums",
  {
    id: text("id").primaryKey(),
    theaterId: text("theater_id")
      .notNull()
      .references(() => theaters.id),
    name: text("name").notNull(),
    supportedFormats: text("supported_formats").array().notNull(),
  },
  (t) => [
    unique("auditoriums_theater_identity").on(t.theaterId, t.id),
    unique("auditoriums_theater_name").on(t.theaterId, t.name),
    check(
      "auditoriums_formats",
      sql`cardinality(${t.supportedFormats}) > 0 and ${t.supportedFormats} <@ ARRAY['2D','3D','IMAX']::text[]`,
    ),
  ],
);
