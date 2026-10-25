"use client";

import { useTheater } from "../../_context/TheaterContext";
import { movieStatusSchema } from "~/features/reconciliation/schemas";
import { FilterBar } from "../FilterBar";
import { ShowtimesTable } from "../ShowtimesTable";
import { SchedulePagination } from "./SchedulePagination";

function ScheduleFilters() {
  const { isAdmin, filters, options, changeFilters } = useTheater();

  return (
    <FilterBar
      isAdmin={!!isAdmin}
      {...filters}
      onFilterChange={changeFilters}
      availableFormats={options?.formats ?? []}
      availableLanguages={options?.languages ?? []}
      availableRatings={options?.ratings ?? []}
      availableAuditoriums={options?.auditoriums ?? []}
      availableMovieStatuses={options?.movieStatuses ?? []}
    />
  );
}

function ScheduleTable() {
  const {
    data,
    theatersById,
    theaterId,
    isAdmin,
    filters,
    searchSchedule,
    sortSchedule,
    changeMovieStatus,
    changeShowtimeStatus,
  } = useTheater();

  return (
    <ShowtimesTable
      showtimes={data?.showtimes ?? []}
      theatersById={theatersById}
      showTheaterColumn={theaterId === "all"}
      isAdmin={!!isAdmin}
      movieStatusOptions={[...movieStatusSchema.options]}
      statusOptions={["active", "inactive", "archived"]}
      searchQuery={filters.search}
      sortField={filters.sort}
      sortOrder={filters.order}
      onSearchChange={searchSchedule}
      onSortChange={sortSchedule}
      onMovieStatusChange={changeMovieStatus}
      onStatusChange={changeShowtimeStatus}
    />
  );
}

export function ScheduleView() {
  const { user, theaters, schedule } = useTheater();

  if (!user)
    return (
      <p className="text-gray-400">
        Choose a demo user above to view the schedule.
      </p>
    );
  if (theaters.data?.length === 0)
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-8 text-center text-gray-400">
        This user does not belong to any theaters yet.
      </div>
    );

  return (
    <>
      <ScheduleFilters />
      <div
        className="rounded-lg border border-gray-700 bg-gray-900 p-6"
        aria-busy={schedule.isFetching}
      >
        <ScheduleTable />
        <SchedulePagination />
      </div>
    </>
  );
}
