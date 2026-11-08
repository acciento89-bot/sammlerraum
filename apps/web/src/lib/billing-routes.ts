import { z } from "zod";
import { BillingError } from "@sammlerraum/contracts/billing";
import { ApiError } from "@sammlerraum/contracts/errors";
import { parseCollaborativeItemRequestJson } from "@sammlerraum/contracts/items";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
const common = { requestKey: z.string().uuid(), locale: z.enum(["de", "en"]) };
type Service = {
  checkout(actor: { userId: string }, input: unknown): Promise<unknown>;
  portal(actor: { userId: string }, input: unknown): Promise<unknown>;
};
export function createBillingRouteHandlers(dependencies: {
  appOrigin: string;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  getService(): Service;
}) {
  const create = (purpose: "CHECKOUT" | "PORTAL") =>
    apiRoute(async (request: Request) => {
      if (request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
        throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
      const session = await dependencies.getSession(request.headers);
      if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
      if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
        throw new ApiError("VALIDATION_ERROR", 400, "JSON body required");
      let value: unknown;
      try {
        value = parseCollaborativeItemRequestJson(
          new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedBody(request, 8192)),
        );
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError("VALIDATION_ERROR", 400, "Invalid JSON body");
      }
      const input = (
        purpose === "CHECKOUT"
          ? z.strictObject({ ...common, cadence: z.enum(["MONTHLY", "YEARLY"]) })
          : z.strictObject(common)
      ).parse(value);
      try {
        const service = dependencies.getService();
        const result = await (purpose === "CHECKOUT"
          ? service.checkout({ userId: session.user.id }, input)
          : service.portal({ userId: session.user.id }, input));
        return Response.json(result, { headers: { "cache-control": "private, no-store" } });
      } catch (error) {
        if (!(error instanceof BillingError)) throw error;
        const status =
          error.code === "BILLING_NOT_FOUND"
            ? 404
            : error.code === "BILLING_INVALID_REQUEST"
              ? 400
              : error.code === "BILLING_CONFLICT"
                ? 409
                : error.code === "BILLING_UNAVAILABLE"
                  ? 503
                  : 403;
        throw new ApiError(error.code, status, "Billing request cannot be completed");
      }
    });
  return { CHECKOUT: create("CHECKOUT"), PORTAL: create("PORTAL") };
}
