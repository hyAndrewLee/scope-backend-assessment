import { z } from "zod";

export const settingsSchema = z.object({
  DATABASE_URL: z.string().url().refine((value) => {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) &&
      !!url.username && !!url.password && url.pathname.length > 1 &&
      !["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname) &&
      (!url.searchParams.has("sslmode") || url.searchParams.get("sslmode") === "verify-full");
  }, "Use a hosted Postgres URL with verified TLS."),
  DATABASE_SSL_CA: z.string().optional(),
  APP_ORIGIN: z.string().url().transform((value) => new URL(value).origin),
  PREVIEW_SIGNING_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
});

// Lazy validation allows static builds without connecting or exposing secrets.
export const getSettings = () => settingsSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_SSL_CA: process.env.DATABASE_SSL_CA || undefined,
  APP_ORIGIN: process.env.APP_ORIGIN,
  PREVIEW_SIGNING_SECRET: process.env.PREVIEW_SIGNING_SECRET,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
  GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
});
