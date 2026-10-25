import type { Entry, Preview } from "./schemas";

const labels: Record<string, string> = {
  EN: "English",
  KO: "Korean",
  JA: "Japanese",
  FR: "French",
  approved: "Approved",
  draft: "Draft",
  flagged: "Flagged",
  "needs-review": "Needs review",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
  admin: "Administrator",
  viewer: "Viewer",
  add: "New showtime",
  update: "Updated showtime",
  archive: "Archive showtime",
  unchanged: "No changes",
  ambiguous: "Needs your review",
  partnerTitle: "Movie title in your file",
  movieTitle: "Movie title",
  movieStatus: "Movie status",
  movie_title: "Movie title",
  theaterName: "Theater",
  partnerLastUpdated: "Last updated",
  theater_name: "Theater",
  auditorium: "Auditorium",
  startTime: "Start time (UTC)",
  endTime: "End time (UTC)",
  start_time: "Start time",
  end_time: "End time",
  language: "Language",
  format: "Screening format",
  rating: "Age rating",
  last_updated: "Last updated",
  NR: "Not rated",
};
export const displayLabel = (value: string) => labels[value] ?? value;

export function availablePreviewFormats(
  preview: Preview,
  entry: Entry,
  auditorium: string,
) {
  const room = preview.capabilities?.auditoriums.find(
    (r) => r.name === auditorium,
  );
  const movie = preview.capabilities?.movies.find(
    (m) => m.id === entry.after?.movieId,
  );
  // New movies have only the imported format verified, not every format a room offers.
  const movieFormats =
    movie?.supportedFormats ?? (entry.after ? [entry.after.format] : []);
  return (
    room?.supportedFormats.filter((format) => movieFormats.includes(format)) ??
    []
  );
}
