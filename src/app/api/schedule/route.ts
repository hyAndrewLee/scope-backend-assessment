import { getDatabase } from "~/server/database";
import { requireUser } from "~/server/services/users";
import { readSchedule } from "~/server/services/schedule";
import { filtersSchema } from "~/features/reconciliation/schemas";
import { errorResponse } from "~/server/errors";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const user = await requireUser(db, request.headers.get("x-persona-id"));
    const filters = filtersSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return Response.json(await readSchedule(db, user, filters), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
