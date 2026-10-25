import { useState } from "react";
import axios from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { previewSchema, type Preview } from "~/features/reconciliation/schemas";
import { refreshSchedule } from "~/features/reconciliation/cache";
import { message } from "./errors";
import type { Edits } from "./types";
import type { useTheaterSelection } from "./useTheaterSelection";

export function useTheaterActions(
  selection: ReturnType<typeof useTheaterSelection>,
) {
  const { userId, theaterId } = selection;
  const client = useQueryClient();
  const [token, setToken] = useState<Preview | null>(null);
  const [previewFailure, setPreviewFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const headers = { "x-persona-id": userId, "x-reconciliation-request": "1" };

  // #region Import and schedule mutations
  const preview = token;
  const refresh = () => refreshSchedule(client);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 262144)
        throw new Error(
          "This file is too large. Choose a CSV file smaller than 256 KB.",
        );

      return previewSchema.parse(
        (
          await axios.post<unknown>(
            `/api/theaters/${theaterId}/preview`,
            file,
            {
              headers: {
                ...headers,
                "Content-Type": "text/csv; charset=utf-8",
              },
              timeout: 90000,
            },
          )
        ).data,
      );
    },
    onSuccess: (value) => {
      setToken(value);
      setError("");
      setNotice("");
    },
    onError: (failure) => setPreviewFailure(message(failure)),
    onSettled: refresh,
  });

  const review = useMutation({
    mutationFn: async (edits: Edits) =>
      previewSchema.parse(
        (
          await axios.post<unknown>(
            `/api/theaters/${theaterId}/preview/review`,
            { preview: token, edits },
            { headers },
          )
        ).data,
      ),
    onSuccess: (value) => {
      setToken(value);
      setError("");
    },
    onError: (failure) => setError(message(failure)),
  });

  const confirm = useMutation({
    mutationFn: async (checked: Preview) =>
      (
        await axios.post<unknown>(
          `/api/theaters/${theaterId}/confirm`,
          { preview: checked, acknowledge: true },
          { headers },
        )
      ).data,
    onSuccess: async () => {
      setToken(null);
      setOutcomeUnknown(false);
      setError("");
      setNotice("Your schedule changes have been saved.");
    },
    onError: (failure) => {
      const uncertain =
        !axios.isAxiosError(failure) ||
        !failure.response ||
        failure.response.status >= 500;

      setOutcomeUnknown(uncertain);
      setError(
        uncertain
          ? "Confirmation outcome is unknown. Close and refresh to inspect the saved schedule before uploading again."
          : message(failure),
      );
    },
    // A lost response can still mean the transaction committed.
    onSettled: refresh,
  });

  const status = useMutation({
    mutationFn: async ({ url, value }: { url: string; value: string }) =>
      axios.patch(url, { status: value }, { headers }),
    onSuccess: async () => {
      setError("");
      await refresh();
    },
    onError: async (failure) => {
      setError(message(failure));
      await refresh();
    },
  });

  const clear = useMutation({
    mutationFn: async () =>
      axios.delete(`/api/theaters/${theaterId}/schedule`, {
        headers,
        data: { acknowledge: true },
      }),
    onSuccess: async () => {
      setNotice("The showtimes have been archived. No records were deleted.");
      setError("");
      await refresh();
    },
    onError: (failure) => setError(message(failure)),
  });
  // #endregion

  // #region Lifecycle and semantic actions
  const busy =
    upload.isPending ||
    review.isPending ||
    confirm.isPending ||
    status.isPending ||
    clear.isPending;

  const resetSelection = (id: string) => {
    selection.resetSelection(id);
    setToken(null);
    setPreviewFailure(null);
    setError("");
    setNotice("");
    setOutcomeUnknown(false);
  };

  const selectTheater = (id: string) => {
    selection.selectTheater(id);
    setError("");
    setNotice("");
  };

  const changeFilters = (
    value: Parameters<typeof selection.changeFilters>[0],
  ) => {
    if (!selection.changeFilters(value))
      setError("Check filter values and date order.");
  };

  const uploadFile = (file: File) => {
    setPreviewFailure(null);
    setError("");
    upload.mutate(file);
  };

  const archiveSchedule = () => {
    if (window.confirm("Archive all showtimes for this theater?"))
      clear.mutate();
  };

  const refreshView = () => {
    setOutcomeUnknown(false);
    void refresh();
  };

  const changeMovieStatus = (id: string, value: string) =>
    status.mutate({ url: `/api/movies/${id}`, value });

  const changeShowtimeStatus = (id: string, value: string) =>
    status.mutate({ url: `/api/showtimes/${id}`, value });

  const onClose = () => {
    setToken(null);
    setPreviewFailure(null);
    setError("");
    if (outcomeUnknown) void refresh();
    setOutcomeUnknown(false);
  };

  const onConfirm = async (checked: Preview): Promise<void> => {
    try {
      await confirm.mutateAsync(checked);
    } catch (failure) {
      throw new Error(message(failure));
    }
  };

  const onReview = async (edits: Edits): Promise<Preview> => {
    try {
      return await review.mutateAsync(edits);
    } catch (failure) {
      throw new Error(message(failure));
    }
  };

  // #endregion

  return {
    busy,
    preview,
    previewFailure,
    failure: previewFailure,
    error,
    notice,
    outcomeUnknown,
    resetSelection,
    selectTheater,
    changeFilters,
    uploadFile,
    archiveSchedule,
    refreshView,
    changeMovieStatus,
    changeShowtimeStatus,
    onClose,
    onConfirm,
    onReview,
  };
}
