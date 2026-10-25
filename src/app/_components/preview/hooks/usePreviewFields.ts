import { availablePreviewFormats } from "~/features/reconciliation/display";
import {
  fieldsSchema,
  movieStatusSchema,
  type Entry,
  type Preview,
  type Showtime,
} from "~/features/reconciliation/schemas";
import { fields, fileValue, type Field } from "../display";
import type { PreviewEdits } from "./usePreviewForm";

type PreviewFieldsInput = {
  preview: Preview | null;
  entries: Entry[];
  entry: Entry | undefined;
  index: number;
  edits: PreviewEdits;
  setEdits: (edits: PreviewEdits) => void;
  editable: boolean;
  selectedMatch: Showtime | undefined;
  formatEntry: Entry | undefined;
  showAllFields: boolean;
};

export function usePreviewFields({
  preview,
  entries,
  entry,
  index,
  edits,
  setEdits,
  editable,
  selectedMatch,
  formatEntry,
  showAllFields,
}: PreviewFieldsInput) {
  const selectedRoom =
    edits[index]?.fields?.auditorium ??
    entry?.after?.auditorium ??
    entry?.original?.auditorium ??
    "";

  const formats =
    preview && formatEntry
      ? availablePreviewFormats(preview, formatEntry, selectedRoom)
      : [];

  const valueFor = (field: Field) =>
    edits[index]?.fields?.[field] ??
    (field === "movieStatus" && entry?.kind === "ambiguous" && selectedMatch
      ? selectedMatch.movieStatus
      : undefined) ??
    entry?.after?.[field] ??
    (field === "movieStatus"
      ? "draft"
      : entry
        ? fileValue(entry, field)
        : undefined) ??
    "";

  const baselineFor = (field: Field) =>
    entry?.before?.[field] ?? (entry ? fileValue(entry, field) : undefined);

  const visibleFields = fields.filter(
    (field) =>
      showAllFields ||
      (field === "movieStatus" && editable) ||
      entry?.kind === "add" ||
      entry?.kind === "ambiguous" ||
      baselineFor(field) !== valueFor(field) ||
      (entry?.original && fileValue(entry, field) !== valueFor(field)),
  );

  const updateField = (field: Field, value: string) => {
    if (!preview || !entry) return;
    if (field === "movieStatus" && entry.after) {
      const movieStatus = movieStatusSchema.parse(value);
      const next = { ...edits };

      entries.forEach((item, itemIndex) => {
        if (
          !item.after ||
          item.after.movieId !== entry.after?.movieId ||
          item.kind === "archive"
        )
          return;
        next[itemIndex] = {
          ...next[itemIndex],
          index: itemIndex,
          fields: { ...next[itemIndex]?.fields, movieStatus },
        };
      });
      setEdits(next);

      return;
    }

    const nextFields = { ...edits[index]?.fields, [field]: value };

    if (field === "auditorium") {
      const allowed = availablePreviewFormats(
        preview,
        formatEntry ?? entry,
        value,
      );

      const current =
        nextFields.format ?? entry.after?.format ?? entry.original?.format;

      if (allowed.length && !allowed.includes(current!))
        nextFields.format = allowed[0];
    }

    setEdits({
      ...edits,
      [index]: { ...edits[index], index, fields: nextFields },
    });
  };

  const updateInputField = (field: Field, value: string) => {
    if (field !== "startTime" && field !== "endTime") {
      updateField(field, value);

      return;
    }

    if (!value) {
      updateField(field, "");

      return;
    }

    const date = new Date(`${value}Z`);

    if (Number.isFinite(date.valueOf())) updateField(field, date.toISOString());
  };

  const fieldRows = visibleFields.map((field) => {
    const old = baselineFor(field);
    const value = valueFor(field);
    const dateField = field === "startTime" || field === "endTime";
    const options: readonly string[] | null =
      field === "auditorium"
        ? (preview?.capabilities?.auditoriums.map((room) => room.name) ?? [])
        : field === "format"
          ? formats
          : field === "language"
            ? fieldsSchema.shape.language.options
            : field === "rating"
              ? fieldsSchema.shape.rating.options
              : field === "movieStatus"
                ? movieStatusSchema.options
                : null;

    return {
      field,
      old,
      value,
      fromFile: entry ? fileValue(entry, field) : undefined,
      changed: old !== value,
      dateField,
      options,
      inputValue:
        dateField && value && Number.isFinite(new Date(value).valueOf())
          ? new Date(value).toISOString().slice(0, 19)
          : value,
    };
  });

  return {
    selectedRoom,
    formats,
    valueFor,
    baselineFor,
    visibleFields,
    fieldRows,
    updateField,
    updateInputField,
  };
}
