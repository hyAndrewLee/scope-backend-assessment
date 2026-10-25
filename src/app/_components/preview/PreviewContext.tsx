"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePreviewSource } from "../../_context/TheaterContext";
import { usePreviewForm } from "./hooks/usePreviewForm";
import { usePreviewDisplay } from "./hooks/usePreviewDisplay";
import { usePreviewEntries } from "./hooks/usePreviewEntries";
import { usePreviewFields } from "./hooks/usePreviewFields";

export type { Edits } from "./hooks/usePreviewForm";

function usePreviewState() {
  const source = usePreviewSource();
  const form = usePreviewForm(source);
  const display = usePreviewDisplay(source.preview, source.failure);
  const entries = usePreviewEntries({
    preview: source.preview,
    entries: display.entries,
    entry: display.entry,
    index: display.index,
    edits: form.edits,
    setEdits: form.setEdits,
  });

  const fields = usePreviewFields({
    preview: source.preview,
    entries: display.entries,
    entry: display.entry,
    index: display.index,
    edits: form.edits,
    setEdits: form.setEdits,
    editable: entries.state.editable,
    selectedMatch: entries.selectedMatch,
    formatEntry: entries.formatEntry,
    showAllFields: display.showAllFields,
  });

  return {
    ...source,
    ...form,
    ...display,
    ...entries.state,
    ...fields,
  };
}

const PreviewContext = createContext<ReturnType<typeof usePreviewState> | null>(
  null,
);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const value = usePreviewState();

  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}

export function usePreview() {
  const value = useContext(PreviewContext);

  if (!value) throw new Error("Preview components require PreviewProvider");

  return value;
}
