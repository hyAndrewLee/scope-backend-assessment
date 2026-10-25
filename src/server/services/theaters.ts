import { asc, inArray } from "drizzle-orm";
import type { Database } from "../database";
import { theaters } from "../schema/theaters";
import type { User } from "../../features/reconciliation/schemas";

export async function listTheaters(db: Database, user: User) {
  if (!user.allTheaters && !user.theaterIds.length) return [];

  return db
    .select({
      id: theaters.id,
      name: theaters.name,
      location: theaters.location,
      timezone: theaters.timezone,
    })
    .from(theaters)
    .where(user.allTheaters ? undefined : inArray(theaters.id, user.theaterIds))
    .orderBy(asc(theaters.name));
}
