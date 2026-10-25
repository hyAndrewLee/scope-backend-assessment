import { test, expect } from "bun:test";
import { compilePreview, revisePreview } from "../reconciliation";
import { validateConfirmation } from "../../services/reconciliation";
import { validateAssignments } from "../auditoriums";
import {
  csvRowSchema,
  showtimeSchema,
} from "../../../features/reconciliation/schemas";

const current = showtimeSchema.parse({
  id: "existing",
  theaterId: "t",
  movieId: "film",
  movieTitle: "Dune",
  movieStatus: "approved",
  partnerTitle: "Dune",
  auditorium: "Room 1",
  startTime: "2025-03-15T18:00:00Z",
  endTime: "2025-03-15T20:00:00Z",
  partnerLastUpdated: "2025-03-01T00:00:00Z",
  lastUpdated: "2025-03-01T00:00:00Z",
  language: "EN",
  format: "2D",
  rating: "PG",
  status: "active",
});
const source = csvRowSchema.parse({
  movieTitle: "Dun",
  theaterName: "Theater",
  auditorium: "Unknown room",
  startTime: current.startTime,
  endTime: current.endTime,
  partnerLastUpdated: current.partnerLastUpdated,
  language: "EN",
  format: "3D",
  rating: "PG",
});
function unresolved() {
  return compilePreview(
    [source],
    [current],
    {
      decisions: [
        {
          sourceRow: 0,
          kind: "ambiguous",
          showtimeId: null,
          movieId: null,
          title: null,
          auditorium: null,
          reason: "Confirm the movie and auditorium.",
        },
      ],
    },
    { personaId: "admin", theaterId: "t", revision: 0, model: "test" },
  );
}
test("needs-review entries retain editable drafts and real screening choices", () => {
  const preview = unresolved();
  expect(preview.entries[0]?.after?.partnerTitle).toBe("Dun");
  expect(preview.existingShowtimes).toEqual([current]);
  const edited = revisePreview(
    preview,
    [current],
    [{ index: 0, fields: { auditorium: "Room 2", partnerTitle: "Dune" } }],
  );
  expect(edited.entries[0]?.after?.auditorium).toBe("Room 2");
  expect(edited.entries[0]?.kind).toBe("ambiguous");
  expect(() => validateConfirmation(edited, [current])).toThrow();
});
test("reviewers can resolve an uncertain row as an existing screening and edit its inputs", () => {
  const revised = revisePreview(
    unresolved(),
    [current],
    [
      {
        index: 0,
        resolution: { kind: "match", showtimeId: current.id },
        fields: { auditorium: "Room 2", partnerTitle: "Dune", language: "FR" },
      },
    ],
  );
  const checked = validateAssignments(
    revised,
    [{ id: "room", theaterId: "t", name: "Room 2", supportedFormats: ["3D"] }],
    [{ id: "film", supportedFormats: ["2D", "3D"] }],
  );
  expect(checked.blockers).toEqual([]);
  expect(checked.entries[0]).toMatchObject({
    kind: "update",
    before: current,
    after: {
      id: current.id,
      movieId: current.movieId,
      movieTitle: "Dune",
      movieStatus: "approved",
      auditorium: "Room 2",
      language: "FR",
      format: "3D",
    },
  });
  expect(validateConfirmation(checked, [current])).toHaveLength(1);
  expect(current.auditorium).toBe("Room 1");
});
test("reviewers can explicitly create a new screening while reusing a known movie", () => {
  const edited = revisePreview(
    unresolved(),
    [current],
    [
      {
        index: 0,
        resolution: { kind: "new" },
        fields: {
          partnerTitle: "Dune",
          auditorium: "Room 1",
          format: "2D",
          startTime: "2025-03-16T18:00:00Z",
          endTime: "2025-03-16T20:00:00Z",
        },
      },
    ],
  );
  expect(edited.entries[0]?.kind).toBe("add");
  expect(edited.entries[0]?.after?.movieId).toBe(current.movieId);
  expect(edited.entries[0]?.after?.id).not.toBe(current.id);
  expect(validateConfirmation(edited, [current])).toHaveLength(1);
});
test("resolution cannot pick foreign identities, bypass formats, or change a resolved target", () => {
  expect(() =>
    revisePreview(
      unresolved(),
      [current],
      [{ index: 0, resolution: { kind: "match", showtimeId: "foreign" } }],
    ),
  ).toThrow();
  const edit = {
    index: 0,
    resolution: { kind: "match" as const, showtimeId: current.id },
    fields: { auditorium: "Room 2" },
  };
  const resolved = revisePreview(unresolved(), [current], [edit]);
  const blocked = validateAssignments(
    resolved,
    [{ id: "room", theaterId: "t", name: "Room 2", supportedFormats: ["2D"] }],
    [{ id: "film", supportedFormats: ["2D", "3D"] }],
  );
  expect(() => validateConfirmation(blocked, [current])).toThrow();
  expect(() =>
    revisePreview(
      resolved,
      [current],
      [{ index: 0, resolution: { kind: "match", showtimeId: "foreign" } }],
    ),
  ).toThrow();
  expect(revisePreview(resolved, [current], [edit]).entries[0]?.after?.id).toBe(
    current.id,
  );
});
