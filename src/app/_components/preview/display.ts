import type { Entry } from "~/features/reconciliation/schemas";
import { displayLabel } from "~/features/reconciliation/display";

export const fields = [
  "partnerTitle",
  "auditorium",
  "startTime",
  "endTime",
  "language",
  "format",
  "rating",
  "movieStatus",
] as const;

export type Field = (typeof fields)[number];

export const kindLabels = {
  add: "New",
  update: "Updated",
  archive: "Archive",
  unchanged: "Unchanged",
  ambiguous: "Needs review",
};

export const kindColors = {
  add: "text-green-300",
  update: "text-amber-300",
  archive: "text-red-300",
  unchanged: "text-gray-500",
  ambiguous: "text-amber-300",
};

export function fileValue(entry: Entry, field: Field) {
  if (field === "movieStatus") return undefined;

  return field === "partnerTitle"
    ? entry.original?.movieTitle
    : entry.original?.[field];
}

export function formatValue(value: string | undefined, field?: Field) {
  if (!value) return "—";
  if (field === "startTime" || field === "endTime") {
    const date = new Date(value);

    return Number.isFinite(date.valueOf())
      ? date.toLocaleString(undefined, {
          timeZone: "UTC",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : value;
  }

  return displayLabel(value);
}
