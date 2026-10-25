import { test, expect } from "bun:test";
import { getTableName } from "drizzle-orm";
import type { Database } from "../../database";
import { confirmPreview } from "../reconciliation";
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

// An isolated service double, not a SQL/rollback integration test or runtime fallback.
function databaseDouble(
  failSecondWrite = false,
  failMovieWrite = false,
  role = "admin",
) {
  const state = {
    row: structuredClone(row),
    revision: 0,
    locks: 0,
    writes: 0,
    rolledBack: false,
  };

  const database = {
    async transaction(action: (tx: unknown) => Promise<unknown>) {
      const original = {
        row: structuredClone(state.row),
        revision: state.revision,
      };

      try {
        return await action(database);
      } catch (error) {
        state.row = original.row;
        state.revision = original.revision;
        state.rolledBack = true;
        throw error;
      }
    },
    select() {
      let table = "";
      const data = () =>
        table === "theaters"
          ? [{ id: "t", name: "Theater", revision: state.revision }]
          : table === "users"
            ? [
                {
                  id: "u",
                  name: "Admin",
                  email: "a@example.com",
                  role,
                  allTheaters: true,
                },
              ]
            : table === "user_theaters"
              ? []
              : table === "auditoriums"
                ? [
                    {
                      id: "room",
                      theaterId: "t",
                      name: "A",
                      supportedFormats: ["2D"],
                    },
                  ]
                : table === "movies"
                  ? [{ id: "m", title: "Movie", supportedFormats: ["2D"] }]
                  : [structuredClone(state.row)];

      const query = {
        from(value: Parameters<typeof getTableName>[0]) {
          table = getTableName(value);

          return query;
        },
        where() {
          return query;
        },
        innerJoin() {
          return query;
        },
        orderBy() {
          return query;
        },
        limit() {
          return Promise.resolve(data());
        },
        for() {
          state.locks++;

          return Promise.resolve(data());
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(data()).then(resolve);
        },
      };

      return query;
    },
    update(value: Parameters<typeof getTableName>[0]) {
      const table = getTableName(value);

      return {
        set(values: Partial<typeof row>) {
          return {
            async where() {
              if (table === "theaters") state.revision++;
              else {
                state.writes++;
                if (
                  (failSecondWrite && state.writes === 2) ||
                  (failMovieWrite && table === "movies")
                )
                  throw new Error("Simulated write failure");
                Object.assign(state.row, values);
              }
            },
          };
        },
      };
    },
  };

  return { db: database as unknown as Database, state };
}

test("movie status is saved on confirmation, and movie write failures roll back the schedule", async () => {
  const token: Preview = {
    ...preview,
    entries: [
      {
        ...preview.entries[0]!,
        kind: "update",
        after: { ...row, movieStatus: "flagged" },
      },
    ],
  };

  const { db, state } = databaseDouble();

  expect(state.row.movieStatus).toBe("draft");
  await confirmPreview(db, "u", "t", token);
  expect(state.row.movieStatus).toBe("flagged");
  expect(state.revision).toBe(1);
  expect(state.writes).toBe(3);
  const failed = databaseDouble(false, true);

  await expect(confirmPreview(failed.db, "u", "t", token)).rejects.toThrow(
    "Simulated write failure",
  );
  expect(failed.state.row.movieStatus).toBe("draft");
  expect(failed.state.revision).toBe(0);
  expect(failed.state.rolledBack).toBe(true);
  const viewer = databaseDouble(false, false, "viewer");

  await expect(confirmPreview(viewer.db, "u", "t", token)).rejects.toThrow();
  expect(viewer.state.writes).toBe(0);
});

test("confirmation locks, writes, increments once, and rejects replay", async () => {
  const { db, state } = databaseDouble();
  const token = structuredClone(preview);

  expect(await confirmPreview(db, "u", "t", token)).toMatchObject({
    archived: 1,
    revision: 1,
  });
  expect(state.row.status).toBe("archived");
  expect(state.locks).toBe(1);
  expect(state.writes).toBe(2);
  await expect(confirmPreview(db, "u", "t", token)).rejects.toThrow(
    "Schedule changed",
  );
  expect(state.revision).toBe(1);
  expect(state.writes).toBe(2);
});
test("a write failure escapes the transaction without a success result", async () => {
  const { db, state } = databaseDouble(true);

  await expect(confirmPreview(db, "u", "t", preview)).rejects.toThrow(
    "Simulated write failure",
  );
  expect(state.rolledBack).toBe(true);
  expect(state.row.status).toBe("active");
  expect(state.revision).toBe(0);
});
