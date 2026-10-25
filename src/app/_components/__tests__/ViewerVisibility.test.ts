import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assessmentData } from "~/data/assessment-data";
import { FilterBar } from "../FilterBar";
import { ShowtimesTable } from "../ShowtimesTable";

function table(isAdmin: boolean, empty = false) {
  return renderToStaticMarkup(
    createElement(ShowtimesTable, {
      isAdmin,
      showtimes: empty
        ? []
        : [assessmentData.showtimes.find((s) => s.status === "archived")!],
      theatersById: {},
      showTheaterColumn: false,
      movieStatusOptions: ["flagged"],
      statusOptions: ["archived"],
      searchQuery: "",
      sortField: "startTime",
      sortOrder: "asc",
      onSearchChange() {},
      onSortChange() {},
    }),
  );
}

function filters(isAdmin: boolean) {
  return renderToStaticMarkup(
    createElement(FilterBar, {
      isAdmin,
      status: "all",
      format: "",
      language: "",
      rating: "",
      auditorium: "",
      movieStatus: "",
      startDate: "",
      endDate: "",
      availableFormats: ["2D"],
      availableLanguages: ["EN"],
      availableRatings: ["PG"],
      availableAuditoriums: ["Auditorium 3"],
      availableMovieStatuses: ["flagged"],
      onFilterChange() {},
    }),
  );
}

test("viewers see neither protected columns nor status styling", () => {
  const html = table(false);

  for (const hidden of [
    "Movie Status",
    "Auditorium",
    ">Status<",
    "Archived",
    "Flagged",
    "opacity-50",
    "Last Updated",
  ])
    expect(html).not.toContain(hidden);
  expect(html).toContain("Wonka");
  expect(html).toContain("English");
  expect(table(false, true)).toContain('colSpan="6"');
});

test("viewers have no movie status, showtime status, or auditorium filters", () => {
  const html = filters(false);

  for (const hidden of [
    "Movie Status",
    "Auditorium",
    ">Status<",
    "Archived",
    "Flagged",
  ])
    expect(html).not.toContain(hidden);
  expect(html).toContain("All Languages");
  expect(html).toContain("All Formats");
});

test("administrators retain all three columns and filters", () => {
  for (const html of [table(true), filters(true)]) {
    expect(html).toContain("Movie Status");
    expect(html).toContain("Auditorium");
    expect(html).toContain(">Status<");
    expect(html).toContain("Flagged");
    expect(html).toContain("Archived");
  }

  expect(table(true)).toContain("Last Updated");
  expect(table(true, true)).toContain('colSpan="10"');
});
