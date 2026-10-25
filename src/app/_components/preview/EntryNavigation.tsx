"use client";

import { usePreview } from "./PreviewContext";
import { formatValue, kindColors, kindLabels } from "./display";

export function EntryNavigation() {
  const {
    showAllEntries,
    showChanges,
    showEntries,
    changedEntries,
    index,
    entries,
    visibleEntries,
    edits,
    changeSelection,
  } = usePreview();

  return (
    <aside className="flex max-h-40 shrink-0 flex-col border-b border-gray-700 md:max-h-none md:w-56 md:border-r md:border-b-0">
      <div className="flex shrink-0 gap-1 px-3 pt-3 pb-2 text-xs">
        <button
          type="button"
          aria-pressed={!showAllEntries}
          onClick={showChanges}
          className={`rounded px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-purple-400 ${!showAllEntries ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
        >
          Changes ({changedEntries.length})
        </button>
        <button
          type="button"
          aria-pressed={showAllEntries}
          onClick={showEntries}
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
  );
}
