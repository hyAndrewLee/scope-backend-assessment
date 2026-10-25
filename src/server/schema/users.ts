import { pgTable, text, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "viewer"] }).notNull(),
    allTheaters: boolean("all_theaters").notNull().default(false),
  },
  (t) => [check("users_role", sql`${t.role} in ('admin','viewer')`)],
);
