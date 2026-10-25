"use client";

import { createContext, useContext, type ReactNode } from "react";
import { message } from "./hooks/errors";
import { useTheaterSelection } from "./hooks/useTheaterSelection";
import { useTheaterQueries } from "./hooks/useTheaterQueries";
import { useTheaterActions } from "./hooks/useTheaterActions";

export type { Edits } from "./hooks/types";

function useTheaterState() {
  const selection = useTheaterSelection();
  const queries = useTheaterQueries(selection);
  const actions = useTheaterActions(selection);
  const { users, theaters, schedule } = queries;
  const { busy, preview, previewFailure, error } = actions;

  return {
    userId: selection.userId,
    theaterId: selection.theaterId,
    filters: selection.filters,
    searchSchedule: selection.searchSchedule,
    sortSchedule: selection.sortSchedule,
    previousPage: selection.previousPage,
    nextPage: selection.nextPage,
    changePageSize: selection.changePageSize,
    ...queries,
    ...actions,
    controlsDisabled: busy || !!preview || !!previewFailure,
    loading:
      users.isFetching || theaters.isFetching || schedule.isFetching || busy,
    feedbackError:
      error ||
      (users.error || theaters.error || schedule.error
        ? message(users.error ?? theaters.error ?? schedule.error)
        : ""),
  };
}

export type TheaterContextValue = ReturnType<typeof useTheaterState>;

export type PreviewSource = Pick<
  TheaterContextValue,
  | "preview"
  | "failure"
  | "busy"
  | "error"
  | "outcomeUnknown"
  | "onClose"
  | "onConfirm"
  | "onReview"
>;

export const TheaterContext = createContext<TheaterContextValue | null>(null);

export const PreviewSourceContext = createContext<PreviewSource | null>(null);

export function TheaterProvider({ children }: { children: ReactNode }) {
  const value = useTheaterState();

  return (
    <TheaterContext.Provider value={value}>
      <PreviewSourceContext.Provider value={value}>
        {children}
      </PreviewSourceContext.Provider>
    </TheaterContext.Provider>
  );
}

export function useTheater() {
  const context = useContext(TheaterContext);

  if (!context)
    throw new Error("useTheater must be used within TheaterProvider.");

  return context;
}

export function usePreviewSource() {
  const context = useContext(PreviewSourceContext);

  if (!context)
    throw new Error(
      "usePreviewSource must be used within PreviewSourceContext.",
    );

  return context;
}
