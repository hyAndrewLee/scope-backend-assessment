import { useRef } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { submitPreview } from "~/features/reconciliation/submit-preview";
import type { Preview, reviewSchema } from "~/features/reconciliation/schemas";

export type Edits = z.infer<typeof reviewSchema>["edits"];

export type PreviewEdits = Record<number, Edits[number]>;

type PreviewFormInput = {
  preview: Preview | null;
  failure: string | null;
  busy: boolean;
  outcomeUnknown: boolean;
  onReview: (edits: Edits) => Promise<Preview>;
  onConfirm: (preview: Preview) => Promise<void>;
};

export function usePreviewForm({
  preview,
  failure,
  busy: externalBusy,
  outcomeUnknown,
  onReview,
  onConfirm,
}: PreviewFormInput) {
  const { watch, setValue, handleSubmit, setError, clearErrors, formState } =
    useForm<{
      edits: Record<number, Edits[number]>;
    }>({ defaultValues: { edits: {} }, mode: "onSubmit" });

  const busy = externalBusy || formState.isSubmitting;
  const edits = watch("edits");
  const setEdits = (value: Record<number, Edits[number]>) => {
    setValue("edits", value);
    clearErrors();
  };

  const submitting = useRef(false);
  const submit = handleSubmit(async ({ edits }) => {
    if (busy || submitting.current) return;
    clearErrors();
    if (!preview || failure) return;
    if (outcomeUnknown) {
      setError("root", {
        message:
          "Refresh the schedule to check whether changes were saved before trying again.",
      });

      return;
    }

    submitting.current = true;
    try {
      await submitPreview(preview, Object.values(edits), onReview, onConfirm);
      setEdits({});
    } catch (error) {
      setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Could not save changes. Please try again.",
      });
    } finally {
      submitting.current = false;
    }
  });

  return { busy, submit, formState, edits, setEdits };
}
