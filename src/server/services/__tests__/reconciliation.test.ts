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
  expiresAt: Date.now() + 60000,
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
test("stale or consumed revisions reject replay", () => {
  expect(() => assertRevision(0, 0)).not.toThrow();
  expect(() => assertRevision(1, 0)).toThrow();
});
