"use client";

import { useTheater } from "../../_context/TheaterContext";

export function SchedulePagination() {
  const { filters, pages, schedule, previousPage, nextPage, changePageSize } =
    useTheater();

  return (
    <div className="mt-4 flex items-center gap-4 text-sm text-gray-300">
      <button
        disabled={filters.page <= 1 || schedule.isFetching}
        onClick={previousPage}
      >
        Previous
      </button>
      <span>
        Page {filters.page} of {pages}
      </span>
      <button
        disabled={filters.page >= pages || schedule.isFetching}
        onClick={nextPage}
      >
        Next
      </button>
      <label>
        Rows{" "}
        <select
          className="rounded bg-gray-800 p-2"
          value={filters.pageSize}
          onChange={(e) => changePageSize(Number(e.target.value))}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
