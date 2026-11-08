import { BillingError, type VerifiedBillingEvent } from "@sammlerraum/contracts/billing";
import { ApiError } from "@sammlerraum/contracts/errors";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
/** Machine-to-machine endpoint: SDK signature replaces session/origin authentication only here. */
export function createBillingWebhookRoute(dependencies: {
  verify(raw: Buffer, signature: string): VerifiedBillingEvent | null;
  receive(event: VerifiedBillingEvent): Promise<{ id: string; status: string }>;
}) {
  return apiRoute(async (request) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature || signature.length > 4096)
      throw new ApiError("BILLING_INVALID_SIGNATURE", 400, "Invalid webhook signature");
    const raw = Buffer.from(await readBoundedBody(request, 262144));
    try {
      const event = dependencies.verify(raw, signature);
      if (event === null)
        return Response.json(
          { received: true, status: "IGNORED" },
          { headers: { "cache-control": "no-store" } },
        );
      const receipt = await dependencies.receive(event);
      return Response.json(
        { received: true, status: receipt.status },
        {
          status: receipt.status === "PENDING" ? 202 : 200,
          headers: { "cache-control": "no-store" },
        },
      );
    } catch (e) {
      if (!(e instanceof BillingError)) throw e;
      throw new ApiError(
        e.code,
        e.code === "BILLING_UNAVAILABLE" ? 503 : e.code === "BILLING_EVENT_CONFLICT" ? 409 : 400,
        "Webhook cannot be processed",
      );
    }
  });
}
