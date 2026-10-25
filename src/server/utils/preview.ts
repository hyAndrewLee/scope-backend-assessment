import { createHmac, timingSafeEqual } from "node:crypto";
import {
  previewSchema,
  signedPreviewSchema,
  type Preview,
  type SignedPreview,
} from "../../features/reconciliation/schemas";
import { AppError } from "../errors";

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
export function signPreview(preview: Preview, secret: string): SignedPreview {
  if (secret.length < 32) throw new Error("Signing secret is too short.");
  const payload = JSON.stringify(previewSchema.parse(preview));
  if (Buffer.byteLength(payload) > 1_000_000)
    throw new AppError(413, "Preview is too large.");
  return { payload, signature: signature(payload, secret) };
}
export function verifyPreview(
  value: unknown,
  secret: string,
  personaId: string,
  theaterId: string,
  now = Date.now(),
) {
  const token = signedPreviewSchema.parse(value);
  if (
    Buffer.byteLength(token.payload) > 1_000_000 ||
    !timingSafeEqual(
      Buffer.from(signature(token.payload, secret), "hex"),
      Buffer.from(token.signature, "hex"),
    )
  )
    throw new AppError(400, "Invalid preview signature.");
  const preview = previewSchema.parse(JSON.parse(token.payload));
  if (preview.personaId !== personaId || preview.theaterId !== theaterId)
    throw new AppError(403, "Preview belongs to another persona or theater.");
  if (preview.expiresAt <= now)
    throw new AppError(410, "Preview expired; upload again.");
  return preview;
}
