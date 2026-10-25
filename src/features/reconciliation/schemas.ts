import { z } from "zod";

export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/);
export const movieStatusSchema = z.enum([
  "approved",
  "draft",
  "flagged",
  "needs-review",
]);
export const statusSchema = z.enum(["active", "inactive", "archived"]);
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const text = z.string().trim().min(1).max(256);
export const fieldsSchema = z
  .object({
    partnerTitle: text,
    auditorium: text.max(128),
    startTime: instant,
    endTime: instant,
    language: z.enum(["EN", "KO", "JA", "FR"]),
    format: z.enum(["2D", "3D", "IMAX"]),
    rating: z.enum(["G", "PG", "PG-13", "R", "NC-17", "NR"]),
    partnerLastUpdated: instant,
  })
  .strict();
export const showtimeSchema = fieldsSchema
  .extend({
    id: idSchema,
    theaterId: idSchema,
    movieId: idSchema,
    movieTitle: text,
    movieStatus: movieStatusSchema,
    status: statusSchema,
    lastUpdated: instant,
  })
  .refine((row) => row.endTime > row.startTime, "End must follow start.");
export type Showtime = z.infer<typeof showtimeSchema>;
export const userSchema = z.object({
  id: idSchema,
  name: text,
  email: z.string().email().optional(),
  role: z.enum(["admin", "viewer"]),
  allTheaters: z.boolean(),
  theaterIds: z.array(idSchema),
});
export type User = z.infer<typeof userSchema>;
export const theaterSchema = z.object({
  id: idSchema,
  name: text,
  location: text,
  timezone: text,
});
export const filtersSchema = z
  .object({
    theaterId: z.union([z.literal("all"), idSchema]).default("all"),
    search: z.string().trim().max(128).default(""),
    status: z.union([statusSchema, z.literal("all")]).default("all"),
    format: z.string().max(32).default(""),
    language: z.string().max(32).default(""),
    rating: z.string().max(32).default(""),
    auditorium: z.string().max(128).default(""),
    movieStatus: z.union([movieStatusSchema, z.literal("")]).default(""),
    startDate: z.union([z.iso.date(), z.literal("")]).default(""),
    endDate: z.union([z.iso.date(), z.literal("")]).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    sort: z
      .enum([
        "movieTitle",
        "movieStatus",
        "theaterName",
        "startTime",
        "endTime",
        "lastUpdated",
      ])
      .default("startTime"),
    order: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .refine(
    (q) => !q.startDate || !q.endDate || q.endDate >= q.startDate,
    "Invalid date range.",
  );
export type Filters = z.infer<typeof filtersSchema>;
export const csvRowSchema = fieldsSchema
  .omit({ partnerTitle: true })
  .extend({
    movieTitle: text,
    theaterName: text,
  })
  .refine((row) => row.endTime > row.startTime, "End must follow start.");
export type CsvRow = z.infer<typeof csvRowSchema>;
export const proposalSchema = z
  .object({
    decisions: z
      .array(
        z
          .object({
            sourceRow: z.number().int().min(0).max(99),
            kind: z.enum(["match", "add", "ambiguous"]),
            showtimeId: idSchema.nullable(),
            movieId: idSchema.nullable(),
            title: text.nullable(),
            auditorium: text.max(128).nullable(),
            suggestedMovieStatus: movieStatusSchema.nullable().optional(),
            movieStatusReason: text.max(512).nullable().optional(),
            reason: text.max(512),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;
export const entrySchema = z
  .object({
    kind: z.enum(["add", "update", "archive", "unchanged", "ambiguous"]),
    sourceRow: z.number().int().nullable(),
    original: csvRowSchema.nullable(),
    before: showtimeSchema.nullable(),
    after: showtimeSchema.nullable(),
    reason: text.max(512),
    suggestedMovieStatus: movieStatusSchema.nullable().optional(),
    movieStatusReason: text.max(512).nullable().optional(),
    excluded: z.boolean().default(false),
  })
  .strict();
export type Entry = z.infer<typeof entrySchema>;
export const auditoriumSchema = z.object({
  id: idSchema,
  theaterId: idSchema,
  name: text.max(128),
  supportedFormats: z.array(z.enum(["2D", "3D", "IMAX"])).min(1),
});
export type Auditorium = z.infer<typeof auditoriumSchema>;
export const previewSchema = z
  .object({
    personaId: idSchema,
    theaterId: idSchema,
    revision: z.number().int().min(0),
    existingShowtimes: z.array(showtimeSchema).max(200).optional(),
    entries: z.array(entrySchema).max(300),
    blockers: z.array(z.string().max(512)).max(100),
    model: z.string().max(128),
    headerMappings: z
      .array(z.object({ from: z.string().max(64), to: z.string().max(64) }))
      .max(9)
      .optional(),
    capabilities: z
      .object({
        auditoriums: z.array(auditoriumSchema).max(100),
        movies: z
          .array(
            z.object({
              id: idSchema,
              supportedFormats: z.array(z.enum(["2D", "3D", "IMAX"])).min(1),
            }),
          )
          .max(200),
      })
      .optional(),
  })
  .strict();
export type Preview = z.infer<typeof previewSchema>;
export const editSchema = z
  .object({
    index: z.number().int().min(0).max(299),
    resolution: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("new") }).strict(),
        z.object({ kind: z.literal("match"), showtimeId: idSchema }).strict(),
      ])
      .optional(),
    excluded: z.boolean().optional(),
    fields: fieldsSchema
      .omit({ partnerLastUpdated: true })
      .extend({ movieStatus: movieStatusSchema })
      .partial()
      .optional(),
  })
  .strict();
export const reviewSchema = z
  .object({
    preview: previewSchema,
    edits: z.array(editSchema).min(1).max(300),
  })
  .strict();
export const confirmSchema = z
  .object({ preview: previewSchema, acknowledge: z.literal(true) })
  .strict();
export const schedulePageSchema = z.object({
  showtimes: z.array(
    z
      .object(showtimeSchema.shape)
      .omit({ movieStatus: true })
      .extend({ movieStatus: movieStatusSchema.optional() }),
  ),
  total: z.number(),
  activeCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  options: z.object({
    formats: z.array(z.string()),
    languages: z.array(z.string()),
    ratings: z.array(z.string()),
    auditoriums: z.array(z.string()),
    movieStatuses: z.array(movieStatusSchema),
  }),
});
export type SchedulePage = z.infer<typeof schedulePageSchema>;
