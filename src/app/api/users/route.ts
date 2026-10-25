import { getDatabase } from "~/server/database";
import { listUsers } from "~/server/services/users";
import { errorResponse } from "~/server/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listUsers(getDatabase()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
