import type { Entry, Preview } from "~/features/reconciliation/schemas";
import type { Edits, PreviewEdits } from "./usePreviewForm";

type PreviewEntriesInput = {
  preview: Preview | null;
  entries: Entry[];
  entry: Entry | undefined;
  index: number;
  edits: PreviewEdits;
  setEdits: (edits: PreviewEdits) => void;
};

export function usePreviewEntries({
  preview,
  entries,
  entry,
  index,
  edits,
  setEdits,
}: PreviewEntriesInput) {
  const counts = { add: 0, update: 0, archive: 0 };

  for (const [index, entry] of entries.entries()) {
    if (edits[index]?.excluded ?? entry.excluded) continue;
    const resolution = edits[index]?.resolution;
    const kind =
      entry.kind === "ambiguous" && resolution
        ? resolution.kind === "new"
          ? "add"
          : "update"
        : entry.kind;

    if (kind === "add" || kind === "update" || kind === "archive")
      counts[kind]++;
  }

  const changes = counts.add + counts.update + counts.archive;

  const editable =
    !!entry &&
    ((!!entry.after && ["add", "update", "unchanged"].includes(entry.kind)) ||
      (entry.kind === "ambiguous" && !!entry.original));

  const resolution = edits[index]?.resolution;
  const selectedMatch =
    resolution?.kind === "match"
      ? preview?.existingShowtimes?.find(
          (row) => row.id === resolution.showtimeId,
        )
      : undefined;

  const formatEntry =
    entry && selectedMatch
      ? {
          ...entry,
          after: {
            ...(entry.after ?? selectedMatch),
            movieId: selectedMatch.movieId,
          },
        }
      : entry;

  const excluded = entry ? (edits[index]?.excluded ?? entry.excluded) : false;
  const hasEdits = Object.keys(edits).length > 0;

  const setExcluded = (excluded: boolean) => {
    setEdits({
      ...edits,
      [index]: { ...edits[index], index, excluded },
    });
  };

  const resolveEntry = (value: string) => {
    const resolution: Edits[number]["resolution"] =
      value === "new"
        ? { kind: "new" }
        : { kind: "match", showtimeId: value.slice(6) };

    setEdits({
      ...edits,
      [index]: { ...edits[index], index, resolution },
    });
  };

  return {
    selectedMatch,
    formatEntry,
    state: {
      counts,
      changes,
      editable,
      resolution,
      excluded,
      hasEdits,
      setExcluded,
      resolveEntry,
    },
  };
}
