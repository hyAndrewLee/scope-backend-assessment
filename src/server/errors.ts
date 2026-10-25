import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  const status =
    error instanceof AppError
      ? error.status
      : error instanceof ZodError
        ? 400
        : 500;
  const message =
    error instanceof AppError
      ? error.message
      : error instanceof ZodError
        ? "Check the supplied fields."
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
