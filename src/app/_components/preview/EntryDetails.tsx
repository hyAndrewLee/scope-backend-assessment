"use client";

import { usePreview } from "./PreviewContext";
import { displayLabel } from "~/features/reconciliation/display";
import { fields, formatValue, kindColors, kindLabels } from "./display";
import { FieldComparison } from "./FieldComparison";

export function EntryDetails() {
  const {
    entry,
    excluded,
    busy,
    outcomeUnknown,
    setExcluded,
    resolveEntry,
    resolution,
    preview,
    editable,
    updateField,
    visibleFields,
    showAllFields,
    setShowAllFields,
    selectedRoom,
  } = usePreview();

  return (
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
                onChange={(event) => setExcluded(event.target.checked)}
                className="accent-purple-500"
              />
              Leave out
            </label>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            {entry.reason}
          </p>
          {entry.kind === "ambiguous" && (
            <label className="mt-3 block text-xs text-amber-200">
              Resolve this showtime
              <select
                aria-label="Resolve this showtime"
                value={
                  resolution?.kind === "new"
                    ? "new"
                    : resolution?.kind === "match"
                      ? `match:${resolution.showtimeId}`
                      : ""
                }
                disabled={busy || outcomeUnknown}
                onChange={(event) => resolveEntry(event.target.value)}
                className="mt-1 w-full rounded border border-amber-500/30 bg-gray-900 px-2 py-2 text-sm text-white"
              >
                <option value="" disabled>
                  Choose an existing screening or add a new one
                </option>
                <option value="new">Add a new showtime</option>
                {preview?.existingShowtimes?.map((row) => (
                  <option key={row.id} value={`match:${row.id}`}>
                    Update {row.movieTitle} ·{" "}
                    {formatValue(row.startTime, "startTime")} · {row.auditorium}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-gray-500">
                Edit the values below. The server will validate your choice
                before saving.
              </span>
            </label>
          )}
          {editable && (
            <div className="mt-3 text-xs text-gray-400">
              <p>
                Movie status applies to all screenings and is saved only on
                confirmation.
              </p>
              {entry.suggestedMovieStatus ? (
                <>
                  <p className="mt-2 text-purple-200">
                    AI suggests: {displayLabel(entry.suggestedMovieStatus)}
                  </p>
                  {entry.movieStatusReason && (
                    <p className="mt-1">{entry.movieStatusReason}</p>
                  )}
                  <button
                    type="button"
                    disabled={busy || outcomeUnknown}
                    onClick={() =>
                      updateField("movieStatus", entry.suggestedMovieStatus!)
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

          <FieldComparison />

          {!visibleFields.length && entry.kind !== "archive" && (
            <p className="py-4 text-sm text-gray-500">
              These values match the current schedule.
            </p>
          )}
          {entry.kind !== "add" &&
            entry.kind !== "ambiguous" &&
            (showAllFields || visibleFields.length < fields.length) && (
              <button
                type="button"
                aria-expanded={showAllFields}
                onClick={() => setShowAllFields(!showAllFields)}
                className="mt-3 rounded py-1 text-xs text-purple-300 hover:text-purple-200 focus-visible:outline-2 focus-visible:outline-purple-400"
              >
                {showAllFields ? "Show differences only" : "Show all details"}
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
          No changes to review. Select All to inspect unchanged showtimes.
        </p>
      )}
    </section>
  );
}
