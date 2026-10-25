import { test, expect } from "bun:test";
import { assertAccess } from "../users";
import type { User } from "../../../features/reconciliation/schemas";
const admin: User = {
  id: "admin",
  name: "Admin",
  role: "admin",
  allTheaters: false,
  theaterIds: ["a"],
};
test("role and some/none/all membership rules are enforced independently", () => {
  expect(() => assertAccess(admin, "a", true)).not.toThrow();
  expect(() => assertAccess(admin, "b", true)).toThrow();
  expect(() => assertAccess({ ...admin, theaterIds: [] }, "a")).toThrow();
  expect(() =>
    assertAccess({ ...admin, allTheaters: true }, "b", true),
  ).not.toThrow();
  expect(() => assertAccess({ ...admin, role: "viewer" }, "a")).not.toThrow();
  expect(() => assertAccess({ ...admin, role: "viewer" }, "a", true)).toThrow();
});
