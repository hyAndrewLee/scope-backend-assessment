import { parse } from "csv-parse/sync";
import {
  csvRowSchema,
  type CsvRow,
} from "../../features/reconciliation/schemas";
import { AppError } from "../errors";

const headers = [
  "movie_title",
  "theater_name",
  "auditorium",
  "start_time",
  "end_time",
  "language",
  "format",
  "rating",
  "last_updated",
];
export function parseCsv(bytes: Uint8Array): CsvRow[] {
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
  const supplied = cells.shift() ?? [];
  if (
    supplied.length !== headers.length ||
    new Set(supplied).size !== headers.length ||
    headers.some((h) => !supplied.includes(h)) ||
    !cells.length
  )
    throw new AppError(
      400,
      "Provide the nine documented headers exactly once and at least one record.",
    );
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
    if (!result.success)
      throw new AppError(
        400,
        `CSV row ${index + 2}: ${result.error.issues[0]?.message ?? "Invalid record"}`,
      );
    return result.data;
  });
}
export function uniqueRows(rows: CsvRow[]) {
  return [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()];
}
