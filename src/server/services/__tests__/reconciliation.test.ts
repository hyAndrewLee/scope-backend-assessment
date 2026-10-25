import { test, expect } from "bun:test";
import { validateConfirmation } from "../reconciliation";
import { assertRevision } from "../schedule";
import {
  showtimeSchema,
  type Preview,
} from "../../../features/reconciliation/schemas";

const row = showtimeSchema.parse({
  id: "s",
  theaterId: "t",
  movieId: "m",
  movieTitle: "Movie",
  movieStatus: "draft",
  partnerTitle: "Movie",
  auditorium: "A",
  startTime: "2025-01-01T10:00:00Z",
  endTime: "2025-01-01T12:00:00Z",
  partnerLastUpdated: "2025-01-01T00:00:00Z",
  lastUpdated: "2025-01-01T00:00:00Z",
  language: "EN",
  format: "2D",
  rating: "PG",
  status: "active",
});

const preview: Preview = {
  personaId: "u",
  theaterId: "t",
  revision: 0,
  model: "test",
  blockers: [],
  entries: [
    {
      kind: "archive",
      before: row,
      after: { ...row, status: "archived" },
      sourceRow: null,
      original: null,
      reason: "Missing",
      excluded: false,
    },
  ],
};

test("confirmation applies included changes only and rechecks current rows", () => {
  expect(validateConfirmation(preview, [row])).toHaveLength(1);
  expect(
    validateConfirmation(
      {
        ...preview,
        entries: preview.entries.map((e) => ({ ...e, excluded: true })),
      },
      [row],
    ),
  ).toHaveLength(0);
  expect(() =>
    validateConfirmation(preview, [{ ...row, auditorium: "changed" }]),
  ).toThrow();
  expect(() =>
    validateConfirmation({ ...preview, blockers: ["unsafe"] }, [row]),
  ).toThrow();
});
test("admin preview edits cannot mutate movie identity", () => {
  for (const fields of [
    { movieId: "foreign" },
    { movieTitle: "Different movie" },
    { theaterId: "other" },
  ]) {
    const forged = {
      ...preview,
      entries: [
        {
          ...preview.entries[0]!,
          kind: "update" as const,
          after: { ...row, ...fields },
        },
      ],
    };

    expect(() => validateConfirmation(forged, [row])).toThrow();
  }
});
test("archive and unchanged labels cannot hide arbitrary field changes", () => {
  for (const kind of ["archive", "unchanged"] as const) {
    const forged = {
      ...preview,
      entries: [
        {
          ...preview.entries[0]!,
          kind,
          after: { ...row, auditorium: "Other room" },
        },
      ],
    };

    expect(() => validateConfirmation(forged, [row])).toThrow();
  }
});
test("additions allow reviewed statuses but cannot bypass active identities", () => {
  const entry = {
    ...preview.entries[0]!,
    kind: "add" as const,
    before: null,
    sourceRow: 0,
    after: { ...row, id: "new" },
  };

  expect(() =>
    validateConfirmation({ ...preview, entries: [entry] }, [row]),
  ).toThrow();
  expect(() =>
    validateConfirmation(
      {
        ...preview,
        entries: [
          {
            ...entry,
            after: {
              ...entry.after,
              movieId: "new-movie",
              movieTitle: "New film",
              movieStatus: "approved",
            },
          },
        ],
      },
      [row],
    ),
  ).not.toThrow();
  const other = {
    ...entry,
    after: {
      ...entry.after,
      id: "second",
      movieId: "another-id",
      movieTitle: "New film",
    },
  };

  const first = {
    ...entry,
    after: { ...entry.after, movieId: "first-id", movieTitle: "New film" },
  };

  expect(() =>
    validateConfirmation({ ...preview, entries: [first, other] }, [row]),
  ).toThrow();
});
test("administrator status-only edits are valid but contradictory movie statuses are rejected", () => {
  const changed = {
    ...preview.entries[0]!,
    kind: "update" as const,
    after: { ...row, movieStatus: "flagged" as const },
  };

  expect(
    validateConfirmation({ ...preview, entries: [changed] }, [row]),
  ).toHaveLength(1);
  const later = {
    ...row,
    id: "later",
    startTime: "2025-01-01T14:00:00.000Z",
    endTime: "2025-01-01T16:00:00.000Z",
  };

  expect(() =>
    validateConfirmation(
      {
        ...preview,
        entries: [
          changed,
          {
            ...changed,
            kind: "unchanged",
            before: later,
            after: later,
          },
        ],
      },
      [row, later],
    ),
  ).toThrow("Choose one review status");
  expect(() =>
    validateConfirmation(
      { ...preview, entries: [{ ...changed, kind: "unchanged" }] },
      [row],
    ),
  ).toThrow("Unchanged entries");
});

test("validated admin changes remain editable without a cryptographic secret", () => {
  const entry = {
    ...preview.entries[0]!,
    kind: "update" as const,
    after: { ...row, auditorium: "Other room" },
  };

  expect(
    validateConfirmation({ ...preview, entries: [entry] }, [row]),
  ).toHaveLength(1);
});
test("stale or consumed revisions reject replay", () => {
  expect(() => assertRevision(0, 0)).not.toThrow();
  expect(() => assertRevision(1, 0)).toThrow();
});
