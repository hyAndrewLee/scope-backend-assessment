import { useState } from "react";
import { useDebounce } from "~/lib/hooks/useDebounce";
import { filtersSchema, type Filters } from "~/features/reconciliation/schemas";

export function useTheaterSelection() {
  const [userId, setUserId] = useState("");
  const [theaterId, setTheaterId] = useState("all");
  const [filters, setFilters] = useState(filtersSchema.parse({}));
  const debounced = useDebounce(filters, 300);

  const resetSelection = (id: string) => {
    setUserId(id);
    setTheaterId("all");
    setFilters(filtersSchema.parse({}));
  };

  const selectTheater = (id: string) => {
    setTheaterId(id);
    setFilters(filtersSchema.parse({}));
  };

  // The action hook supplies feedback when validation fails.
  const changeFilters = (
    value: Partial<Omit<Filters, "movieStatus">> & { movieStatus?: string },
  ) => {
    const parsed = filtersSchema.safeParse({ ...filters, ...value, page: 1 });

    if (parsed.success) setFilters(parsed.data);

    return parsed.success;
  };

  const searchSchedule = (search: string) =>
    setFilters({ ...filters, search, page: 1 });

  const sortSchedule = (sort: Filters["sort"], order: Filters["order"]) =>
    setFilters({ ...filters, sort, order, page: 1 });

  const previousPage = () => setFilters({ ...filters, page: filters.page - 1 });
  const nextPage = () => setFilters({ ...filters, page: filters.page + 1 });
  const changePageSize = (pageSize: number) =>
    setFilters({ ...filters, pageSize, page: 1 });

  return {
    userId,
    theaterId,
    filters,
    debounced,
    resetSelection,
    selectTheater,
    changeFilters,
    searchSchedule,
    sortSchedule,
    previousPage,
    nextPage,
    changePageSize,
  };
}
