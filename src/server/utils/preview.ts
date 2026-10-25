import {
  previewSchema,
  type Preview,
} from "../../features/reconciliation/schemas";
import { AppError } from "../errors";

// This is untrusted editable input, not an authorization token or signed receipt.
export function readPreview(
  value: unknown,
  personaId: string,
  theaterId: string,
): Preview {
  const preview = previewSchema.parse(value);

  if (Buffer.byteLength(JSON.stringify(preview)) > 1_000_000)
    throw new AppError(413, "Preview is too large.");
  if (preview.personaId !== personaId || preview.theaterId !== theaterId)
    throw new AppError(403, "Preview belongs to another persona or theater.");

  return preview;
}
