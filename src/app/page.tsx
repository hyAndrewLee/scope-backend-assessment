"use client";

import { useState } from "react";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useDebounce } from "~/lib/hooks/useDebounce";
import {
  filtersSchema,
  userSchema,
  theaterSchema,
  schedulePageSchema,
  signedPreviewSchema,
  previewSchema,
  movieStatusSchema,
  type SignedPreview,
  type reviewSchema,
} from "~/features/reconciliation/schemas";
import { FileUpload } from "./_components/FileUpload";
import { FilterBar } from "./_components/FilterBar";
import { PreviewModal } from "./_components/PreviewModal";
import { ShowtimesTable } from "./_components/ShowtimesTable";

type Edits = z.infer<typeof reviewSchema>["edits"];
function message(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = z
      .object({ error: z.string() })
      .safeParse(error.response?.data);
    if (body.success) return body.data.error;
    return "Server request failed. No fallback data was used.";
  }
  return error instanceof Error ? error.message : "Request failed.";
}
export default function Home() {
  const client = useQueryClient();
  const [userId, setUserId] = useState("");
  const [theaterId, setTheaterId] = useState("all");
  const [filters, setFilters] = useState(filtersSchema.parse({}));
  const debounced = useDebounce(filters, 300);
  const [token, setToken] = useState<SignedPreview | null>(null);
  const [previewFailure, setPreviewFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
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
  const preview = token ? previewSchema.parse(JSON.parse(token.payload)) : null;
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["schedule", userId] });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 262144) throw new Error("CSV exceeds 256 KiB.");
      return signedPreviewSchema.parse(
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
  });
  const review = useMutation({
    mutationFn: async (edits: Edits) =>
      signedPreviewSchema.parse(
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
    mutationFn: async () =>
      (
        await axios.post<unknown>(
          `/api/theaters/${theaterId}/confirm`,
          { preview: token, acknowledge: true },
          { headers },
        )
      ).data,
    onSuccess: async () => {
      setToken(null);
      setOutcomeUnknown(false);
      setError("");
      setNotice("Changes saved to the hosted database.");
      await refresh();
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
      setNotice("Schedule archived in the hosted database.");
      setError("");
      await refresh();
    },
    onError: (failure) => setError(message(failure)),
  });
  const busy =
    upload.isPending ||
    review.isPending ||
    confirm.isPending ||
    status.isPending ||
    clear.isPending;
  const isAdmin = user?.role === "admin";
  const data = schedule.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / filters.pageSize));
  const resetSelection = (id: string) => {
    setUserId(id);
    setTheaterId("all");
    setFilters(filtersSchema.parse({}));
    setToken(null);
    setPreviewFailure(null);
    setError("");
    setNotice("");
    setOutcomeUnknown(false);
  };
  const options = data?.options;
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1a0b2e] to-[#0f0720]">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold text-white">
              Theater Showtimes Manager
            </h1>
            <p className="text-gray-400">
              Upload partner CSV files to manage showtimes
            </p>
          </div>
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-4">
            <p className="text-xs text-gray-500 uppercase">
              Demo persona · not authentication
            </p>
            <div className="mt-2 flex flex-col gap-3">
              <select
                aria-label="Demo persona"
                value={userId}
                onChange={(e) => resetSelection(e.target.value)}
                disabled={busy || !!token || !!previewFailure}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
              >
                <option value="">Select a user</option>
                {users.data?.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.role})
                  </option>
                ))}
              </select>
              {user ? (
                <div className="text-sm text-gray-400">
                  <div className="flex items-center justify-between">
                    <span>{user.name}</span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${isAdmin ? "bg-purple-900 text-purple-200" : "bg-gray-700 text-gray-200"}`}
                    >
                      {user.role}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Theaters:{" "}
                    {user.allTheaters ? "All" : user.theaterIds.length}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">No user selected.</div>
              )}
              <button
                onClick={() => resetSelection("")}
                disabled={busy || !!token || !!previewFailure}
                className="rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-300"
              >
                Clear selection
              </button>
            </div>
          </div>
        </div>
        <fieldset disabled={busy || !!token || !!previewFailure}>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor="theater"
                className="text-xs font-semibold text-gray-400 uppercase"
              >
                Theater Scope
              </label>
              <select
                id="theater"
                value={theaterId}
                onChange={(e) => {
                  setTheaterId(e.target.value);
                  setFilters(filtersSchema.parse({}));
                  setError("");
                  setNotice("");
                }}
                disabled={!theaters.data?.length}
                className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
              >
                <option value="all">All accessible theaters</option>
                {theaters.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <FileUpload
              onFileSelect={(file) => {
                setPreviewFailure(null);
                setError("");
                upload.mutate(file);
              }}
              disabled={!isAdmin || theaterId === "all" || !data}
            />
            <button
              onClick={() => {
                if (window.confirm("Archive all showtimes for this theater?"))
                  clear.mutate();
              }}
              disabled={!isAdmin || theaterId === "all"}
              className="rounded-lg border border-red-600 px-6 py-3 font-semibold text-red-400 disabled:opacity-50"
            >
              Clear Schedule
            </button>
            <button
              onClick={() => {
                setOutcomeUnknown(false);
                void refresh();
              }}
              disabled={!user}
              className="rounded-lg border border-gray-600 px-4 py-3 text-gray-300"
            >
              Refresh schedule
            </button>
            <div className="ml-auto text-sm text-gray-400">
              {data
                ? `${data.activeCount} active · ${data.total} matching showtimes`
                : ""}
            </div>
          </div>
          {!isAdmin && (
            <div className="mb-6 rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
              Read-only mode. Admin personas can upload CSVs and update status.
            </div>
          )}
          {(users.isFetching ||
            theaters.isFetching ||
            schedule.isFetching ||
            busy) && (
            <p role="status" className="mb-4 text-purple-300">
              Loading…
            </p>
          )}
          {(error || users.error || theaters.error || schedule.error) && (
            <p role="alert" className="mb-4 text-red-300">
              {error ||
                message(users.error ?? theaters.error ?? schedule.error)}
            </p>
          )}
          {notice && (
            <p role="status" className="mb-4 text-green-300">
              {notice}
            </p>
          )}
          {!user ? (
            <p className="text-gray-400">
              Select a demo persona to load the hosted schedule.
            </p>
          ) : theaters.data?.length === 0 ? (
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-8 text-center text-gray-400">
              This user does not belong to any theaters yet.
            </div>
          ) : (
            <>
              <FilterBar
                {...filters}
                onFilterChange={(value) => {
                  const parsed = filtersSchema.safeParse({
                    ...filters,
                    ...value,
                    page: 1,
                  });
                  if (parsed.success) setFilters(parsed.data);
                  else setError("Check filter values and date order.");
                }}
                availableFormats={options?.formats ?? []}
                availableLanguages={options?.languages ?? []}
                availableRatings={options?.ratings ?? []}
                availableAuditoriums={options?.auditoriums ?? []}
                availableMovieStatuses={options?.movieStatuses ?? []}
              />
              <div
                className="rounded-lg border border-gray-700 bg-gray-900 p-6"
                aria-busy={schedule.isFetching}
              >
                <ShowtimesTable
                  showtimes={data?.showtimes ?? []}
                  theatersById={Object.fromEntries(
                    (theaters.data ?? []).map((t) => [t.id, t]),
                  )}
                  showTheaterColumn={theaterId === "all"}
                  isAdmin={!!isAdmin}
                  movieStatusOptions={[...movieStatusSchema.options]}
                  statusOptions={["active", "inactive", "archived"]}
                  searchQuery={filters.search}
                  sortField={filters.sort}
                  sortOrder={filters.order}
                  onSearchChange={(search) =>
                    setFilters({ ...filters, search, page: 1 })
                  }
                  onSortChange={(sort, order) =>
                    setFilters({ ...filters, sort, order, page: 1 })
                  }
                  onMovieStatusChange={(id, value) =>
                    status.mutate({ url: `/api/movies/${id}`, value })
                  }
                  onStatusChange={(id, value) =>
                    status.mutate({ url: `/api/showtimes/${id}`, value })
                  }
                />
                <div className="mt-4 flex items-center gap-4 text-sm text-gray-300">
                  <button
                    disabled={filters.page <= 1 || schedule.isFetching}
                    onClick={() =>
                      setFilters({ ...filters, page: filters.page - 1 })
                    }
                  >
                    Previous
                  </button>
                  <span>
                    Page {filters.page} of {pages}
                  </span>
                  <button
                    disabled={filters.page >= pages || schedule.isFetching}
                    onClick={() =>
                      setFilters({ ...filters, page: filters.page + 1 })
                    }
                  >
                    Next
                  </button>
                  <label>
                    Rows{" "}
                    <select
                      className="rounded bg-gray-800 p-2"
                      value={filters.pageSize}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          pageSize: Number(e.target.value),
                          page: 1,
                        })
                      }
                    >
                      {[10, 25, 50, 100].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </>
          )}
        </fieldset>
        <p className="mt-4 text-xs text-gray-500">
          Shared hosted schedules. Demo persona selection is not authentication.
          Date filters use inclusive UTC days.
        </p>
        <PreviewModal
          key={token?.signature ?? previewFailure ?? "closed"}
          preview={preview}
          failure={previewFailure}
          busy={busy}
          error={error}
          outcomeUnknown={outcomeUnknown}
          onClose={() => {
            setToken(null);
            setPreviewFailure(null);
            setError("");
            if (outcomeUnknown) void refresh();
            setOutcomeUnknown(false);
          }}
          onConfirm={() => confirm.mutate()}
          onReview={(edits) => review.mutateAsync(edits).then(() => {})}
        />
      </div>
    </main>
  );
}
