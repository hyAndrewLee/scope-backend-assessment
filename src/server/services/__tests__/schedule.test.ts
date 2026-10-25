import { test, expect } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { readSchedule, assertRevision } from "../schedule";
import {
  filtersSchema,
  type User,
} from "../../../features/reconciliation/schemas";

const viewer: User = {
  id: "viewer",
  name: "Viewer",
  role: "viewer",
  allTheaters: false,
  theaterIds: ["a"],
};

test("schedule rejects a foreign theater before querying the database", async () => {
  await expect(
    readSchedule(
      drizzle.mock(),
      viewer,
      filtersSchema.parse({ theaterId: "b" }),
    ),
  ).rejects.toThrow();
});
test("viewers cannot infer hidden review status through filtering or sorting", async () => {
  for (const query of [{ movieStatus: "draft" }, { sort: "movieStatus" }]) {
    await expect(
      readSchedule(
        drizzle.mock(),
        viewer,
        filtersSchema.parse({ theaterId: "a", ...query }),
      ),
    ).rejects.toThrow("Review status is admin-only");
  }
});
test("write revisions must match exactly", () => {
  expect(() => assertRevision(5, 5)).not.toThrow();
  expect(() => assertRevision(6, 5)).toThrow();
});
