"use client";

import { usePreview } from "./PreviewContext";
import { displayLabel } from "~/features/reconciliation/display";

export function PreviewSummary() {
  const { counts, preview, changes } = usePreview();

  return (
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
            {preview.headerMappings.length === 1 ? "" : "s"} recognized · review
            mapping
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
  );
}
