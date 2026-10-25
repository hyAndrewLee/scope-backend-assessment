import {
  editSchema,
  showtimeSchema,
  type Preview,
  type reviewSchema,
} from "./schemas";
import type { z } from "zod";
import { displayLabel } from "./display";

type Edits = z.infer<typeof reviewSchema>["edits"];

export async function submitPreview(
  preview: Preview,
  edits: Edits,
  review: (edits: Edits) => Promise<Preview>,
  confirm: (preview: Preview) => Promise<void>,
) {
  const errors: string[] = [];

  for (const edit of edits) {
    const parsed = editSchema.safeParse(edit);
    const entry = preview.entries[edit.index];

    if (!parsed.success) {
      errors.push(
        ...parsed.error.issues.map((issue) => {
          const field = issue.path.at(-1);

          return `Showtime ${edit.index + 1}: ${field ? `${displayLabel(String(field))}: ` : ""}${issue.message}`;
        }),
      );
      continue;
    }

    if (!entry) {
      errors.push(`Showtime ${edit.index + 1}: unknown showtime.`);
      continue;
    }

    if (edit.fields && entry.after) {
      const result = showtimeSchema.safeParse({
        ...entry.after,
        ...edit.fields,
      });

      if (!result.success)
        errors.push(
          ...result.error.issues.map(
            (issue) =>
              `Showtime ${edit.index + 1}: ${issue.path.length ? `${displayLabel(String(issue.path[0]))}: ` : ""}${issue.message}`,
          ),
        );
    }
  }

  if (errors.length) throw new Error(errors.join("\n"));

  // Use the reviewed response directly; React state may still hold the old preview.
  const checked = edits.length ? await review(edits) : preview;

  if (checked.blockers.length) throw new Error(checked.blockers.join("\n"));
  if (
    !checked.entries.some(
      (entry) =>
        !entry.excluded && ["add", "update", "archive"].includes(entry.kind),
    )
  )
    throw new Error(
      "No changes to save. Include an addition, update, or archival.",
    );

  await confirm(checked);
}
