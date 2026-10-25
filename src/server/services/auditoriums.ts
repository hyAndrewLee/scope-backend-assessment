import { eq } from "drizzle-orm";
import type { Database } from "../database";
import { auditoriums } from "../schema/auditoriums";
import { movies } from "../schema/movies";
import { AppError } from "../errors";
import { auditoriumSchema } from "../../features/reconciliation/schemas";
import { z } from "zod";

// Internal reads: callers have already checked theater access in their transaction.
export async function readCapabilities(db: Database, theaterId: string) {
  const rooms = await db
    .select()
    .from(auditoriums)
    .where(eq(auditoriums.theaterId, theaterId))
    .limit(101);
  if (rooms.length > 100)
    throw new AppError(
      413,
      "Auditorium context limit exceeded; nothing was truncated.",
    );
  const catalog = await db
    .select({
      id: movies.id,
      title: movies.title,
      supportedFormats: movies.supportedFormats,
    })
    .from(movies)
    .where(eq(movies.theaterId, theaterId))
    .limit(201);
  if (catalog.length > 200)
    throw new AppError(
      413,
      "Movie context limit exceeded; nothing was truncated.",
    );
  return {
    auditoriums: rooms.map((room) => auditoriumSchema.parse(room)),
    movies: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          supportedFormats: z.array(z.enum(["2D", "3D", "IMAX"])).min(1),
        }),
      )
      .parse(catalog),
  };
}
