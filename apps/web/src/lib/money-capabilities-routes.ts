import { ApiError } from "@sammlerraum/contracts/errors";
import { MoneyCapabilitiesSchema } from "@sammlerraum/contracts/money-capabilities";
import {
  LEGACY_MONEY_PROFILE_ID,
  LEGACY_MONEY_AUTHORITY_HASH,
} from "@sammlerraum/contracts/legacy-money";
import { apiRoute } from "./api/route-handler";
type Dependencies = {
  appOrigin: string;
  authoringEnabled: boolean;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
};
export function createMoneyCapabilitiesRouteHandler(d: Dependencies) {
  return apiRoute(async (request: Request) => {
    const url = new URL(request.url),
      origin = request.headers.get("origin");
    if (origin !== null && origin !== new URL(d.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await d.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    if (url.search || url.hash)
      throw new ApiError("LEGACY_MONEY_INVALID", 400, "Unexpected capability query");
    return Response.json(
      MoneyCapabilitiesSchema.parse({
        actorId: session.user.id,
        schemaVersion: 1,
        readVersion: 1,
        authoringProfiles: d.authoringEnabled
          ? [{ profileId: LEGACY_MONEY_PROFILE_ID, authorityHash: LEGACY_MONEY_AUTHORITY_HASH }]
          : [],
        classificationVersion: 1,
        canonicalConsumers: false,
      }),
      { headers: { "cache-control": "no-store" } },
    );
  });
}
