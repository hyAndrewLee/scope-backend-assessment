import { z } from "zod";
import { getDatabase } from "~/server/database";
import { clearSchedule } from "~/server/services/schedule";
import { requireUser } from "~/server/services/users";
import { assertWrite, readJson } from "~/server/utils/read-body";
import { idSchema } from "~/features/reconciliation/schemas";
import { errorResponse } from "~/server/errors";
export async function DELETE(request: Request, context: { params: Promise<{ theaterId: string }> }) {
  try {
    assertWrite(request);
    z.object({ acknowledge: z.literal(true) }).strict().parse(await readJson(request));
    const db = getDatabase();
    const user = await requireUser(db, request.headers.get("x-persona-id"));
    return Response.json(await clearSchedule(db, user.id, idSchema.parse((await context.params).theaterId)));
  } catch (error) { return errorResponse(error); }
}
