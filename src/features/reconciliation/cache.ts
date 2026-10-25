import type { QueryClient } from "@tanstack/react-query";

export async function refreshSchedule(client: QueryClient) {
  // Schedules are shared across personas, theaters, filters, and pages.
  const filters = { queryKey: ["schedule"] };

  await client.cancelQueries(filters);
  await client.invalidateQueries(filters);
}
