import type { z } from "zod";
import type {
  movieStatusSchema,
  statusSchema,
  theaterSchema,
  schedulePageSchema,
} from "~/features/reconciliation/schemas";

export type UserRole = "admin" | "viewer";

export type ShowtimeStatus = z.infer<typeof statusSchema>;

export type MovieStatus = z.infer<typeof movieStatusSchema>;

export type Theater = z.infer<typeof theaterSchema>;

export interface AssessmentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  theaterIds: string[];
}

// Seed records predate movie IDs; server responses always supply them.
export type Showtime = Omit<
  z.infer<typeof schedulePageSchema>["showtimes"][number],
  "movieId" | "partnerTitle" | "partnerLastUpdated"
> & {
  movieId?: string;
};
