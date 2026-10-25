import { ZodError } from "zod";
import { DrizzleQueryError } from "drizzle-orm";
import postgres from "postgres";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  const conflict =
    cause instanceof postgres.PostgresError &&
    ["23505", "23514", "40001", "40P01"].includes(cause.code);
  const status =
    error instanceof AppError
      ? error.status
      : error instanceof ZodError
        ? 400
        : conflict
          ? 409
          : 500;
  const message =
    error instanceof AppError
      ? error.message
      : error instanceof ZodError
        ? "Check the supplied fields."
        : conflict
          ? "Saved data conflicts with this operation; refresh and review again."
          : "Server unavailable. No fallback data was used.";
  if (status === 500)
    console.error("request_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
