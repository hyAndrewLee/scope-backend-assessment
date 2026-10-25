import { pgTable, text, integer, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const theaters = pgTable(
  "theaters",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    location: text("location").notNull(),
    timezone: text("timezone").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [check("theaters_revision", sql`${t.revision} >= 0`)],
);
