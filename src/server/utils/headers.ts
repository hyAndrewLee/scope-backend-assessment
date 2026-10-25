import { AppError } from "../errors";
export const CSV_HEADERS = [
  "movie_title",
  "theater_name",
  "auditorium",
  "start_time",
  "end_time",
  "language",
  "format",
  "rating",
  "last_updated",
] as const;
export type CsvHeader = (typeof CSV_HEADERS)[number];
const key = (value: string) => value.toLowerCase().replace(/[\s_-]/g, "");
export function checkRawHeaders(headers: string[]) {
  if (
    headers.length !== CSV_HEADERS.length ||
    headers.some(
      (h) => h.length > 64 || !/^[a-zA-Z][a-zA-Z0-9 _-]*$/.test(h),
    ) ||
    new Set(headers.map(key)).size !== headers.length ||
    headers.some(
      (header) =>
        !CSV_HEADERS.some(
          (allowed) => distance(key(header), key(allowed)) <= 2,
        ),
    )
  )
    throw new AppError(
      400,
      "Use nine distinct short column names. Instruction-like or duplicate headers are rejected.",
    );
}
export function exactHeaders(headers: string[]): CsvHeader[] | null {
  checkRawHeaders(headers);
  const mapped = headers.map((h) =>
    CSV_HEADERS.find((name) => key(name) === key(h)),
  );
  return mapped.every((h) => h !== undefined) ? (mapped as CsvHeader[]) : null;
}
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1]! + 1,
        row[j]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length]!;
}
export function validateHeaderMapping(
  headers: string[],
  mapped: string[],
): CsvHeader[] {
  checkRawHeaders(headers);
  if (
    mapped.length !== CSV_HEADERS.length ||
    new Set(mapped).size !== CSV_HEADERS.length ||
    mapped.some((h) => !CSV_HEADERS.includes(h as CsvHeader))
  )
    throw new AppError(
      400,
      "AI could not map each column exactly once; correct the headers.",
    );
  for (const [i, header] of headers.entries()) {
    const canonical = CSV_HEADERS.find((h) => key(h) === key(header));
    if (
      (canonical && canonical !== mapped[i]) ||
      distance(key(header), key(mapped[i]!)) > 2
    )
      throw new AppError(
        400,
        "Unsafe or uncertain header mapping; correct the column names.",
      );
  }
  return mapped as CsvHeader[];
}
