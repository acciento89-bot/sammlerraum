import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createMediaAssetLocker } from "./media-lock";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")("media byte lock", () => {
  it("serializes storage work for an asset across separate database sessions", async () => {
    const url = process.env.DATABASE_URL!;
    const first = createMediaAssetLocker(url);
    const second = createMediaAssetLocker(url);
    const assetId = randomUUID();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const didEnter = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const processing = first(assetId, async () => {
      entered();
      await held;
    });
    try {
      await didEnter;
      expect(
        await second(assetId, async () => {
          throw new Error("overlap");
        }),
      ).toBe(false);
    } finally {
      release();
      await processing;
    }
    expect(await second(assetId, async () => "cleanup")).toBe("cleanup");
  });
});
