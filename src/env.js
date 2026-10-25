import { z } from "zod";

export const settingsSchema = z.object({
  DATABASE_URL: z
    .string()
    .max(4096)
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);

        return (
          ["postgres:", "postgresql:"].includes(url.protocol) &&
          !!url.username &&
          !!url.password &&
          url.pathname.length > 1 &&
          !["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(
            url.hostname,
          ) &&
          (!url.searchParams.has("sslmode") ||
            url.searchParams.get("sslmode") === "verify-full")
        );
      } catch {
        return false;
      }
    }, "Use a hosted Postgres URL with verified TLS."),
  APP_ORIGIN: z
    .string()
    .url()
    .transform((value) => new URL(value).origin),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
});

// Lazy validation allows static builds without connecting or exposing secrets.
export const getSettings = () => {
  const result = settingsSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_ORIGIN: process.env.APP_ORIGIN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
  });

  // Server setup failures are not client validation errors; never expose env values.
  if (!result.success) throw new Error("Server configuration is incomplete.");

  return result.data;
};
