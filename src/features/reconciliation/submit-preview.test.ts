import { expect, test } from "bun:test";
import { submitPreview } from "./submit-preview";
import { showtimeSchema, type Preview } from "./schemas";

const row = showtimeSchema.parse({
  id: "s",
  theaterId: "t",
  movieId: "m",
  movieTitle: "Film",
  movieStatus: "draft",
  partnerTitle: "Film",
  auditorium: "Room",
  startTime: "2025-03-15T18:00:00Z",
  endTime: "2025-03-15T20:00:00Z",
  partnerLastUpdated: "2025-03-01T00:00:00Z",
  lastUpdated: "2025-03-01T00:00:00Z",
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
      kind: "update",
      before: row,
      after: row,
      original: null,
      sourceRow: 0,
      reason: "Updated",
      excluded: false,
    },
  ],
};

test("submit validates fields and end-after-start before calling review or confirm", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected request");
  };

  await expect(
    submitPreview(
      preview,
      [{ index: 0, fields: { partnerTitle: "" } }],
      unexpected,
      unexpected,
    ),
  ).rejects.toThrow("Movie title in your file");
  await expect(
    submitPreview(
      preview,
      [{ index: 0, fields: { endTime: row.startTime } }],
      unexpected,
      unexpected,
    ),
  ).rejects.toThrow("End must follow start");
});

test("submit reviews edits and confirms exactly the returned preview", async () => {
  const checked = { ...preview, revision: 2 };
  const edits = [{ index: 0, fields: { auditorium: "Other room" } }];
  let confirmed = false;

  await submitPreview(
    { ...preview, blockers: ["Old blocker"] },
    edits,
    async (received) => {
      expect(received).toEqual(edits);

      return checked;
    },
    async (received) => {
      expect(received).toBe(checked);
      confirmed = true;
    },
  );
  expect(confirmed).toBe(true);
});

test("blockers, excluded/no-change schedules and failed review never confirm", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected confirmation");
  };

  for (const blocked of [
    { ...preview, blockers: ["Choose a compatible room"] },
    {
      ...preview,
      entries: preview.entries.map((entry) => ({ ...entry, excluded: true })),
    },
    {
      ...preview,
      entries: preview.entries.map((entry) => ({
        ...entry,
        kind: "unchanged" as const,
      })),
    },
  ]) {
    await expect(
      submitPreview(blocked, [], unexpected, unexpected),
    ).rejects.toThrow(blocked.blockers[0] ?? "No changes to save");
  }

  await expect(
    submitPreview(
      preview,
      [{ index: 0, excluded: false }],
      async () => {
        throw new Error("Schedule changed");
      },
      unexpected,
    ),
  ).rejects.toThrow("Schedule changed");
});
