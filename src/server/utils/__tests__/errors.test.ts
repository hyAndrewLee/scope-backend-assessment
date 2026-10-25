import { test, expect } from "bun:test";
import { DrizzleQueryError } from "drizzle-orm";
import postgres from "postgres";
import { AppError, errorResponse } from "../../errors";

test("constraint conflicts return sanitized 409 responses, including wrapped driver errors", async () => {
  const cause = Object.assign(
    Object.create(postgres.PostgresError.prototype) as Error,
    { code: "23514", message: "secret-sentinel" },
  );
  const wrapped = Object.assign(
    Object.create(DrizzleQueryError.prototype) as Error,
    { cause, message: "secret-query" },
  );
  for (const error of [cause, wrapped]) {
    const response = errorResponse(error);
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("secret");
  }
  expect(errorResponse(new AppError(403, "Forbidden")).status).toBe(403);
});
