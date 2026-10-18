import { createHash, randomUUID } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createImageProcessor, type ImageRepository, type ImageClaim } from "./process-image";

async function sourceImage() {
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: "red" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ GPS: { GPSLatitude: "51/1 30/1 0/1", GPSLatitudeRef: "N" } } as never)
    .toBuffer();
}

function fixture(bytes: Uint8Array, kind: "IMAGE" | "DOCUMENT" = "IMAGE") {
  const assetId = randomUUID();
  const claim: ImageClaim = {
    id: assetId,
    token: randomUUID(),
    kind,
    mimeType: "image/jpeg",
    storageKey: `originals/${assetId}`,
    byteSize: BigInt(bytes.byteLength),
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const objects = new Map<string, Uint8Array>([[claim.storageKey, bytes]]);
  const variants = new Map<
    string,
    { key: string; width: number; height: number; size: bigint; checksum: string }
  >();
  const events: string[] = [];
  let status = "PENDING";
  let attempts = 0;
  const repo: ImageRepository = {
    claim: async (id) => {
      if (id !== assetId || status !== "PENDING") return null;
      status = "PROCESSING";
      attempts++;
      return claim;
    },
    renew: async ({ token }) => status === "PROCESSING" && token === claim.token,
    reserveVariant: async (_, name, key) => {
      events.push(`reserve:${name}`);
      if (!variants.has(name))
        variants.set(name, { key, width: 0, height: 0, size: 0n, checksum: "" });
      return true;
    },
    finishVariant: async (_, name, data) => {
      events.push(`finish:${name}`);
      variants.set(name, { ...variants.get(name)!, ...data });
      return true;
    },
    ready: async () => {
      if (variants.size !== 3 || [...variants.values()].some((v) => v.size === 0n))
        throw new Error("incomplete");
      status = "READY";
      events.push("ready");
      return true;
    },
    fail: async (_, code, retry) => {
      status = retry ? "PENDING" : "FAILED";
      events.push(`fail:${code}`);
    },
  };
  const storage = {
    read: async (key: string) => {
      const value = objects.get(key);
      if (!value) throw new Error("missing");
      return value;
    },
    put: async (key: string, data: Uint8Array) => {
      events.push(`put:${key}`);
      objects.set(key, data);
    },
    exists: async (key: string) => objects.has(key),
    delete: async (key: string) => {
      objects.delete(key);
    },
  };
  return {
    assetId,
    claim,
    objects,
    variants,
    events,
    storage,
    repo,
    get status() {
      return status;
    },
    get attempts() {
      return attempts;
    },
  };
}

describe("image processing", () => {
  it.each(["IMAGE", "DOCUMENT"] as const)(
    "writes three oriented, metadata-free WebP variants of a %s source, tracked before bytes",
    async (kind) => {
      const original = await sourceImage();
      const originalMeta = await sharp(original).metadata();
      expect(originalMeta.orientation).toBe(6);
      expect(originalMeta.exif).toBeDefined();
      const f = fixture(original, kind);
      await createImageProcessor(f.repo, f.storage)({ assetId: f.assetId });
      expect(f.status).toBe("READY");
      expect([...f.variants.keys()].sort()).toEqual(["LARGE", "MEDIUM", "THUMBNAIL"]);
      for (const [name, width, height] of [
        ["THUMBNAIL", 171, 256],
        ["MEDIUM", 427, 640],
        ["LARGE", 800, 1200],
      ] as const) {
        const variant = f.variants.get(name)!;
        const output = f.objects.get(variant.key)!;
        const metadata = await sharp(output).metadata();
        expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", width, height]);
        expect(metadata.exif).toBeUndefined();
        expect(metadata.orientation).toBeUndefined();
        expect(variant.size).toBe(BigInt(output.length));
        expect(variant.checksum).toBe(createHash("sha256").update(output).digest("hex"));
        expect(f.events.indexOf(`reserve:${name}`)).toBeLessThan(
          f.events.indexOf(`put:${variant.key}`),
        );
      }
      expect(f.events.at(-1)).toBe("ready");
      expect(f.objects.get(f.claim.storageKey)).toEqual(original);
    },
  );

  it("does not upscale a tiny source", async () => {
    const bytes = await sharp({
      create: { width: 32, height: 20, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const f = fixture(bytes);
    f.claim.mimeType = "image/png";
    await createImageProcessor(f.repo, f.storage)({ assetId: f.assetId });
    for (const variant of f.variants.values()) {
      const metadata = await sharp(f.objects.get(variant.key)).metadata();
      expect([metadata.width, metadata.height]).toEqual([32, 20]);
    }
  });

  it("marks tampered/corrupt source FAILED without writing a variant or deleting the original", async () => {
    const f = fixture(await sourceImage());
    f.objects.set(f.claim.storageKey, Buffer.from("corrupt"));
    await createImageProcessor(f.repo, f.storage)({ assetId: f.assetId });
    expect(f.status).toBe("FAILED");
    expect(f.variants.size).toBe(0);
    expect(f.events).toEqual(["fail:SOURCE_INVALID"]);
    expect(f.objects.has(f.claim.storageKey)).toBe(true);
  });

  it("rejects an intact-checksum corrupt image during full decode", async () => {
    const bytes = Buffer.from("not a jpeg");
    const f = fixture(bytes);
    await createImageProcessor(f.repo, f.storage)({ assetId: f.assetId });
    expect(f.status).toBe("FAILED");
    expect(f.events).toEqual(["fail:SOURCE_INVALID"]);
    expect(f.variants.size).toBe(0);
  });

  it("rejects an oversized original before reading or generating bytes", async () => {
    const f = fixture(await sourceImage());
    const read = f.storage.read;
    f.storage.read = async () => {
      throw new Error("unexpected read");
    };
    await createImageProcessor(f.repo, f.storage, { maxImageBytes: 1 })({ assetId: f.assetId });
    expect(f.status).toBe("FAILED");
    expect(f.events).toEqual(["fail:SOURCE_TOO_LARGE"]);
    f.storage.read = read;
  });

  it("reuses a tracked partial variant after a metadata write failure", async () => {
    const f = fixture(await sourceImage());
    const finish = f.repo.finishVariant;
    let failed = false;
    f.repo.finishVariant = async (...args) => {
      if (!failed) {
        failed = true;
        throw new Error("database down");
      }
      return finish(...args);
    };
    const process = createImageProcessor(f.repo, f.storage);
    await process({ assetId: f.assetId });
    expect(f.status).toBe("PENDING");
    const tracked = f.variants.get("THUMBNAIL")!;
    expect(f.objects.has(tracked.key)).toBe(true);
    expect(tracked.size).toBe(0n);
    await process({ assetId: f.assetId });
    expect(f.status).toBe("READY");
    expect(f.variants.get("THUMBNAIL")?.key).toBe(tracked.key);
  });

  it("retries transient storage failure while keeping the reserved key discoverable", async () => {
    const f = fixture(await sourceImage());
    const originalPut = f.storage.put;
    let failed = false;
    f.storage.put = async (key, value) => {
      if (!failed) {
        failed = true;
        throw new Error("storage down");
      }
      return originalPut(key, value);
    };
    const process = createImageProcessor(f.repo, f.storage);
    await process({ assetId: f.assetId });
    expect(f.status).toBe("PENDING");
    expect(f.events).toContain("fail:STORAGE_ERROR");
    expect(f.variants.get("THUMBNAIL")?.key).toBeTruthy();
    await process({ assetId: f.assetId });
    expect(f.status).toBe("READY");
    expect(f.attempts).toBe(2);
  });
});
