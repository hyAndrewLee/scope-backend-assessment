import { AppError } from "../errors";
import { getSettings } from "../../env.js";

export function assertWrite(
  request: Request,
  contentType = "application/json",
) {
  if (
    request.headers.get("origin") !== getSettings().APP_ORIGIN ||
    request.headers.get("x-reconciliation-request") !== "1"
  )
    throw new AppError(403, "Use the same-origin application controls.");
  if (
    request.headers.get("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new AppError(415, "Compressed bodies are not supported.");
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    contentType
  )
    throw new AppError(415, `Send ${contentType}.`);
}

export async function readBody(request: Request, maximum = 2_000_000) {
  const reader = request.body?.getReader();

  if (!reader) throw new AppError(400, "Request body is required.");

  const chunks: Uint8Array[] = [];
  let size = 0;
  const timer = setTimeout(() => {
    void reader.cancel();
  }, 10_000);

  const started = Date.now();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (request.signal.aborted || Date.now() - started >= 10_000)
        throw new AppError(408, "Request body timed out or was canceled.");
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new AppError(413, "Request body is too large.");
      chunks.push(value);
    }

    const result = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

export async function readJson(request: Request) {
  const bytes = await readBody(request);

  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new AppError(400, "Send valid UTF-8 JSON.");
  }
}
