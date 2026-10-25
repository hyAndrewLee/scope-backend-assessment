import type { z } from "zod";
import type { reviewSchema } from "~/features/reconciliation/schemas";

export type Edits = z.infer<typeof reviewSchema>["edits"];
