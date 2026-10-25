"use client";

import { usePreviewSource } from "../_context/TheaterContext";
import { PreviewProvider } from "./preview/PreviewContext";
import { PreviewDialog } from "./preview/PreviewDialog";

export function PreviewModal() {
  const { failure, preview } = usePreviewSource();

  return (
    <PreviewProvider key={failure ?? (preview ? "preview" : "closed")}>
      <PreviewDialog />
    </PreviewProvider>
  );
}
