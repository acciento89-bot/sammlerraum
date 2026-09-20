import { describe, expect, it, vi } from "vitest";

import { getRequestId } from "./request-id";

describe("getRequestId", () => {
  it("preserves a safe incoming identifier exactly", () => {
    expect(getRequestId(new Headers({ "x-request-id": "Trace_1.a-b" }))).toBe("Trace_1.a-b");
  });

  it.each(["", "contains spaces", "../unsafe?", "a".repeat(129)])(
    "replaces invalid identifier %j",
    (incoming) => {
      const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue("generated-request-id");

      expect(getRequestId(new Headers({ "x-request-id": incoming }))).toBe("generated-request-id");
      expect(randomUUID).toHaveBeenCalledOnce();

      randomUUID.mockRestore();
    },
  );
});
