"use client";

import { usePreview } from "./PreviewContext";

export function PreviewFooter() {
  const {
    error,
    formState,
    outcomeUnknown,
    hasEdits,
    failure,
    counts,
    changes,
    busy,
    setEdits,
    onClose,
  } = usePreview();

  return (
    <footer className="shrink-0 border-t border-gray-700 px-5 py-3">
      {(error || formState.errors.root?.message) && (
        <p
          role="alert"
          className="mb-2 max-h-32 overflow-auto text-sm whitespace-pre-line text-red-300"
        >
          {outcomeUnknown
            ? error || formState.errors.root?.message
            : formState.errors.root?.message || error}
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
              ? "Edits will be validated when you confirm"
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
              type="submit"
              disabled={busy || formState.isSubmitting}
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
  );
}
