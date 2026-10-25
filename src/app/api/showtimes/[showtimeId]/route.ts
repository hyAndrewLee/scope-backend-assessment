import { z } from "zod";
import { getDatabase } from "~/server/database";
import { changeStatus } from "~/server/services/schedule";
import { requireUser } from "~/server/services/users";
import { assertWrite, readJson } from "~/server/utils/read-body";
import { idSchema, statusSchema } from "~/features/reconciliation/schemas";
import { errorResponse } from "~/server/errors";
export async function PATCH(request: Request, context: { params: Promise<{ showtimeId: string }> }) {
  try {
    assertWrite(request);
    const { status } = z.object({ status: statusSchema }).strict().parse(await readJson(request));
    const db = getDatabase();
    const user = await requireUser(db, request.headers.get("x-persona-id"));
    return Response.json(await changeStatus(db, user.id, idSchema.parse((await context.params).showtimeId), status, "showtime"));
  } catch (error) { return errorResponse(error); }
}
