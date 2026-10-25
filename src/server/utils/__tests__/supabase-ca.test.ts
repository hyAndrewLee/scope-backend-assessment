import { test, expect } from "bun:test";
import { X509Certificate } from "node:crypto";
import { databaseTls, supabaseCa } from "../../supabase-ca";

test("Supabase public root is pinned while TLS verification remains mandatory", () => {
  const certificate = new X509Certificate(supabaseCa);

  expect(certificate.ca).toBe(true);
  expect(certificate.fingerprint256).toBe(
    "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
  );
  expect(Date.parse(certificate.validTo)).toBeGreaterThan(Date.now());
  for (const host of [
    "db.project.supabase.co",
    "aws-0-us-east-1.pooler.supabase.com",
  ]) {
    expect(databaseTls(host).rejectUnauthorized).toBe(true);
    expect(databaseTls(host).ca).toContain(supabaseCa);
  }

  expect(databaseTls("supabase.co.attacker.example")).toEqual({
    rejectUnauthorized: true,
  });
});
