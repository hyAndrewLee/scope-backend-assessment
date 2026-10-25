import { getDatabase } from "~/server/database";
import { requireUser } from "~/server/services/users";
import { listTheaters } from "~/server/services/theaters";
import { errorResponse } from "~/server/errors";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const db = getDatabase();
    return Response.json(await listTheaters(db, await requireUser(db, request.headers.get("x-persona-id"))), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
