import { describe, expect, it, vi } from "vitest";

import { getRequestId } from "./request-id";

describe("getRequestId", () => {
  it("preserves a safe incoming identifier exactly", () => {
    expect(getRequestId(new Headers({ "x-request-id": "Trace_1.a-b" }))).toBe("Trace_1.a-b");
  });

  it.each(["", "contains spaces", "../unsafe?", "a".repeat(129)])(
    "replaces invalid identifier %j",
    (incoming) => {
      const generatedRequestId = "00000000-0000-4000-8000-000000000000";
      const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(generatedRequestId);

      expect(getRequestId(new Headers({ "x-request-id": incoming }))).toBe(generatedRequestId);
      expect(randomUUID).toHaveBeenCalledOnce();

      randomUUID.mockRestore();
    },
  );
});
