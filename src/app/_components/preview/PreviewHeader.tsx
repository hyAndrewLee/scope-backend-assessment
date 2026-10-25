"use client";

import { usePreview } from "./PreviewContext";

export function PreviewHeader() {
  const { failure, onClose, busy } = usePreview();

  return (
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
  );
}
