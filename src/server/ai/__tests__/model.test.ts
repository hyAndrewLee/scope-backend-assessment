import { test, expect } from "bun:test";
import { aiProposalSchema, generateProposal, parseAiProposal } from "../model";
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
        referenceId: "invalid id",
        title: null,
        auditorium: null,
        suggestedMovieStatus: null,
        movieStatusReason: null,
        reason: "Candidate match",
      },
    ],
  };

  expect(aiProposalSchema.safeParse(output).success).toBe(true);
  expect(() => parseAiProposal(output)).toThrow();
});

test("one provider reference maps to only the ID allowed for each decision kind", () => {
  const decision = {
    sourceRow: 0,
    title: null,
    auditorium: null,
    suggestedMovieStatus: null,
    movieStatusReason: null,
    reason: "Candidate",
  };

  const parsed = parseAiProposal({
    decisions: [
      { ...decision, kind: "match", referenceId: "screening-1" },
      { ...decision, sourceRow: 1, kind: "add", referenceId: "movie-1" },
      { ...decision, sourceRow: 2, kind: "add", referenceId: null },
      { ...decision, sourceRow: 3, kind: "ambiguous", referenceId: null },
    ],
  });

  expect(
    parsed.decisions.map(({ showtimeId, movieId }) => ({
      showtimeId,
      movieId,
    })),
  ).toEqual([
    { showtimeId: "screening-1", movieId: null },
    { showtimeId: null, movieId: "movie-1" },
    { showtimeId: null, movieId: null },
    { showtimeId: null, movieId: null },
  ]);
});

test("transient provider errors retry twice and preserve the busy response after exhaustion", async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  Object.assign(process.env, {
    DATABASE_URL: "postgres://app:password@db.example.com/app",
    APP_ORIGIN: "http://localhost:3000",
    GEMINI_API_KEY: "test-only",
  });
  globalThis.fetch = Object.assign(
    async () => {
      attempts++;

      return Response.json(
        { error: { code: 503, message: "Busy", status: "UNAVAILABLE" } },
        {
          status: 503,
          headers: { "retry-after-ms": "1" },
        },
      );
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
  try {
    await expect(
      generateProposal([], [], new AbortController().signal),
    ).rejects.toMatchObject({
      status: 503,
      message:
        "AI is temporarily busy. Please try again shortly; no changes were made.",
    });
    expect(attempts).toBe(3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ["DATABASE_URL", "APP_ORIGIN", "GEMINI_API_KEY"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("unexpected errors never expose provider messages or credentials", async () => {
  const response = errorResponse(new Error("secret-sentinel"));

  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("secret-sentinel");
});
