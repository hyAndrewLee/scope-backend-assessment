import { pgTable, text, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { theaters } from "./theaters";
export const movies = pgTable("movies", {
  id: text("id").primaryKey(), theaterId: text("theater_id").notNull().references(() => theaters.id),
  title: text("title").notNull(),
  movieStatus: text("movie_status", { enum: ["approved", "draft", "flagged", "needs-review"] }).notNull().default("draft"),
}, (t) => [unique("movies_theater_identity").on(t.theaterId, t.id),
  check("movies_status", sql`${t.movieStatus} in ('approved','draft','flagged','needs-review')`),
  check("movies_title", sql`length(${t.title}) between 1 and 256`),
  index("movies_title_search").using("gin", sql`${t.title} gin_trgm_ops`)]);
