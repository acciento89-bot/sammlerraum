import { BillingError } from "@sammlerraum/contracts/billing";
import { BillingOverviewSchema } from "@sammlerraum/contracts/billing-ui";
import { ApiError } from "@sammlerraum/contracts/errors";
import { apiRoute } from "./api/route-handler";
export function createBillingStatusHandler(deps: {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  getOverview(subjectId: string): Promise<unknown>;
}) {
  return apiRoute(async (request) => {
    if (new URL(request.url).searchParams.size)
      throw new ApiError("VALIDATION_ERROR", 400, "Unexpected query");
    const session = await deps.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    const overview = BillingOverviewSchema.safeParse(await deps.getOverview(session.user.id));
    if (!overview.success) throw new BillingError("BILLING_UNAVAILABLE");
    return Response.json(
      { overview: overview.data },
      { headers: { "cache-control": "private, no-store" } },
    );
  });
}
