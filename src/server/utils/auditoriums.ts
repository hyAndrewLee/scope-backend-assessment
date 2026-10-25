import type {
  Auditorium,
  Preview,
} from "../../features/reconciliation/schemas";
import { nameKey } from "./reconciliation";

export type MovieFormats = {
  id: string;
  supportedFormats: ("2D" | "3D" | "IMAX")[];
};
export function supportsProjection(
  format: string,
  movieFormats: string[],
  roomFormats: string[],
) {
  return movieFormats.includes(format) && roomFormats.includes(format);
}
export function validateAssignments(
  preview: Preview,
  rooms: Auditorium[],
  movies: MovieFormats[],
): Preview {
  const entries = structuredClone(preview.entries);
  const blockers: string[] = [];
  for (const entry of entries) {
    if (
      entry.excluded ||
      !entry.after ||
      entry.kind === "archive" ||
      entry.kind === "ambiguous"
    )
      continue;
    const after = entry.after;
    const matches = rooms.filter(
      (room) =>
        room.theaterId === preview.theaterId &&
        nameKey(room.name) === nameKey(after.auditorium),
    );
    const room = matches[0];
    if (matches.length !== 1 || !room) {
      blockers.push(
        `Unknown or ambiguous auditorium '${after.auditorium}'; choose an existing auditorium.`,
      );
      continue;
    }
    after.auditorium = room.name;
    const movie = movies.find((m) => m.id === after.movieId);
    // For new movies only the reviewed screening format is known; never infer other formats.
    const movieFormats = movie?.supportedFormats ?? [after.format];
    if (!supportsProjection(after.format, movieFormats, room.supportedFormats))
      blockers.push(
        `${after.movieTitle}: ${after.format} is not supported by both this movie and ${room.name}.`,
      );
  }
  const combined = [...new Set([...preview.blockers, ...blockers])];
  if (combined.length)
    for (const entry of entries)
      if (entry.kind === "archive") entry.excluded = true;
  return {
    ...preview,
    entries,
    blockers: combined,
    capabilities: { auditoriums: rooms, movies },
  };
}
