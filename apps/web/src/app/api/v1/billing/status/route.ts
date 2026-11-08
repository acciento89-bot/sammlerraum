import { auth } from "../../../../../lib/auth";
import { ownBillingOverview } from "../../../../../lib/billing-ui-runtime";
import { createBillingStatusHandler } from "../../../../../lib/billing-status-route";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return createBillingStatusHandler({
    getSession: (headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    getOverview: ownBillingOverview,
  })(request);
}
