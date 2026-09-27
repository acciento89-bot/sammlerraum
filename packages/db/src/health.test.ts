import { describe, expect, it, vi } from "vitest";

import { checkDatabaseHealth } from "./health";

describe("checkDatabaseHealth", () => {
  it("reports a failed query as unhealthy", async () => {
    const db = { $queryRaw: vi.fn().mockRejectedValue(new Error("offline")) };

    await expect(checkDatabaseHealth(db as never)).resolves.toEqual({ ok: false });
  });
});
