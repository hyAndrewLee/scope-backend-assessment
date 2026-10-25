import { test, expect } from "bun:test";
import { settingsSchema } from "../../../env.js";
const settings = {
  APP_ORIGIN: "http://localhost:3000",
  PREVIEW_SIGNING_SECRET: "s".repeat(64),
};
test("database configuration rejects local URLs and unverified remote TLS without fallback", () => {
  for (const DATABASE_URL of [
    undefined,
    "postgres://a:b@localhost/app",
    "postgres://a:b@127.0.0.1/app",
    "postgres://a:b@[::1]/app",
    "postgres://a:b@db.example.com/app?sslmode=disable",
    "postgres://a:b@db.example.com/app?sslmode=require",
  ])
    expect(
      settingsSchema.safeParse({ ...settings, DATABASE_URL }).success,
    ).toBe(false);
  expect(
    settingsSchema.safeParse({
      ...settings,
      DATABASE_URL: "postgres://a:b@db.example.com/app?sslmode=verify-full",
    }).success,
  ).toBe(true);
});
