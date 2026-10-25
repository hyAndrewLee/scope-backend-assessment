import { getDatabase } from "~/server/database";
import { createPreview } from "~/server/services/reconciliation";
import { requireUser, assertAccess } from "~/server/services/users";
import { assertWrite, readBody } from "~/server/utils/read-body";
import { idSchema } from "~/features/reconciliation/schemas";
import { errorResponse } from "~/server/errors";

export const maxDuration = 90;

export async function POST(
  request: Request,
  context: { params: Promise<{ theaterId: string }> },
) {
  try {
    assertWrite(request, "text/csv");
    const db = getDatabase();
    const user = await requireUser(db, request.headers.get("x-persona-id"));
    const theaterId = idSchema.parse((await context.params).theaterId);

    assertAccess(user, theaterId, true);

    return Response.json(
      await createPreview(
        db,
        user.id,
        theaterId,
        await readBody(request, 262144),
        request.signal,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
