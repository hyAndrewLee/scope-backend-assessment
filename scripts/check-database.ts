import { sql } from "drizzle-orm";
import { createDatabase } from "../src/server/database";
import { getSettings } from "../src/env.js";
const settings = getSettings();
const { client, db } = createDatabase(settings.DATABASE_URL, settings.DATABASE_SSL_CA);
try {
  await db.execute(sql`select 1`);
  console.log("Hosted database connection verified.");
} catch {
  console.error("Hosted database connection failed; check URL, TLS CA, and role grants.");
  process.exitCode = 1;
} finally { await client.end(); }
