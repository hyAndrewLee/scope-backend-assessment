import { getDatabase } from "~/server/database";
import { reviewPreview } from "~/server/services/reconciliation";
import { requireUser } from "~/server/services/users";
import { assertWrite, readJson } from "~/server/utils/read-body";
import { idSchema, reviewSchema } from "~/features/reconciliation/schemas";
import { errorResponse } from "~/server/errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ theaterId: string }> },
) {
  try {
    assertWrite(request);
    const db = getDatabase();
    const user = await requireUser(db, request.headers.get("x-persona-id"));
    const theaterId = idSchema.parse((await context.params).theaterId);

    return Response.json(
      await reviewPreview(
        db,
        user.id,
        theaterId,
        reviewSchema.parse(await readJson(request)),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
