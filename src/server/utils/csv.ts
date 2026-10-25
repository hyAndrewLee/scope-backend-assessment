import { parse } from "csv-parse/sync";
import {
  csvRowSchema,
  type CsvRow,
} from "../../features/reconciliation/schemas";
import { AppError } from "../errors";
import { displayLabel } from "../../features/reconciliation/display";
import { nameKey } from "./reconciliation";

import { exactHeaders, validateHeaderMapping } from "./headers";

function readCells(bytes: Uint8Array): string[][] {
  if (bytes.byteLength > 262144)
    throw new AppError(413, "CSV exceeds 256 KiB.");
  let cells: string[][];
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
      throw new Error();
    let count = 0;
    cells = parse(text.trimEnd(), {
      bom: true,
      columns: false,
      max_record_size: 8192,
      on_record(record: string[]) {
        if (++count > 101) throw new Error();
        return record;
      },
    }) as string[][];
  } catch {
    throw new AppError(
      400,
      "Invalid CSV; use UTF-8, consistent columns, and at most 100 records.",
    );
  }
  if (cells.length < 2)
    throw new AppError(
      400,
      "Provide a header and at least one schedule record.",
    );
  return cells;
}
export function csvHeaders(bytes: Uint8Array) {
  return readCells(bytes)[0]!;
}
export function parseCsv(bytes: Uint8Array, mapping?: string[]): CsvRow[] {
  const cells = readCells(bytes);
  const raw = cells.shift()!;
  const supplied = mapping
    ? validateHeaderMapping(raw, mapping)
    : exactHeaders(raw);
  if (!supplied)
    throw new AppError(400, "Column names need AI matching or correction.");
  return cells.map((row, index) => {
    const data = Object.fromEntries(
      supplied.map((h, i) => [h, row[i]?.normalize("NFC").trim()]),
    );
    const result = csvRowSchema.safeParse({
      movieTitle: data.movie_title,
      theaterName: data.theater_name,
      auditorium: data.auditorium,
      startTime: data.start_time,
      endTime: data.end_time,
      language: data.language,
      format: data.format,
      rating: data.rating,
      partnerLastUpdated: data.last_updated,
    });
    if (!result.success) {
      const issue = result.error.issues[0]!;
      // The only row-level refinement checks end time against start time.
      const field = String(issue.path[0] ?? "endTime");
      const allowed =
        field === "language"
          ? csvRowSchema.shape.language.options
          : field === "format"
            ? csvRowSchema.shape.format.options
            : field === "rating"
              ? csvRowSchema.shape.rating.options
              : undefined;
      const message = allowed
        ? `Choose one of: ${allowed.map((value) => (displayLabel(value) === value ? value : `${displayLabel(value)} (${value})`)).join(", ")}.`
        : issue.code === "too_small"
          ? "This field is required."
          : issue.code === "too_big"
            ? `Use no more than ${issue.maximum} characters.`
            : field === "startTime" ||
                field === "endTime" ||
                field === "partnerLastUpdated"
              ? issue.code === "custom"
                ? "The end time must be later than the start time."
                : "Use a valid date and time with a timezone, such as 2025-03-15T18:00:00Z."
              : "Check this value and try again.";
      throw new AppError(
        400,
        `CSV row ${index + 2} · ${displayLabel(field)}: ${message}`,
      );
    }
    return result.data;
  });
}
export function uniqueRows(rows: CsvRow[]) {
  const unique = [
    ...new Map(rows.map((row) => [JSON.stringify(row), row])).values(),
  ];
  const screenings = new Set<string>();
  for (const row of unique) {
    const key = JSON.stringify([
      row.theaterName,
      nameKey(row.movieTitle),
      row.startTime,
    ]);
    if (screenings.has(key))
      throw new AppError(
        409,
        `“${row.movieTitle}” is listed more than once at ${row.startTime} with different details. Keep one row for this movie and start time, then upload again.`,
      );
    screenings.add(key);
  }
  return unique;
}
