import { useEffect, useRef, useState } from "react";
import type { Preview } from "~/features/reconciliation/schemas";

export function usePreviewDisplay(
  preview: Preview | null,
  failure: string | null,
) {
  const dialog = useRef<HTMLDialogElement>(null);
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

  const entries = preview?.entries ?? [];
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

  const changeSelection = (next: number) => {
    setSelected(next);
    setShowAllFields(false);
  };

  const showChanges = () => {
    setShowAllEntries(false);
    setShowAllFields(false);
  };

  const showEntries = () => {
    setSelected(index);
    setShowAllEntries(true);
  };

  return {
    dialog,
    open,
    showAllEntries,
    showChanges,
    showEntries,
    showAllFields,
    setShowAllFields,
    entries,
    changedEntries,
    visibleEntries,
    entry,
    index,
    changeSelection,
  };
}
