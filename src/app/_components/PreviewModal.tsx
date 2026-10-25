"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { Preview, reviewSchema } from "~/features/reconciliation/schemas";

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
] as const;
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
  const changes =
    preview?.entries.filter(
      (e) => !e.excluded && ["add", "update", "archive"].includes(e.kind),
    ).length ?? 0;
  const hasEdits = Object.keys(edits).length > 0;
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="preview-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-11/12 max-w-6xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900 p-0 text-white shadow-2xl backdrop:bg-black/70"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <header className="shrink-0 border-b border-gray-700 px-6 py-4">
          <h2 id="preview-title" className="text-2xl font-bold">
            Preview Changes
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Full theater schedule · Nothing changes until confirmation
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {failure ? (
            <div role="alert">
              <h3 className="text-lg text-red-300">
                Preview could not be generated.
              </h3>
              <p>No schedule changes were made.</p>
              <p className="mt-3 text-gray-400">{failure}</p>
            </div>
          ) : (
            <>
              <p role="status" className="mb-4 text-gray-300">
                {changes === 0 && !preview?.blockers.length
                  ? "No changes detected."
                  : `${changes} proposed changes. Missing screenings will be archived, not deleted.`}
              </p>
              {!!preview?.blockers.length && (
                <ul
                  role="alert"
                  className="mb-4 list-disc space-y-2 pl-5 text-amber-300"
                >
                  {preview.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {!!preview?.headerMappings?.length && (
                <div className="mb-4 text-sm text-amber-200">
                  <h3 className="font-semibold">
                    Recognized column names · review these mappings
                  </h3>
                  <ul>
                    {preview.headerMappings.map((m) => (
                      <li key={m.from}>
                        {m.from} becomes {m.to}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!preview?.capabilities?.auditoriums.length && (
                <details className="mb-4 text-sm text-gray-400">
                  <summary>Available auditoriums and formats</summary>
                  <ul>
                    {preview.capabilities.auditoriums.map((room) => (
                      <li key={room.id}>
                        {room.name}: {room.supportedFormats.join(", ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <datalist id="auditorium-options">
                {preview?.capabilities?.auditoriums.map((room) => (
                  <option key={room.id} value={room.name}>
                    {room.supportedFormats.join(", ")}
                  </option>
                ))}
              </datalist>
              <p className="mb-4 text-sm text-gray-400">
                Edit proposed values or exclude a proposal, then validate edits
                before confirming. Movie identity and review status are
                protected.
              </p>
              {preview?.entries.map((entry, index) => {
                const editable =
                  !!entry.after &&
                  ["add", "update", "unchanged"].includes(entry.kind);
                const original = entry.original;
                return (
                  <section
                    key={index}
                    className="mb-5 rounded-lg border border-gray-700 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold">
                        {entry.kind.toUpperCase()} ·{" "}
                        {entry.after?.movieTitle ?? original?.movieTitle}
                      </h3>
                      <label className="text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={edits[index]?.excluded ?? entry.excluded}
                          disabled={busy || outcomeUnknown}
                          onChange={(e) =>
                            setEdits({
                              ...edits,
                              [index]: {
                                ...edits[index],
                                index,
                                excluded: e.target.checked,
                              },
                            })
                          }
                        />{" "}
                        Exclude
                      </label>
                    </div>
                    <p className="mb-3 text-sm text-gray-400">{entry.reason}</p>
                    {entry.after && (
                      <p className="mb-3 text-xs text-gray-500">
                        Movie formats:{" "}
                        {preview.capabilities?.movies
                          .find((m) => m.id === entry.after?.movieId)
                          ?.supportedFormats.join(", ") ??
                          "New movie: formats from included proposals"}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="font-semibold text-gray-400">
                        Original CSV / saved screening
                      </div>
                      <div className="font-semibold text-purple-300">
                        Proposed values
                      </div>
                      {fields.map((field) => {
                        const old =
                          field === "partnerTitle"
                            ? (original?.movieTitle ??
                              entry.before?.partnerTitle)
                            : (original?.[field] ?? entry.before?.[field]);
                        const value =
                          edits[index]?.fields?.[field] ??
                          entry.after?.[field] ??
                          "";
                        return (
                          <div key={field} className="contents">
                            <div className="break-words text-gray-400">
                              <span className="block text-xs">{field}</span>
                              {old ?? "—"}
                            </div>
                            {editable ? (
                              <label className="text-xs text-gray-400">
                                {field}
                                <input
                                  aria-label={`${field} proposal ${index + 1}`}
                                  value={value}
                                  list={
                                    field === "auditorium"
                                      ? "auditorium-options"
                                      : undefined
                                  }
                                  maxLength={256}
                                  disabled={busy || outcomeUnknown}
                                  onChange={(e) =>
                                    setEdits({
                                      ...edits,
                                      [index]: {
                                        ...edits[index],
                                        index,
                                        fields: {
                                          ...edits[index]?.fields,
                                          [field]: e.target.value,
                                        },
                                      },
                                    })
                                  }
                                  className={`mt-1 w-full rounded border bg-gray-800 p-2 text-sm text-white ${old !== value ? "border-amber-600" : "border-gray-600"}`}
                                />
                              </label>
                            ) : (
                              <div className="text-gray-300">
                                {entry.after?.[field] ?? "Unresolved"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {entry.kind === "archive" && (
                      <p className="mt-3 text-red-300">
                        Saved status will become archived.
                      </p>
                    )}
                  </section>
                );
              })}
              <p className="text-xs text-gray-500">
                Revision {preview?.revision} · {preview?.model}
              </p>
            </>
          )}
        </div>
        <footer className="shrink-0 border-t border-gray-700 px-6 py-4">
          {error && (
            <p role="alert" className="mb-3 text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            {hasEdits && (
              <>
                <button
                  disabled={busy || outcomeUnknown}
                  onClick={() => setEdits({})}
                  className="px-4 py-2 text-gray-300"
                >
                  Discard edits
                </button>
                <button
                  disabled={busy || outcomeUnknown}
                  onClick={() => {
                    void onReview(Object.values(edits))
                      .then(() => setEdits({}))
                      .catch(() => {});
                  }}
                  className="rounded-lg border border-purple-500 px-4 py-2"
                >
                  Validate edits
                </button>
              </>
            )}
            <button
              disabled={busy}
              onClick={onClose}
              className="rounded-lg border border-gray-600 px-6 py-2"
            >
              {failure || outcomeUnknown || changes === 0 ? "Close" : "Cancel"}
            </button>
            {!failure && (
              <button
                disabled={
                  busy ||
                  outcomeUnknown ||
                  hasEdits ||
                  !!preview?.blockers.length ||
                  !changes
                }
                onClick={onConfirm}
                className="rounded-lg bg-purple-600 px-6 py-2 disabled:opacity-50"
              >
                {busy ? "Working…" : "Confirm Changes"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
