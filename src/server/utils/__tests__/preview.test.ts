import { test, expect } from "bun:test";
import { signPreview, verifyPreview } from "../preview";
import type { Preview } from "../../../features/reconciliation/schemas";
const secret = "a".repeat(64);
const preview: Preview = {
  personaId: "admin",
  theaterId: "downtown",
  revision: 2,
  expiresAt: Date.now() + 60000,
  entries: [],
  blockers: [],
  model: "not-required",
};
test("signed previews round-trip and reject tampering, expiry, and foreign ownership", () => {
  const signed = signPreview(preview, secret);
  expect(verifyPreview(signed, secret, "admin", "downtown")).toEqual(preview);
  expect(() =>
    verifyPreview(
      {
        ...signed,
        payload: signed.payload.replace('"revision":2', '"revision":3'),
      },
      secret,
      "admin",
      "downtown",
    ),
  ).toThrow();
  expect(() => verifyPreview(signed, secret, "viewer", "downtown")).toThrow();
  expect(() => verifyPreview(signed, secret, "admin", "other")).toThrow();
  expect(() =>
    verifyPreview(signed, secret, "admin", "downtown", preview.expiresAt),
  ).toThrow();
});
