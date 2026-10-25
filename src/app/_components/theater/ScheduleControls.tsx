"use client";

import type { ReactNode } from "react";
import { useTheater } from "../../_context/TheaterContext";

export function ScheduleControls({ children }: { children: ReactNode }) {
  const { controlsDisabled } = useTheater();

  return <fieldset disabled={controlsDisabled}>{children}</fieldset>;
}
