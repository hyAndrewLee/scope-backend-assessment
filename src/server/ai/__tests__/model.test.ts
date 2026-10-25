import { test, expect } from "bun:test";
import { aiProposalSchema, generateProposal } from "../model";
import { proposalSchema } from "../../../features/reconciliation/schemas";
import { errorResponse } from "../../errors";

test("missing AI configuration fails honestly without a provider call or fabricated preview", async () => {
  const keys = ["DATABASE_URL", "APP_ORIGIN", "GEMINI_API_KEY"] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  Object.assign(process.env, {
    DATABASE_URL: "postgres://app:password@db.example.com/app",
    APP_ORIGIN: "http://localhost:3000",
  });
  delete process.env.GEMINI_API_KEY;
  try {
    await expect(
      generateProposal([], [], new AbortController().signal),
    ).rejects.toThrow("AI preview is not configured");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
test("provider schema does not replace strict domain validation", () => {
  const output = {
    decisions: [
      {
        sourceRow: -1,
        kind: "match",
        showtimeId: "invalid id",
        movieId: null,
        title: null,
        auditorium: null,
        suggestedMovieStatus: null,
        movieStatusReason: null,
        reason: "Candidate match",
      },
    ],
  };

  expect(aiProposalSchema.safeParse(output).success).toBe(true);
  expect(proposalSchema.safeParse(output).success).toBe(false);
});

test("unexpected errors never expose provider messages or credentials", async () => {
  const response = errorResponse(new Error("secret-sentinel"));

  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("secret-sentinel");
});
