import { ApiError } from "@sammlerraum/contracts/errors";
import {
  InsuranceError,
  InsuranceTargetSchema,
  InsuranceMutationSchema,
} from "@sammlerraum/contracts/insurance";
import { createInsuranceService } from "@sammlerraum/domain/insurance/insurance-service";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
import { mapItemSearchError, readSearchQueryMap } from "./item-search-routes";
import type { PrivateTransferContext } from "./private-transfer-context";
const inputSchema = InsuranceMutationSchema.extend({ target: InsuranceTargetSchema }).strict();
export function createInsuranceRouteHandlers(deps: PrivateTransferContext) {
  const service = createInsuranceService(deps.database);
  async function actor(request: Request, mutation = false) {
    if (mutation && request.headers.get("origin") !== new URL(deps.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await deps.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return { userId: session.user.id };
  }
  async function mapped(work: () => Promise<Response>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof InsuranceError)
        throw new ApiError(
          error.code,
          error.code === "INSURANCE_INVALID"
            ? 400
            : error.code === "INSURANCE_NOT_FOUND"
              ? 404
              : error.code === "INSURANCE_INTEGRITY"
                ? 500
                : 409,
          "Insurance request cannot be completed",
        );
      return mapItemSearchError(error);
    }
  }
  const json = (value: unknown) =>
    Response.json(value, { headers: { "cache-control": "no-store" } });
  return {
    GET: apiRoute(async (request) =>
      mapped(async () => {
        const who = await actor(request),
          query = readSearchQueryMap(request, ["id", "kind"]);
        const target = InsuranceTargetSchema.safeParse(
          query.kind === "ITEM"
            ? { kind: "ITEM", itemId: query.id }
            : query.kind === "COLLECTION"
              ? { kind: "COLLECTION", collectionId: query.id }
              : null,
        );
        if (!target.success) throw new InsuranceError("INSURANCE_INVALID");
        return json(await service.getInsuranceData(who, target.data));
      }),
    ),
    PUT: apiRoute(async (request) =>
      mapped(async () => {
        const who = await actor(request, true),
          checked = inputSchema.safeParse(await readPrivateJson(request));
        if (!checked.success) throw new InsuranceError("INSURANCE_INVALID");
        const { target, ...mutation } = checked.data;
        return json(
          target.kind === "ITEM"
            ? await service.setItemInsurance(who, target.itemId, mutation)
            : await service.setCollectionInsurance(who, target.collectionId, mutation),
        );
      }),
    ),
  };
}
