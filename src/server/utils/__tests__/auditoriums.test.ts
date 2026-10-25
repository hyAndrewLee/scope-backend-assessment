import { test, expect } from "bun:test";
import { supportsProjection, validateAssignments } from "../auditoriums";
import {
  showtimeSchema,
  type Auditorium,
  type Preview,
} from "../../../features/reconciliation/schemas";

const rooms: Auditorium[] = [
  { id: "flat", theaterId: "t", name: "Room 1", supportedFormats: ["2D"] },
  {
    id: "stereo",
    theaterId: "t",
    name: "Room 2",
    supportedFormats: ["2D", "3D"],
  },
];
const row = showtimeSchema.parse({
  id: "s",
  theaterId: "t",
  movieId: "m",
  movieTitle: "3D Film",
  movieStatus: "draft",
  partnerTitle: "3D Film",
  auditorium: "Room 1",
  startTime: "2025-01-01T10:00:00Z",
  endTime: "2025-01-01T12:00:00Z",
  partnerLastUpdated: "2025-01-01T00:00:00Z",
  lastUpdated: "2025-01-01T00:00:00Z",
  language: "EN",
  format: "3D",
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
      kind: "add",
      before: null,
      after: row,
      sourceRow: 0,
      original: null,
      reason: "Film",
      excluded: false,
    },
  ],
};
test("both movie and auditorium must support the requested format; IMAX does not imply 3D", () => {
  expect(supportsProjection("3D", ["3D"], ["2D"])).toBe(false);
  expect(supportsProjection("2D", ["3D"], ["2D", "3D"])).toBe(false);
  expect(supportsProjection("3D", ["3D"], ["IMAX"])).toBe(false);
  expect(supportsProjection("3D", ["3D"], ["2D", "3D"])).toBe(true);
});
test("unsupported or foreign rooms block confirmation; corrected room is canonicalized", () => {
  const movies = [{ id: "m", supportedFormats: ["3D" as const] }];
  expect(
    validateAssignments(preview, rooms, movies).blockers.length,
  ).toBeGreaterThan(0);
  const corrected = {
    ...preview,
    entries: preview.entries.map((e) => ({
      ...e,
      after: { ...row, auditorium: "room-2" },
    })),
  };
  expect(validateAssignments(corrected, rooms, movies).blockers).toEqual([]);
  expect(
    validateAssignments(corrected, rooms, movies).entries[0]?.after?.auditorium,
  ).toBe("Room 2");
  expect(
    validateAssignments(
      corrected,
      rooms.map((r) => ({ ...r, theaterId: "other" })),
      movies,
    ).blockers.length,
  ).toBeGreaterThan(0);
});
test("a movie-only limitation cannot be bypassed by selecting a more capable room", () => {
  const unsupported = {
    ...preview,
    entries: preview.entries.map((e) => ({
      ...e,
      after: { ...row, auditorium: "Room 2", format: "2D" as const },
    })),
  };
  expect(
    validateAssignments(unsupported, rooms, [
      { id: "m", supportedFormats: ["3D"] },
    ]).blockers.length,
  ).toBeGreaterThan(0);
});
