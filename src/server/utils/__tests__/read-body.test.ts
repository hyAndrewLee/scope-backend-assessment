import { test, expect } from "bun:test";
import { readBody } from "../read-body";

test("actual streamed body bytes are bounded even without content-length", async () => {
  expect(
    await readBody(
      new Request("http://localhost", { method: "POST", body: "abc" }),
      3,
    ),
  ).toEqual(new TextEncoder().encode("abc"));
  await expect(
    readBody(
      new Request("http://localhost", { method: "POST", body: "abcd" }),
      3,
    ),
  ).rejects.toThrow();
});
