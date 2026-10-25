import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import {
  userSchema,
  theaterSchema,
  schedulePageSchema,
} from "~/features/reconciliation/schemas";
import type { useTheaterSelection } from "./useTheaterSelection";

export function useTheaterQueries({
  userId,
  theaterId,
  filters,
  debounced,
}: ReturnType<typeof useTheaterSelection>) {
  const headers = { "x-persona-id": userId, "x-reconciliation-request": "1" };
  const users = useQuery({
    queryKey: ["users"],
    queryFn: async ({ signal }) =>
      userSchema
        .array()
        .parse((await axios.get<unknown>("/api/users", { signal })).data),
  });

  const user = users.data?.find((u) => u.id === userId);
  const theaters = useQuery({
    queryKey: ["theaters", userId],
    enabled: !!user,
    queryFn: async ({ signal }) =>
      theaterSchema
        .array()
        .parse(
          (await axios.get<unknown>("/api/theaters", { headers, signal })).data,
        ),
  });

  const schedule = useQuery({
    queryKey: ["schedule", userId, theaterId, debounced],
    enabled: !!user && !!theaters.data,
    queryFn: async ({ signal }) =>
      schedulePageSchema.parse(
        (
          await axios.get<unknown>("/api/schedule", {
            headers,
            signal,
            params: { ...debounced, theaterId },
          })
        ).data,
      ),
  });

  const data = schedule.data;

  return {
    user,
    users,
    theaters,
    schedule,
    data,
    options: data?.options,
    isAdmin: user?.role === "admin",
    pages: Math.max(1, Math.ceil((data?.total ?? 0) / filters.pageSize)),
    theatersById: Object.fromEntries(
      (theaters.data ?? []).map((t) => [t.id, t]),
    ),
  };
}
