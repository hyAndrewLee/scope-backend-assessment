import { test, expect } from "bun:test";
import { readPreview } from "../preview";
import type { Preview } from "../../../features/reconciliation/schemas";

const preview: Preview = {
  personaId: "admin",
  theaterId: "downtown",
  revision: 2,
  entries: [],
  blockers: [],
  model: "not-required",
};

test("plain previews validate shape and persona/theater binding without a secret", () => {
  expect(readPreview(preview, "admin", "downtown")).toEqual(preview);
  expect(() => readPreview(preview, "viewer", "downtown")).toThrow();
  expect(() => readPreview(preview, "admin", "other")).toThrow();
  expect(() =>
    readPreview({ ...preview, revision: -1 }, "admin", "downtown"),
  ).toThrow();
});
