import { test, expect } from "bun:test";
import { parseCsv, uniqueRows } from "../csv";
const header =
  "movie_title,theater_name,auditorium,start_time,end_time,language,format,rating,last_updated";
const row =
  '"Movie, One",Downtown,Aud 1,2025-03-15T18:00:00Z,2025-03-15T20:00:00Z,EN,2D,PG,2025-03-10T00:00:00Z';
const bytes = (value: string) => new TextEncoder().encode(value);
test("CSV handles quoted commas, normalizes timestamps, and deduplicates", () => {
  const rows = parseCsv(bytes(`${header}\n${row}\n${row}\n`));
  expect(rows[0]?.movieTitle).toBe("Movie, One");
  expect(rows[0]?.startTime).toBe("2025-03-15T18:00:00.000Z");
  expect(uniqueRows(rows)).toHaveLength(1);
});
test("invalid headers, empty uploads, bad times, encoding and limits are rejected", () => {
  for (const value of [
    header,
    "",
    `${header.replace("rating", "format")}\n${row}`,
    `${header}\n${row.replace("20:00:00Z", "17:00:00Z")}`,
    `${header}\n${Array(101).fill(row).join("\n")}`,
  ])
    expect(() => parseCsv(bytes(value))).toThrow();
  expect(() => parseCsv(new Uint8Array([255]))).toThrow();
  expect(() => parseCsv(new Uint8Array(262145))).toThrow();
});
