import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createTrustedResourceFacts } from "../authz/types";
import { ResourceQueryError } from "../api/resource-query";
import { createMediaReadService } from "./media-read";

const assetId = randomUUID();
const itemId = randomUUID();
const ownerId = "owner";
const sha = "a".repeat(64);

function fixture(
  options: {
    kind?: "IMAGE" | "DOCUMENT";
    mime?: string;
    status?: string;
    links?: Array<{
      itemId: string;
      type: "IMAGE" | "DOCUMENT";
      visibility: "PRIVATE" | "PUBLIC" | "UNLISTED";
    }>;
    ancestor?: Array<"PRIVATE" | "PUBLIC" | "UNLISTED">;
    itemVisibility?: "PRIVATE" | "PUBLIC";
    avatar?: boolean;
    variantComplete?: boolean;
  } = {},
) {
  const kind = options.kind ?? "IMAGE";
  const mimeType = options.mime ?? (kind === "IMAGE" ? "image/jpeg" : "application/pdf");
  const links = options.links ?? [{ itemId, type: kind, visibility: "PUBLIC" }];
  const calls: string[] = [];
  const database = {
    $queryRaw: async <T>(strings: TemplateStringsArray): Promise<T> => {
      const sql = strings.join("?");
      calls.push(sql);
      if (sql.includes('FROM "MediaAsset"'))
        return [
          {
            id: assetId,
            ownerId,
            kind,
            status: options.status ?? "READY",
            storageKey: "originals/safe",
            mimeType,
            byteSize: 42n,
            checksumSha256: sha,
            originalFileName: "example.pdf",
          },
        ] as T;
      if (sql.includes('FROM "MediaVariant"'))
        return options.variantComplete === false
          ? ([
              {
                name: "MEDIUM",
                storageKey: "variants/reserved",
                mimeType: "image/webp",
                byteSize: 0n,
                checksumSha256: "",
                width: 0,
                height: 0,
              },
            ] as T)
          : ([
              {
                name: "MEDIUM",
                storageKey: "variants/safe",
                mimeType: "image/webp",
                byteSize: 3n,
                checksumSha256: "b".repeat(64),
                width: 30,
                height: 20,
              },
            ] as T);
      if (sql.includes('FROM "MediaLink"') || sql.includes('FROM "DocumentLink"'))
        return links.filter((link) =>
          sql.includes('FROM "MediaLink"') ? link.type === "IMAGE" : link.type === "DOCUMENT",
        ) as T;
      if (sql.includes('FROM "UserProfile"'))
        return (options.avatar ? [{ userId: ownerId }] : []) as T;
      throw new Error(`Unexpected query ${sql}`);
    },
  };
  const loadItem = vi.fn(async () => ({
    item: { archivedAt: null, disposedAt: null },
    facts: createTrustedResourceFacts({
      type: "ITEM",
      ownerId,
      visibility: options.itemVisibility ?? "PUBLIC",
      ancestorVisibility: options.ancestor ?? ["PUBLIC", "PUBLIC"],
      role: null,
      moderation: "VISIBLE",
      interactionBlocked: false,
      commentsEnabled: false,
    }),
  }));
  return { service: createMediaReadService(database, loadItem), database, loadItem, calls };
}

describe("media read policy", () => {
  it("denies a foreign private document even on a public item", async () => {
    const { service } = fixture({
      kind: "DOCUMENT",
      links: [{ itemId, type: "DOCUMENT", visibility: "PRIVATE" }],
    });
    expect(await service.resolveRead("other", assetId, "original")).toBeNull();
    expect(await service.resolveRead(null, assetId, "original")).toBeNull();
  });

  it("allows the public only a complete sanitized image variant, including image documents", async () => {
    for (const kind of ["IMAGE", "DOCUMENT"] as const) {
      const { service } = fixture({
        kind,
        mime: "image/jpeg",
        links: [{ itemId, type: kind, visibility: "PUBLIC" }],
      });
      expect(await service.resolveRead(null, assetId, "medium")).toMatchObject({
        storageKey: "variants/safe",
        public: true,
        mimeType: "image/webp",
      });
      expect(await service.resolveRead(null, assetId, "original")).toBeNull();
    }
  });

  it("rejects public images under a private grandparent, including a public document link", async () => {
    const { service } = fixture({ ancestor: ["PUBLIC", "PUBLIC", "PRIVATE"] });
    expect(await service.resolveRead(null, assetId, "medium")).toBeNull();
    const document = fixture({
      kind: "DOCUMENT",
      links: [{ itemId, type: "DOCUMENT", visibility: "PUBLIC" }],
      ancestor: ["PUBLIC", "PRIVATE"],
    });
    expect(await document.service.resolveRead(null, assetId, "original")).toBeNull();
  });

  it("honors every link, and never treats an unlinked retained asset as public", async () => {
    const shared = fixture({
      links: [
        { itemId: randomUUID(), type: "IMAGE", visibility: "PUBLIC" },
        { itemId, type: "IMAGE", visibility: "PUBLIC" },
      ],
    });
    shared.loadItem.mockRejectedValueOnce(new ResourceQueryError());
    expect(await shared.service.resolveRead(null, assetId, "medium")).toMatchObject({
      public: true,
    });
    expect(await fixture({ links: [] }).service.resolveRead(null, assetId, "medium")).toBeNull();
  });

  it("serves an owned original but denies unknown variants, incomplete rows, and nonready public bytes", async () => {
    const { service } = fixture();
    expect(await service.resolveRead(ownerId, assetId, "original")).toMatchObject({
      storageKey: "originals/safe",
      public: false,
    });
    expect(await service.resolveRead(ownerId, assetId, "bogus")).toBeNull();
    expect(
      await fixture({ status: "PROCESSING" }).service.resolveRead(null, assetId, "medium"),
    ).toBeNull();
    expect(
      await fixture({ variantComplete: false }).service.resolveRead(null, assetId, "medium"),
    ).toBeNull();
  });

  it("denies an owner's unlinked retained original and one whose item was deleted", async () => {
    const unlinked = fixture({ links: [] });
    expect(await unlinked.service.resolveRead(ownerId, assetId, "original")).toBeNull();
    const deleted = fixture();
    deleted.loadItem.mockRejectedValueOnce(new ResourceQueryError());
    expect(await deleted.service.resolveRead(ownerId, assetId, "original")).toBeNull();
  });

  it("rejects inherited object names as unknown URL variants before any database access", async () => {
    const { service, calls } = fixture();
    expect(await service.resolveRead(null, assetId, "constructor")).toBeNull();
    expect(await service.resolveRead(null, assetId, "__proto__")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("uses the public profile avatar reference independent of item links", async () => {
    const { service } = fixture({ links: [], avatar: true });
    expect(await service.resolveRead(null, assetId, "medium")).toMatchObject({ public: true });
    expect(await service.resolveRead(null, assetId, "original")).toBeNull();
  });
});
