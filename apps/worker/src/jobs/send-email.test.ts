import { describe, it, expect, vi } from "vitest";
import { createSendEmailJob } from "./send-email";
function fixture() {
  let state = "PENDING",
    acks = 0;
  const lease = { state: "CLAIMED" as const, token: "owned-lease" };
  const repo = {
    claim: vi.fn(async () => (state === "PENDING" ? ((state = "CLAIMED"), lease) : { state })),
    beginSend: vi.fn(async () => {
      state = "SENDING";
      return {
        state: "SENDING" as const,
        message: {
          to: "collector@example.invalid",
          type: "COMMENT_RECEIVED",
          locale: "de" as const,
        },
      };
    }),
    markSent: vi.fn(async () => {
      acks++;
      state = "SENT";
    }),
    markFailure: vi.fn(async () => {
      state = "UNKNOWN";
    }),
  };
  const provider = { send: vi.fn(async () => ({ providerMessageId: "owned-provider-id" })) };
  return {
    repo,
    provider,
    get state() {
      return state;
    },
    get acks() {
      return acks;
    },
  };
}
describe("notification email job acceptance and acknowledgement", () => {
  it("does not claim a delivery for an already-cancelled worker invocation", async () => {
    const f = fixture();
    await createSendEmailJob(f.repo, f.provider, { appOrigin: "https://example.invalid" })(
      { deliveryId: "00000000-0000-4000-8000-000000000001" },
      AbortSignal.abort(),
    );
    expect(f.repo.claim).not.toHaveBeenCalled();
    expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("does not send the same delivery record twice after successful acknowledgement", async () => {
    const f = fixture();
    const handle = createSendEmailJob(f.repo, f.provider, { appOrigin: "https://example.invalid" });
    await handle({ deliveryId: "00000000-0000-4000-8000-000000000001" });
    await handle({ deliveryId: "00000000-0000-4000-8000-000000000001" });
    expect(f.provider.send).toHaveBeenCalledOnce();
    expect(f.state).toBe("SENT");
  });
  it("retries failed acknowledgement persistence without another provider send", async () => {
    const f = fixture();
    f.repo.markSent.mockRejectedValueOnce(Error("private-ack-sentinel"));
    const handle = createSendEmailJob(f.repo, f.provider, { appOrigin: "https://example.invalid" });
    await handle({ deliveryId: "00000000-0000-4000-8000-000000000001" });
    expect(f.repo.markSent).toHaveBeenCalledTimes(2);
    expect(f.provider.send).toHaveBeenCalledOnce();
    expect(f.state).toBe("SENT");
  });
  it("records an ambiguous transport outcome without retrying the transport", async () => {
    const f = fixture();
    f.provider.send.mockRejectedValueOnce(Error("private-smtp-sentinel"));
    const handle = createSendEmailJob(f.repo, f.provider, { appOrigin: "https://example.invalid" });
    await handle({ deliveryId: "00000000-0000-4000-8000-000000000001" });
    await handle({ deliveryId: "00000000-0000-4000-8000-000000000001" });
    expect(f.provider.send).toHaveBeenCalledOnce();
    expect(f.repo.markFailure).toHaveBeenCalledWith(expect.any(String), "owned-lease", "UNKNOWN");
  });
});
