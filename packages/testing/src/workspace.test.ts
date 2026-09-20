import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("workspace", () => {
  it("contains web and worker applications", () => {
    expect(existsSync(resolve(process.cwd(), "apps/web/package.json"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "apps/worker/package.json"))).toBe(true);
  });
});
