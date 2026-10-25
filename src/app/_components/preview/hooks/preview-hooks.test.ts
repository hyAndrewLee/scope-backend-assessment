import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  showtimeSchema,
  type Entry,
  type Preview,
} from "~/features/reconciliation/schemas";
import { usePreviewEntries } from "./usePreviewEntries";
import { usePreviewFields } from "./usePreviewFields";
import { usePreviewForm, type PreviewEdits } from "./usePreviewForm";

const row = showtimeSchema.parse({
  id: "showtime",
  theaterId: "theater",
  movieId: "movie",
  movieTitle: "Film",
  movieStatus: "approved",
  partnerTitle: "Film",
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
  after: row,
  reason: "Changed",
  excluded: false,
};

const preview: Preview = {
  personaId: "admin",
  theaterId: "theater",
  revision: 0,
  model: "test",
  blockers: [],
  entries: [entry],
  existingShowtimes: [row],
  capabilities: {
    auditoriums: [
      {
        id: "room",
        theaterId: "theater",
        name: "Room 1",
        supportedFormats: ["3D"],
      },
    ],
    movies: [{ id: "movie", supportedFormats: ["3D"] }],
  },
};

// These hooks expose callbacks without requiring a browser or new test dependency.
function capture<T>(useValue: () => T): T {
  let result: T;

  function Probe() {
    result = useValue();

    return null;
  }

  renderToStaticMarkup(createElement(Probe));

  return result!;
}

function editor(value: Preview, initial: PreviewEdits = {}) {
  let edits = initial;
  const setEdits = (next: PreviewEdits) => {
    edits = next;
  };

  const entries = capture(() =>
    usePreviewEntries({
      preview: value,
      entries: value.entries,
      entry: value.entries[0],
      index: 0,
      edits,
      setEdits,
    }),
  );

  const fields = capture(() =>
    usePreviewFields({
      preview: value,
      entries: value.entries,
      entry: value.entries[0],
      index: 0,
      edits,
      setEdits,
      editable: entries.state.editable,
      selectedMatch: entries.selectedMatch,
      formatEntry: entries.formatEntry,
      showAllFields: true,
    }),
  );

  return { entries, fields, edits: () => edits };
}

test("matching controls counts, movie formats/status, and preserves exclusions and field edits", () => {
  const ambiguous: Entry = {
    ...entry,
    kind: "ambiguous",
    before: null,
    after: null,
    original: { ...row, movieTitle: "Imported", theaterName: "Theater" },
    excluded: true,
  };

  const initial: PreviewEdits = {
    0: {
      index: 0,
      fields: { partnerTitle: "Edited" },
      excluded: false,
      resolution: { kind: "match", showtimeId: row.id },
    },
  };

  const edit = editor({ ...preview, entries: [ambiguous] }, initial);

  expect(edit.entries.state.counts).toEqual({ add: 0, update: 1, archive: 0 });
  expect(edit.fields.valueFor("movieStatus")).toBe("approved");
  expect(edit.fields.formats).toEqual(["3D"]);
  edit.fields.updateField("auditorium", "Room 1");
  expect(edit.edits()[0]).toEqual({
    ...initial[0]!,
    fields: { partnerTitle: "Edited", auditorium: "Room 1", format: "3D" },
  });
  edit.entries.state.resolveEntry("new");
  expect(edit.edits()[0]).toEqual({
    ...initial[0]!,
    resolution: { kind: "new" },
  });
  edit.entries.state.setExcluded(true);
  expect(edit.edits()[0]).toEqual({ ...initial[0]!, excluded: true });
  expect(
    editor({ ...preview, entries: [ambiguous] }, edit.edits()).entries.state
      .changes,
  ).toBe(0);
  expect(
    editor(
      { ...preview, entries: [ambiguous] },
      { 0: { index: 0, excluded: false, resolution: { kind: "new" } } },
    ).entries.state.counts.add,
  ).toBe(1);
});

test("movie status spans same-movie rows, including excluded rows, but never archives or other movies", () => {
  const edit = editor(
    {
      ...preview,
      entries: [
        entry,
        { ...entry, kind: "unchanged", excluded: true },
        { ...entry, kind: "archive" },
        { ...entry, after: { ...row, movieId: "other" } },
      ],
    },
    { 1: { index: 1, excluded: true, fields: { rating: "R" } } },
  );

  edit.fields.updateField("movieStatus", "flagged");
  expect(edit.edits()).toEqual({
    0: { index: 0, fields: { movieStatus: "flagged" } },
    1: {
      index: 1,
      excluded: true,
      fields: { rating: "R", movieStatus: "flagged" },
    },
  });
});

test("date inputs remain UTC, preserve empty values, and ignore invalid dates", () => {
  const edit = editor(preview);

  expect(
    edit.fields.fieldRows.find(({ field }) => field === "startTime")
      ?.inputValue,
  ).toBe("2025-03-15T18:00:00");
  edit.fields.updateInputField("startTime", "2025-03-16T19:30");
  expect(edit.edits()[0]?.fields?.startTime).toBe("2025-03-16T19:30:00.000Z");
  edit.fields.updateInputField("startTime", "invalid");
  expect(edit.edits()[0]?.fields?.startTime).toBe("2025-03-16T19:30:00.000Z");
  edit.fields.updateInputField("endTime", "");
  expect(edit.edits()[0]?.fields?.endTime).toBe("");
});

test("submission blocks busy, missing/failed previews, unknown outcomes, and concurrent confirmation", async () => {
  let confirms = 0;
  let finish = () => {};

  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const source = {
    preview,
    failure: null,
    busy: false,
    outcomeUnknown: false,
    onReview: async () => preview,
    onConfirm: async () => {
      confirms++;
      await pending;
    },
  };

  for (const overrides of [
    { busy: true },
    { preview: null },
    { failure: "Failed" },
    { outcomeUnknown: true },
  ]) {
    const form = capture(() => usePreviewForm({ ...source, ...overrides }));

    await form.submit();
  }

  expect(confirms).toBe(0);
  const form = capture(() => usePreviewForm(source));
  const first = form.submit();
  const second = form.submit();

  await second;
  expect(confirms).toBe(1);
  finish();
  await first;
  await form.submit();
  expect(confirms).toBe(2);
});

test("failed confirmation retains edits and releases the in-flight guard for retry", async () => {
  let attempts = 0;
  const reviewed: PreviewEdits[] = [];
  const form = capture(() =>
    usePreviewForm({
      preview,
      failure: null,
      busy: false,
      outcomeUnknown: false,
      onReview: async (edits) => {
        reviewed.push(
          Object.fromEntries(edits.map((edit) => [edit.index, edit])),
        );

        return preview;
      },
      onConfirm: async () => {
        if (++attempts === 1) throw new Error("Save failed");
      },
    }),
  );

  const edits = { 0: { index: 0, excluded: false } };

  form.setEdits(edits);
  await form.submit();
  await form.submit();
  await form.submit();
  expect(attempts).toBe(3);
  expect(reviewed).toEqual([edits, edits]);
});
