import type { createPrismaClient } from "@sammlerraum/db/create-client";
import { ApiError } from "@sammlerraum/contracts/errors";
import { apiRoute } from "./api/route-handler";
import { readPrivateQuery } from "./api/read-private-query";
import { acquisitionEligibility, parseAcquisitionStart } from "./acquisition";
export function createAcquisitionStatusHandler(deps: {
  db: ReturnType<typeof createPrismaClient>;
  appOrigin: string;
  secret: string;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
}) {
  return apiRoute(async (request) => {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(deps.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await deps.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    const raw = readPrivateQuery(request, ["started"]);
    const now = new Date(),
      start = parseAcquisitionStart(raw.started ?? null, now);
    const user = await deps.db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        applicationRoleGrant: { select: { role: true } },
      },
    });
    const firstItem = await deps.db.collectibleItem.findFirst({
      where: { ownerId: session.user.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    return Response.json(
      acquisitionEligibility(user, {
        start,
        now,
        secret: deps.secret,
        firstItemAt: firstItem?.createdAt ?? null,
      }),
      {
        headers: {
          "cache-control": "private, no-store",
          vary: "Cookie",
          "x-robots-tag": "noindex, nofollow",
        },
      },
    );
  });
}
