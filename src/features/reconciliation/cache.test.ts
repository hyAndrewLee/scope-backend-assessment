import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { refreshSchedule } from "./cache";

test("refresh invalidates every cached schedule without clearing unrelated data", async () => {
  const client = new QueryClient();
  const keys = [
    ["schedule", "admin", "theater-a", { page: 1 }],
    ["schedule", "admin", "all", { page: 2 }],
    ["schedule", "viewer", "theater-a", { search: "Wonka" }],
  ];

  for (const key of keys) client.setQueryData(key, "old");
  client.setQueryData(["users"], ["admin", "viewer"]);
  await refreshSchedule(client);

  for (const key of keys)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["users"])?.isInvalidated).toBe(false);
  client.clear();
});

test("refresh cancels stale in-flight reads and refetches the active schedule", async () => {
  const client = new QueryClient();
  const key = ["schedule", "admin", "theater-a"];
  let aborted = false;
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: key,
    retry: false,
    queryFn: ({ signal }) => {
      reads++;
      if (reads > 1) return Promise.resolve("saved schedule");
      signal.addEventListener("abort", () => {
        aborted = true;
      });

      return new Promise<string>(() => {});
    },
  });

  const unsubscribe = observer.subscribe(() => {});

  try {
    await refreshSchedule(client);
    expect(aborted).toBe(true);
    expect(reads).toBe(2);
    expect(client.getQueryData(key)).toBe("saved schedule");
  } finally {
    unsubscribe();
    client.clear();
  }
});
