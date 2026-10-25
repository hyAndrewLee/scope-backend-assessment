"use client";

import { usePreview } from "./PreviewContext";
import { PreviewHeader } from "./PreviewHeader";
import { PreviewSummary } from "./PreviewSummary";
import { EntryNavigation } from "./EntryNavigation";
import { EntryDetails } from "./EntryDetails";
import { PreviewFooter } from "./PreviewFooter";

export function PreviewDialog() {
  const { open, dialog, busy, onClose, failure, submit } = usePreview();

  if (!open) return null;

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
      <form
        noValidate
        onSubmit={submit}
        className="flex h-full min-h-0 flex-col"
      >
        <PreviewHeader />

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
            <PreviewSummary />
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <EntryNavigation />
              <EntryDetails />
            </div>
          </>
        )}

        <PreviewFooter />
      </form>
    </dialog>
  );
}
