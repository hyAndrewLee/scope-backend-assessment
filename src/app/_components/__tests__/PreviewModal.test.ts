import { test, expect } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreviewModal } from "../PreviewModal";
import {
  showtimeSchema,
  type Preview,
  type Entry,
} from "~/features/reconciliation/schemas";

const row = showtimeSchema.parse({
  id: "s",
  theaterId: "t",
  movieId: "m",
  movieTitle: "Changed film",
  movieStatus: "draft",
  partnerTitle: "Changed film",
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
const entry: Entry = {
  kind: "update",
  sourceRow: 0,
  original: null,
  before: row,
  after: { ...row, auditorium: "Room 2" },
  reason: "The auditorium was renamed.",
  excluded: false,
};
const preview: Preview = {
  personaId: "admin",
  theaterId: "t",
  revision: 0,
  model: "test",
  blockers: [],
  entries: [entry],
  capabilities: {
    auditoriums: [
      { id: "a", theaterId: "t", name: "Room 2", supportedFormats: ["2D"] },
    ],
    movies: [{ id: "m", supportedFormats: ["2D"] }],
  },
};
function render(value: Preview | null, failure: string | null = null) {
  return renderToStaticMarkup(
    createElement(PreviewModal, {
      preview: value,
      failure,
      busy: false,
      error: "",
      outcomeUnknown: false,
      onClose() {},
      onConfirm() {},
      onReview: async () => {},
    }),
  );
}
test("compact preview uses navigation and renders only the selected entry's differences", () => {
  const unchanged = {
    ...entry,
    kind: "unchanged" as const,
    before: { ...row, movieTitle: "Unchanged film" },
    after: { ...row, movieTitle: "Unchanged film" },
  };
  const html = render({ ...preview, entries: [unchanged, entry] });
  expect(html).toContain('aria-label="Showtimes to review"');
  expect(html).toContain('aria-current="true"');
  expect(html).toContain("Current schedule");
  expect(html).toContain("Auditorium for showtime 2");
  expect(html).not.toContain("Language for showtime 2");
  expect(html).not.toContain("Unchanged film");
  expect(html).toContain("Show all details");
});
test("archive review retains explicit archive-not-delete warning and status diff", () => {
  const html = render({
    ...preview,
    entries: [
      { ...entry, kind: "archive", after: { ...row, status: "archived" } },
    ],
  });
  expect(html).toContain("archived, not deleted");
  expect(html).toContain("Status");
  expect(html).toContain("Archived");
  expect(html).not.toContain("Auditorium for showtime");
});
test("unchanged schedules default to all entries and cannot be confirmed", () => {
  const html = render({
    ...preview,
    entries: [{ ...entry, kind: "unchanged", after: row }],
  });
  expect(html).toContain("No changes detected");
  expect(html).toContain("Movie status for showtime 1");
  expect(html).toMatch(/disabled=""[^>]*>Confirm 0 changes/);
});
test("preview offers a movie status dropdown and advisory AI suggestion", () => {
  const html = render({
    ...preview,
    entries: [
      {
        ...entry,
        suggestedMovieStatus: "needs-review",
        movieStatusReason: "Confirm the imported movie details.",
      },
    ],
  });
  expect(html).toContain("Movie status for showtime 1");
  expect(html).toContain('value="approved"');
  expect(html).toContain('value="flagged"');
  expect(html).toContain("AI suggests:");
  expect(html).toContain("Needs review");
  expect(html).toContain("Confirm the imported movie details.");
  expect(html).toContain("Use AI suggestion");
  expect(html).toMatch(/Movie status applies to (all screenings|every showtime of this movie)/);
  expect(html).toContain(
    'value="draft" class="bg-gray-900 text-white" selected=""',
  );
});

test("needs-review rows expose editable source values and an explicit match choice", () => {
  const original = { movieTitle: "Uncertain film", theaterName: "Theater", auditorium: "Room 1", startTime: row.startTime, endTime: row.endTime, language: row.language, format: row.format, rating: row.rating, partnerLastUpdated: row.partnerLastUpdated };
  const html = render({ ...preview, existingShowtimes: [row], blockers: ["Resolve this match"], entries: [{ ...entry, kind: "ambiguous", before: null, after: null, original }] });
  expect(html).toContain('aria-label="Resolve this showtime"');
  expect(html).toContain('value="match:s"');
  expect(html).toContain("Add a new showtime");
  for (const label of ["Auditorium for showtime 1", "Language for showtime 1", "Age rating for showtime 1"]) {
    const control = html.match(new RegExp(`<select[^>]*aria-label="${label}"[^>]*>`))?.[0];
    expect(control).toBeDefined();
    expect(control).not.toContain(' disabled=""');
  }
  expect(html).toContain('value="Uncertain film"');
  expect(html).not.toContain("Needs a match</span>");
});

test("failed previews stay distinct from no-change reviews", () => {
  const html = render(null, "Provider unavailable");
  expect(html).toContain("No schedule changes were made");
  expect(html).toContain("Provider unavailable");
  expect(html).not.toContain("Showtimes to review");
  expect(html).not.toContain("Confirm 0 changes");
});
