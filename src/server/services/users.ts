import { eq, asc } from "drizzle-orm";
import type { Database } from "../database";
import { users } from "../schema/users";
import { userTheaters } from "../schema/user-theaters";
import { AppError } from "../errors";
import { userSchema, type User } from "../../features/reconciliation/schemas";

export async function listUsers(db: Database) {
  const records = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      allTheaters: users.allTheaters,
    })
    .from(users)
    .orderBy(asc(users.name))
    .limit(100);

  const memberships = await db.select().from(userTheaters);

  return records.map((user) =>
    userSchema.parse({
      ...user,
      theaterIds: memberships
        .filter((m) => m.userId === user.id)
        .map((m) => m.theaterId),
    }),
  );
}

export async function requireUser(db: Database, id: string | null) {
  if (!id) throw new AppError(401, "Select a demo persona.");
  const [user] = await db.select().from(users).where(eq(users.id, id));

  if (!user) throw new AppError(401, "Unknown demo persona.");
  const memberships = await db
    .select()
    .from(userTheaters)
    .where(eq(userTheaters.userId, id));

  return userSchema.parse({
    ...user,
    theaterIds: memberships.map((m) => m.theaterId),
  });
}

export function assertAccess(user: User, theaterId: string, write = false) {
  if (
    (write && user.role !== "admin") ||
    (!user.allTheaters && !user.theaterIds.includes(theaterId))
  )
    throw new AppError(
      403,
      "This persona cannot access this operation or theater.",
    );
}
