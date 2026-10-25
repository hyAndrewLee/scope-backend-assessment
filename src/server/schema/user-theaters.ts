import { pgTable, text, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { theaters } from "./theaters";
export const userTheaters = pgTable("user_theaters", {
  userId: text("user_id").notNull().references(() => users.id),
  theaterId: text("theater_id").notNull().references(() => theaters.id),
}, (t) => [primaryKey({ columns: [t.userId, t.theaterId] })]);
