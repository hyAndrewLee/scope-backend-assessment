"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import {
  fieldsSchema,
  movieStatusSchema,
  type Entry,
  type Preview,
  type reviewSchema,
} from "~/features/reconciliation/schemas";
import {
  availablePreviewFormats,
  displayLabel,
} from "~/features/reconciliation/display";

type Edits = z.infer<typeof reviewSchema>["edits"];
interface Props {
  preview: Preview | null;
  failure: string | null;
  busy: boolean;
  error: string;
  outcomeUnknown: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onReview: (edits: Edits) => Promise<void>;
}
const fields = [
  "partnerTitle",
  "auditorium",
  "startTime",
  "endTime",
  "language",
  "format",
  "rating",
  "movieStatus",
] as const;
type Field = (typeof fields)[number];
const kindLabels = {
  add: "New",
  update: "Updated",
  archive: "Archive",
  unchanged: "Unchanged",
  ambiguous: "Needs review",
};
const kindColors = {
  add: "text-green-300",
  update: "text-amber-300",
  archive: "text-red-300",
  unchanged: "text-gray-500",
  ambiguous: "text-amber-300",
};
function fileValue(entry: Entry, field: Field) {
  if (field === "movieStatus") return undefined;
  return field === "partnerTitle"
    ? entry.original?.movieTitle
    : entry.original?.[field];
}
function formatValue(value: string | undefined, field?: Field) {
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

export function PreviewModal({
  preview,
  failure,
  busy,
  error,
  outcomeUnknown,
  onClose,
  onConfirm,
  onReview,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [edits, setEdits] = useState<Record<number, Edits[number]>>({});
  const [selected, setSelected] = useState(0);
  const [showAllEntries, setShowAllEntries] = useState(
    () =>
      !!preview && preview.entries.every((entry) => entry.kind === "unchanged"),
  );
  const [showAllFields, setShowAllFields] = useState(false);
  const open = !!preview || !!failure;
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  if (!open) return null;

  const entries = preview?.entries ?? [];
  const included = entries.filter(
    (entry, index) => !(edits[index]?.excluded ?? entry.excluded),
  );
  const counts = { add: 0, update: 0, archive: 0 };
  for (const entry of included)
    if (
      entry.kind === "add" ||
      entry.kind === "update" ||
      entry.kind === "archive"
    )
      counts[entry.kind]++;
  const changes = counts.add + counts.update + counts.archive;
  const changedEntries = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind !== "unchanged");
  const visibleEntries = showAllEntries
    ? entries.map((entry, index) => ({ entry, index }))
    : changedEntries;
  const active =
    visibleEntries.find(({ index }) => index === selected) ?? visibleEntries[0];
  const entry = active?.entry;
  const index = active?.index ?? 0;
  const editable =
    !!entry?.after && ["add", "update", "unchanged"].includes(entry.kind);
  const excluded = entry ? (edits[index]?.excluded ?? entry.excluded) : false;
  const hasEdits = Object.keys(edits).length > 0;
  const selectedRoom =
    edits[index]?.fields?.auditorium ?? entry?.after?.auditorium ?? "";
  const formats =
    preview && entry
      ? availablePreviewFormats(preview, entry, selectedRoom)
      : [];
  const valueFor = (field: Field) =>
    edits[index]?.fields?.[field] ?? entry?.after?.[field] ?? "";
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
      const allowed = availablePreviewFormats(preview, entry, value);
      const current = nextFields.format ?? entry.after?.format;
      if (allowed.length && !allowed.includes(current!))
        nextFields.format = allowed[0];
    }
    setEdits({
      ...edits,
      [index]: { ...edits[index], index, fields: nextFields },
    });
  };
  const changeSelection = (next: number) => {
    setSelected(next);
    setShowAllFields(false);
  };

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="preview-title"
      aria-describedby="preview-description"
      className={`fixed inset-0 m-auto ${failure ? "h-auto" : "h-[90dvh] md:h-[min(80dvh,640px)]"} max-h-[860px] w-[96vw] max-w-5xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900 p-0 text-gray-100 shadow-2xl backdrop:bg-black/70`}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-700 px-5 py-4">
          <div>
            <h2 id="preview-title" className="text-lg font-semibold text-white">
              Review import
            </h2>
            <p id="preview-description" className="mt-1 text-xs text-gray-400">
              {failure
                ? "Your schedule has not changed."
                : "Full theater schedule · Review before saving · Times in UTC"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            disabled={busy}
            className="rounded px-2 text-xl text-gray-400 hover:bg-gray-800 hover:text-white focus-visible:outline-2 focus-visible:outline-purple-400 disabled:opacity-40"
          >
            ×
          </button>
        </header>

        {failure ? (
          <div role="alert" className="min-h-0 flex-1 overflow-auto px-5 py-6">
            <h3 className="font-medium text-red-300">
              Preview could not be generated.
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              No schedule changes were made.
            </p>
            <p className="mt-4 text-sm">{failure}</p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-800 px-5 py-2.5 text-xs">
              <span className="text-green-300">{counts.add} new</span>
              <span className="text-amber-300">{counts.update} updated</span>
              <span className="text-red-300">{counts.archive} to archive</span>
              {preview?.blockers.length ? (
                <details className="basis-full py-1 text-amber-200">
                  <summary className="cursor-pointer">
                    {preview.blockers.length} issue
                    {preview.blockers.length === 1 ? "" : "s"} prevent saving
                  </summary>
                  <ul
                    role="alert"
                    className="mt-2 max-h-28 list-disc space-y-1 overflow-auto pl-4"
                  >
                    {preview.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </details>
              ) : (
                <span role="status" className="ml-auto text-gray-500">
                  {changes ? "Not saved yet" : "No changes detected"}
                </span>
              )}
              {!!preview?.headerMappings?.length && (
                <details className="basis-full py-1 text-amber-200">
                  <summary className="cursor-pointer">
                    {preview.headerMappings.length} column name
                    {preview.headerMappings.length === 1 ? "" : "s"} recognized
                    · review mapping
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {preview.headerMappings.map((mapping) => (
                      <li key={mapping.from}>
                        “{mapping.from}” becomes {displayLabel(mapping.to)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <aside className="flex max-h-40 shrink-0 flex-col border-b border-gray-700 md:max-h-none md:w-56 md:border-r md:border-b-0">
                <div className="flex shrink-0 gap-1 px-3 pt-3 pb-2 text-xs">
                  <button
                    type="button"
                    aria-pressed={!showAllEntries}
                    onClick={() => {
                      setShowAllEntries(false);
                      setShowAllFields(false);
                    }}
                    className={`rounded px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-purple-400 ${!showAllEntries ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
                  >
                    Changes ({changedEntries.length})
                  </button>
                  <button
                    type="button"
                    aria-pressed={showAllEntries}
                    onClick={() => {
                      setSelected(index);
                      setShowAllEntries(true);
                    }}
                    className={`rounded px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-purple-400 ${showAllEntries ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
                  >
                    All ({entries.length})
                  </button>
                </div>
                <nav
                  aria-label="Showtimes to review"
                  className="flex min-h-0 gap-1 overflow-auto px-2 pb-2 md:block md:space-y-0.5"
                >
                  {visibleEntries.map(({ entry: item, index: itemIndex }) => {
                    const row = item.after ?? item.before;
                    const leftOut = edits[itemIndex]?.excluded ?? item.excluded;
                    return (
                      <button
                        key={itemIndex}
                        type="button"
                        aria-current={index === itemIndex ? "true" : undefined}
                        aria-controls="preview-detail"
                        onClick={() => changeSelection(itemIndex)}
                        className={`min-w-44 rounded-md px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-purple-400 md:w-full md:min-w-0 ${index === itemIndex ? "bg-purple-500/10 ring-1 ring-purple-500/30 ring-inset" : "hover:bg-gray-800/70"} ${leftOut ? "opacity-50" : ""}`}
                      >
                        <span className="block truncate text-sm font-medium">
                          {row?.movieTitle ??
                            item.original?.movieTitle ??
                            "Unmatched showtime"}
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-gray-500">
                            {formatValue(
                              row?.startTime ?? item.original?.startTime,
                              "startTime",
                            )}
                          </span>
                          <span className={`shrink-0 ${kindColors[item.kind]}`}>
                            {leftOut ? "Left out" : kindLabels[item.kind]}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </aside>
              <section
                id="preview-detail"
                aria-labelledby="preview-entry-title"
                className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6"
              >
                {entry ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className={`mb-1 text-xs ${kindColors[entry.kind]}`}>
                          {kindLabels[entry.kind]}
                        </p>
                        <h3
                          id="preview-entry-title"
                          className="text-lg font-semibold text-white"
                        >
                          {entry.after?.movieTitle ??
                            entry.before?.movieTitle ??
                            entry.original?.movieTitle}
                        </h3>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 py-1 text-xs text-gray-400">
                        <input
                          type="checkbox"
                          checked={excluded}
                          disabled={busy || outcomeUnknown}
                          onChange={(event) =>
                            setEdits({
                              ...edits,
                              [index]: {
                                ...edits[index],
                                index,
                                excluded: event.target.checked,
                              },
                            })
                          }
                          className="accent-purple-500"
                        />
                        Leave out
                      </label>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-400">
                      {entry.reason}
                    </p>
                    {editable && (
                      <div className="mt-3 text-xs text-gray-400">
                        <p>
                          Movie status applies to all screenings and is saved
                          only on confirmation.
                        </p>
                        {entry.suggestedMovieStatus ? (
                          <>
                            <p className="mt-2 text-purple-200">
                              AI suggests:{" "}
                              {displayLabel(entry.suggestedMovieStatus)}
                            </p>
                            {entry.movieStatusReason && (
                              <p className="mt-1">{entry.movieStatusReason}</p>
                            )}
                            <button
                              type="button"
                              disabled={busy || outcomeUnknown}
                              onClick={() =>
                                updateField(
                                  "movieStatus",
                                  entry.suggestedMovieStatus!,
                                )
                              }
                              className="mt-2 rounded py-1 text-purple-300 underline underline-offset-2 disabled:opacity-40"
                            >
                              Use AI suggestion
                            </button>
                          </>
                        ) : null}
                      </div>
                    )}
                    {entry.kind === "archive" && (
                      <p className="mt-3 text-sm text-red-300">
                        This showtime will be archived, not deleted.
                      </p>
                    )}
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[440px] table-fixed text-left text-sm">
                        <caption className="sr-only">
                          {entry.after?.movieTitle ??
                            entry.original?.movieTitle}
                          : current values and proposed changes. All times are
                          UTC.
                        </caption>
                        <thead className="border-b border-gray-700 text-[11px] text-gray-500">
                          <tr>
                            <th
                              scope="col"
                              className="w-[24%] pb-2 font-normal"
                            >
                              Detail
                            </th>
                            <th
                              scope="col"
                              className="w-[34%] px-2 pb-2 font-normal"
                            >
                              {entry.before
                                ? "Current schedule"
                                : "From your file"}
                            </th>
                            <th
                              scope="col"
                              className="w-[42%] pb-2 pl-2 font-normal text-purple-300"
                            >
                              After saving{editable ? " · editable" : ""}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.kind === "archive" && (
                            <tr className="border-b border-gray-800">
                              <th
                                scope="row"
                                className="py-3 text-xs font-normal text-gray-400"
                              >
                                Status
                              </th>
                              <td className="px-2 py-3 text-gray-400">
                                {displayLabel(entry.before?.status ?? "active")}
                              </td>
                              <td className="py-3 pl-2 text-red-300">
                                Archived
                              </td>
                            </tr>
                          )}
                          {visibleFields.map((field) => {
                            const old = baselineFor(field);
                            const value = valueFor(field);
                            const fromFile = fileValue(entry, field);
                            const changed = old !== value;
                            const dateField =
                              field === "startTime" || field === "endTime";
                            const options: readonly string[] | null =
                              field === "auditorium"
                                ? (preview?.capabilities?.auditoriums.map(
                                    (room) => room.name,
                                  ) ?? [])
                                : field === "format"
                                  ? formats
                                  : field === "language"
                                    ? fieldsSchema.shape.language.options
                                    : field === "rating"
                                      ? fieldsSchema.shape.rating.options
                                      : field === "movieStatus"
                                        ? movieStatusSchema.options
                                        : null;
                            const controlClass = `w-full min-w-0 rounded border border-transparent px-2 py-1.5 text-sm outline-none hover:border-gray-600 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 disabled:opacity-50 ${changed ? "bg-green-500/5 text-green-200" : "bg-transparent text-gray-200"}`;
                            return (
                              <tr
                                key={field}
                                className="border-b border-gray-800/70"
                              >
                                <th
                                  scope="row"
                                  className="py-2.5 pr-2 align-top text-xs font-normal text-gray-400"
                                >
                                  {displayLabel(field)}
                                </th>
                                <td className="px-2 py-2.5 align-top text-xs break-words text-gray-400">
                                  <span
                                    className={
                                      changed && old
                                        ? "line-through decoration-gray-600"
                                        : ""
                                    }
                                  >
                                    {formatValue(old, field)}
                                  </span>
                                  {entry.before &&
                                    fromFile &&
                                    fromFile !== old && (
                                      <span className="mt-1 block text-[11px] text-gray-500">
                                        File: {formatValue(fromFile, field)}
                                      </span>
                                    )}
                                </td>
                                <td className="py-1.5 pl-2 align-top">
                                  {editable ? (
                                    <>
                                      {options ? (
                                        <select
                                          aria-label={`${displayLabel(field)} for showtime ${index + 1}`}
                                          value={
                                            options.includes(value) ? value : ""
                                          }
                                          disabled={
                                            busy ||
                                            outcomeUnknown ||
                                            !options.length
                                          }
                                          onChange={(event) =>
                                            updateField(
                                              field,
                                              event.target.value,
                                            )
                                          }
                                          className={controlClass}
                                        >
                                          <option value="" disabled>
                                            {options.length
                                              ? "Choose…"
                                              : "No compatible options"}
                                          </option>
                                          {options.map((option) => (
                                            <option
                                              key={option}
                                              value={option}
                                              className="bg-gray-900 text-white"
                                            >
                                              {displayLabel(option)}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          aria-label={`${displayLabel(field)} for showtime ${index + 1}`}
                                          type={
                                            dateField
                                              ? "datetime-local"
                                              : "text"
                                          }
                                          step={dateField ? 1 : undefined}
                                          value={
                                            dateField && value
                                              ? new Date(value)
                                                  .toISOString()
                                                  .slice(0, 19)
                                              : value
                                          }
                                          maxLength={256}
                                          disabled={busy || outcomeUnknown}
                                          onChange={(event) => {
                                            if (!dateField)
                                              updateField(
                                                field,
                                                event.target.value,
                                              );
                                            else if (event.target.value) {
                                              const date = new Date(
                                                `${event.target.value}Z`,
                                              );
                                              if (
                                                Number.isFinite(date.valueOf())
                                              )
                                                updateField(
                                                  field,
                                                  date.toISOString(),
                                                );
                                            }
                                          }}
                                          className={controlClass}
                                        />
                                      )}
                                      {field === "format" &&
                                        !formats.length && (
                                          <span className="mt-1 block text-xs text-amber-300">
                                            Choose a compatible auditorium or
                                            leave this change out.
                                          </span>
                                        )}
                                    </>
                                  ) : (
                                    <span className="block px-2 py-1 text-xs text-gray-300">
                                      {entry.after
                                        ? formatValue(entry.after[field], field)
                                        : "Needs a match"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {!visibleFields.length && entry.kind !== "archive" && (
                      <p className="py-4 text-sm text-gray-500">
                        These values match the current schedule.
                      </p>
                    )}
                    {entry.kind !== "add" &&
                      entry.kind !== "ambiguous" &&
                      (showAllFields ||
                        visibleFields.length < fields.length) && (
                        <button
                          type="button"
                          aria-expanded={showAllFields}
                          onClick={() => setShowAllFields(!showAllFields)}
                          className="mt-3 rounded py-1 text-xs text-purple-300 hover:text-purple-200 focus-visible:outline-2 focus-visible:outline-purple-400"
                        >
                          {showAllFields
                            ? "Show differences only"
                            : "Show all details"}
                        </button>
                      )}
                    {entry.after && (
                      <details className="mt-5 text-xs text-gray-500">
                        <summary className="cursor-pointer">
                          Room and format compatibility
                        </summary>
                        <p className="mt-2">
                          Movie:{" "}
                          {preview?.capabilities?.movies
                            .find((movie) => movie.id === entry.after?.movieId)
                            ?.supportedFormats.join(", ") ?? entry.after.format}
                          . Selected room:{" "}
                          {preview?.capabilities?.auditoriums
                            .find((room) => room.name === selectedRoom)
                            ?.supportedFormats.join(", ") ?? "Unknown"}
                          .
                        </p>
                        <ul className="mt-2 space-y-1">
                          {preview?.capabilities?.auditoriums.map((room) => (
                            <li key={room.id}>
                              {room.name}: {room.supportedFormats.join(", ")}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                ) : (
                  <p id="preview-entry-title" className="text-sm text-gray-400">
                    No changes to review. Select All to inspect unchanged
                    showtimes.
                  </p>
                )}
              </section>
            </div>
          </>
        )}

        <footer className="shrink-0 border-t border-gray-700 px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              role="status"
              className={`text-xs ${hasEdits || outcomeUnknown ? "text-amber-200" : "text-gray-500"}`}
            >
              {outcomeUnknown
                ? "Refresh the schedule to check whether changes were saved."
                : hasEdits
                  ? "Edits not checked · Check edits before saving"
                  : failure
                    ? "No schedule changes made"
                    : counts.archive
                      ? `${changes} changes · ${counts.archive} archived, not deleted`
                      : `${changes} changes · Not saved yet`}
            </p>
            <div className="flex flex-wrap gap-2">
              {hasEdits && (
                <>
                  <button
                    type="button"
                    disabled={busy || outcomeUnknown}
                    onClick={() => setEdits({})}
                    className="rounded px-3 py-2 text-xs text-gray-400 hover:text-white disabled:opacity-40"
                  >
                    Discard edits
                  </button>
                  <button
                    type="button"
                    disabled={busy || outcomeUnknown}
                    onClick={() => {
                      void onReview(Object.values(edits))
                        .then(() => setEdits({}))
                        .catch(() => {});
                    }}
                    className="rounded-md border border-purple-500/50 px-3 py-2 text-xs text-purple-200 disabled:opacity-40"
                  >
                    Check edits
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-md border border-gray-600 px-4 py-2 text-xs disabled:opacity-40"
              >
                {failure || outcomeUnknown || !changes ? "Close" : "Cancel"}
              </button>
              {!failure && (
                <button
                  type="button"
                  disabled={
                    busy ||
                    outcomeUnknown ||
                    hasEdits ||
                    !!preview?.blockers.length ||
                    !changes
                  }
                  onClick={onConfirm}
                  className="rounded-md bg-purple-600 px-4 py-2 text-xs font-medium hover:bg-purple-500 disabled:opacity-40"
                >
                  {busy
                    ? "Working…"
                    : `Confirm ${changes} change${changes === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
