import { test, expect } from "bun:test";
import {
  compilePreview,
  exactProposal,
  revisePreview,
} from "../reconciliation";
import {
  csvRowSchema,
  showtimeSchema,
  reviewSchema,
  type Proposal,
} from "../../../features/reconciliation/schemas";
const before = showtimeSchema.parse({
  id: "screening",
  theaterId: "downtown",
  movieId: "movie",
  movieTitle: "Spider-Man",
  movieStatus: "approved",
  partnerTitle: "Spider-Man",
  auditorium: "Auditorium 1",
  startTime: "2025-03-15T18:00:00Z",
  endTime: "2025-03-15T20:00:00Z",
  language: "EN",
  format: "2D",
  rating: "PG",
  partnerLastUpdated: "2025-03-10T00:00:00Z",
  lastUpdated: "2025-03-10T00:00:00Z",
  status: "active",
});
const row = csvRowSchema.parse({
  ...Object.fromEntries(
    Object.entries(before).filter(([key]) =>
      [
        "movieTitle",
        "auditorium",
        "startTime",
        "endTime",
        "language",
        "format",
        "rating",
        "partnerLastUpdated",
      ].includes(key),
    ),
  ),
  theaterName: "Downtown",
});
const metadata = {
  personaId: "admin",
  theaterId: "downtown",
  revision: 0,
  expiresAt: Date.now() + 60000,
  model: "test",
};
const match: Proposal = {
  decisions: [
    {
      sourceRow: 0,
      kind: "match",
      showtimeId: before.id,
      movieId: null,
      title: null,
      auditorium: null,
      reason: "Same screening.",
    },
  ],
};
test("exact unchanged schedules bypass AI; minor title spelling preserves identity", () => {
  const exact = exactProposal([{ ...row, movieTitle: "Spider Man" }], [before]);
  expect(exact).not.toBeNull();
  const preview = compilePreview([row], [before], exact, metadata);
  expect(preview.entries[0]?.kind).toBe("unchanged");
  expect(preview.entries[0]?.after?.id).toBe(before.id);
});
test("an AI addition cannot replace an existing movie/start identity", () => {
  const decision = {
    ...match.decisions[0]!,
    kind: "add" as const,
    showtimeId: null,
    movieId: before.movieId,
  };
  const preview = compilePreview(
    [{ ...row, auditorium: "New Hall" }],
    [before],
    { decisions: [decision] },
    metadata,
  );
  expect(preview.entries[0]?.kind).toBe("update");
  expect(preview.entries[0]?.after?.id).toBe(before.id);
});

test("updates preserve identity and missing screenings archive across all dates", () => {
  const other = {
    ...before,
    id: "future",
    startTime: "2026-01-01T18:00:00.000Z",
    endTime: "2026-01-01T20:00:00.000Z",
  };
  const preview = compilePreview(
    [{ ...row, auditorium: "New Hall" }],
    [before, other],
    match,
    metadata,
  );
  expect(preview.entries.map((e) => e.kind)).toEqual(["update", "archive"]);
  expect(preview.entries[1]?.after?.status).toBe("archived");
});
test("foreign/repeated model references cannot compile", () => {
  expect(() =>
    compilePreview(
      [row],
      [before],
      { decisions: [{ ...match.decisions[0], showtimeId: "foreign" }] },
      metadata,
    ),
  ).toThrow();
  expect(() =>
    compilePreview(
      [row, row],
      [before],
      {
        decisions: [
          match.decisions[0],
          { ...match.decisions[0], sourceRow: 1 },
        ],
      },
      metadata,
    ),
  ).toThrow();
});
test("ambiguity blocks confirmation and removes archival; exclusion can resolve it safely", () => {
  const preview = compilePreview(
    [row],
    [before],
    {
      decisions: [
        { ...match.decisions[0], kind: "ambiguous", showtimeId: null },
      ],
    },
    metadata,
  );
  expect(preview.blockers.length).toBeGreaterThan(0);
  expect(preview.entries.some((e) => e.kind === "archive")).toBe(false);
  const revised = revisePreview(
    preview,
    [before],
    [{ index: 0, excluded: true }],
  );
  expect(revised.blockers).toHaveLength(0);
  expect(revised.expiresAt).toBe(preview.expiresAt);
});
test("review edits validate time order, immutable fields, exclusions and duplicate identities", () => {
  const preview = compilePreview([row], [before], match, metadata);
  expect(() =>
    revisePreview(
      preview,
      [before],
      [{ index: 0, fields: { endTime: "2025-03-15T17:00:00Z" } }],
    ),
  ).toThrow();
  expect(() =>
    reviewSchema.parse({
      preview: { payload: "{}", signature: "a".repeat(64) },
      edits: [{ index: 0, fields: { movieId: "foreign" } }],
    }),
  ).toThrow();
  const revised = revisePreview(
    preview,
    [before],
    [{ index: 0, fields: { auditorium: "Hall B" } }],
  );
  expect(revised.entries[0]?.kind).toBe("update");
  expect(preview.entries[0]?.kind).toBe("unchanged");
  const duplicate = {
    ...before,
    id: "second",
    startTime: "2025-03-15T21:00:00.000Z",
    endTime: "2025-03-15T23:00:00.000Z",
  };
  const both = compilePreview(
    [
      row,
      { ...row, startTime: duplicate.startTime, endTime: duplicate.endTime },
    ],
    [before, duplicate],
    {
      decisions: [
        match.decisions[0]!,
        { ...match.decisions[0]!, sourceRow: 1, showtimeId: duplicate.id },
      ],
    },
    metadata,
  );
  const conflict = revisePreview(
    both,
    [before, duplicate],
    [{ index: 1, fields: { startTime: before.startTime } }],
  );
  expect(conflict.blockers.length).toBeGreaterThan(0);
});
