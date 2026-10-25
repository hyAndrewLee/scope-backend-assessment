import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getSettings } from "../env.js";
import { databaseTls } from "./supabase-ca";

export function createDatabase(connectionString: string) {
  const url = new URL(connectionString);

  url.search = ""; // Pooler/TLS URL hints are not Postgres startup parameters.
  const client = postgres(url.toString(), {
    ssl: databaseTls(url.hostname),
    prepare: false,
    max: 3,
    connect_timeout: 5,
    idle_timeout: 20,
    connection: { statement_timeout: 10000, lock_timeout: 5000 },
  });

  return { client, db: drizzle(client) };
}

let connection: ReturnType<typeof createDatabase> | undefined;

export function getDatabase() {
  const settings = getSettings();

  connection ??= createDatabase(settings.DATABASE_URL);

  return connection.db;
}

export type Database = PostgresJsDatabase;
