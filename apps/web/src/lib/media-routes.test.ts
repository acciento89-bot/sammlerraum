import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createMediaRouteHandlers } from "./media-routes";

function fixture(session: string | null = "owner") {
  const service = {
    createImageUpload: vi.fn(async () => ({ id: randomUUID(), status: "PENDING", kind: "IMAGE" })),
    createDocumentUpload: vi.fn(async () => ({
      id: randomUUID(),
      status: "READY",
      kind: "DOCUMENT",
    })),
    listItemMedia: vi.fn(async () => ({ images: [], documents: [] })),
    reorderGallery: vi.fn(async () => undefined),
    updateDocument: vi.fn(async () => undefined),
    linkAsset: vi.fn(async () => ({ id: randomUUID(), position: 0 })),
  };
  const cleanup = { unlinkAsset: vi.fn(async () => {}) };
  return {
    cleanup,
    service,
    routes: createMediaRouteHandlers({
      appOrigin: "https://example.test",
      getSession: async () => (session ? { user: { id: session } } : null),
      createMediaService: () => service as never,
      createCleanupService: () => cleanup as never,
      limits: { maxImageBytes: 4, maxDocumentBytes: 6 },
    }),
  };
}

function request(body: NonNullable<RequestInit["body"]>, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/v1/media/images", {
    method: "POST",
    body,
    headers: {
      origin: "https://example.test",
      "content-type": "image/jpeg",
      "x-file-name": "a.jpg",
      ...headers,
    },
    ...(body instanceof ReadableStream ? { duplex: "half" as never } : {}),
  });
}

describe("media routes", () => {
  it("authenticates before consuming a streamed body", async () => {
    let pulled = false;
    const stream = new ReadableStream(
      {
        pull(controller) {
          pulled = true;
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const { routes, service } = fixture(null);
    const response = await routes.POST_IMAGE(request(stream));
    expect(response.status).toBe(401);
    expect(pulled).toBe(false);
    expect(service.createImageUpload).not.toHaveBeenCalled();
  });

  it("rejects an absent content length when streamed bytes exceed the limit", async () => {
    const { routes, service } = fixture();
    const response = await routes.POST_IMAGE(request(new Uint8Array([1, 2, 3, 4, 5])));
    expect(response.status).toBe(413);
    expect(service.createImageUpload).not.toHaveBeenCalled();
  });

  it("stops pulling a stream as soon as the bound is crossed", async () => {
    let pulls = 0;
    const stream = new ReadableStream(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
        },
      },
      { highWaterMark: 0 },
    );
    const { routes } = fixture();
    const response = await routes.POST_IMAGE(request(stream));
    expect(response.status).toBe(413);
    expect(pulls).toBe(1);
  });

  it("rejects a lying small content length after counting bytes", async () => {
    const { routes, service } = fixture();
    const response = await routes.POST_IMAGE(
      request(new Uint8Array([1, 2, 3, 4, 5]), { "content-length": "2" }),
    );
    expect(response.status).toBe(413);
    expect(service.createImageUpload).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutation before reading bytes", async () => {
    const { routes, service } = fixture();
    const response = await routes.POST_IMAGE(
      request(new Uint8Array([1]), { origin: "https://evil.test" }),
    );
    expect(response.status).toBe(403);
    expect(service.createImageUpload).not.toHaveBeenCalled();
  });

  it("uploads a bounded image using the trusted actor and exposes no storage path", async () => {
    const { routes, service } = fixture();
    const response = await routes.POST_IMAGE(request(new Uint8Array([1, 2, 3])));
    expect(response.status).toBe(201);
    expect(service.createImageUpload).toHaveBeenCalledWith("owner", new Uint8Array([1, 2, 3]), {
      fileName: "a.jpg",
      claimedMime: "image/jpeg",
    });
    expect(await response.json()).toMatchObject({ asset: { status: "PENDING" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("links only for a trusted actor with the path item id", async () => {
    const { routes, service } = fixture();
    const itemId = randomUUID();
    const assetId = randomUUID();
    const response = await routes.POST_ITEM_IMAGE(
      new Request("https://example.test", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify({ assetId, purpose: "GALLERY" }),
      }),
      itemId,
    );
    expect(response.status).toBe(201);
    expect(service.linkAsset).toHaveBeenCalledWith("owner", {
      target: "ITEM",
      itemId,
      assetId,
      purpose: "GALLERY",
    });
  });
});

describe("owner unlink routes", () => {
  it("authenticates and checks same origin before unlinking", async () => {
    const { routes } = fixture(null);
    const response = await routes.DELETE_ITEM_IMAGE(
      new Request("https://example.test/api", {
        method: "DELETE",
        headers: { origin: "https://example.test" },
      }),
      randomUUID(),
      randomUUID(),
    );
    expect(response.status).toBe(401);
  });
  it("unlinks only the authenticated owner's requested item link", async () => {
    const { routes, cleanup } = fixture();
    const itemId = randomUUID(),
      linkId = randomUUID();
    const response = await routes.DELETE_ITEM_DOCUMENT(
      new Request("https://example.test/api", {
        method: "DELETE",
        headers: { origin: "https://example.test" },
      }),
      itemId,
      linkId,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cleanup.unlinkAsset).toHaveBeenCalledWith("owner", "ITEM_DOCUMENT", linkId, itemId);
  });
  it("rejects cross-origin deletion and malformed identifiers", async () => {
    const { routes, cleanup } = fixture();
    const request = new Request("https://example.test/api", {
      method: "DELETE",
      headers: { origin: "https://evil.test" },
    });
    expect((await routes.DELETE_ITEM_IMAGE(request, randomUUID(), randomUUID())).status).toBe(403);
    expect(
      (
        await routes.DELETE_ITEM_IMAGE(
          new Request("https://example.test/api", {
            method: "DELETE",
            headers: { origin: "https://example.test" },
          }),
          "bad",
          "bad",
        )
      ).status,
    ).toBe(404);
    expect(cleanup.unlinkAsset).not.toHaveBeenCalled();
  });
});

describe("bounded media management routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000001";
  const linkId = "00000000-0000-4000-8000-000000000002";
  function managementRequest(method: string, data?: unknown, origin = "https://example.test") {
    return new Request("https://example.test/api/v1/items/" + itemId + "/media", {
      method,
      headers: { origin, "content-type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  }
  it("lists an authenticated owner's safe DTO with no-store without requiring an Origin on GET", async () => {
    const { routes, service } = fixture();
    const response = await routes.GET_ITEM_MEDIA(managementRequest("GET", undefined, ""), itemId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(service.listItemMedia).toHaveBeenCalledWith("owner", itemId);
    expect(((await response.json()) as { limits: unknown }).limits).toEqual({
      maxImageBytes: 4,
      maxDocumentBytes: 6,
    });
    expect(
      (await fixture(null).routes.GET_ITEM_MEDIA(managementRequest("GET"), itemId)).status,
    ).toBe(401);
  });
  it("validates origin, bounded complete order and explicit document visibility before mutation", async () => {
    const { routes, service } = fixture();
    expect(
      (
        await routes.PUT_ITEM_MEDIA(
          managementRequest("PUT", { linkIds: [linkId] }, "https://evil.test"),
          itemId,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await routes.PUT_ITEM_MEDIA(
          managementRequest("PUT", { linkIds: Array(201).fill(linkId) }),
          itemId,
        )
      ).status,
    ).toBe(400);
    expect(
      (await routes.PUT_ITEM_MEDIA(managementRequest("PUT", { linkIds: [linkId] }), itemId)).status,
    ).toBe(204);
    expect(service.reorderGallery).toHaveBeenCalledExactlyOnceWith("owner", itemId, [linkId]);
    expect(
      (
        await routes.PATCH_ITEM_DOCUMENT(
          managementRequest("PATCH", { category: "INVOICE" }),
          itemId,
          linkId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await routes.PATCH_ITEM_DOCUMENT(
          managementRequest("PATCH", { category: "INVOICE", visibility: "PUBLIC" }),
          itemId,
          linkId,
        )
      ).status,
    ).toBe(204);
    expect(service.updateDocument).toHaveBeenCalledExactlyOnceWith("owner", itemId, linkId, {
      category: "INVOICE",
      visibility: "PUBLIC",
    });
  });
});

describe("explicit filename header encoding", () => {
  it("decodes percent-encoded UTF-8 exactly once while keeping legacy clients literal", async () => {
    const name = "Łódź – coin 🪙 100%25.png";
    const { routes, service } = fixture();
    expect(
      (
        await routes.POST_IMAGE(
          request(new Uint8Array([1]), {
            "x-file-name": encodeURIComponent(name),
            "x-file-name-encoding": "percent-utf8",
          }),
        )
      ).status,
    ).toBe(201);
    expect(service.createImageUpload).toHaveBeenLastCalledWith("owner", expect.any(Uint8Array), {
      fileName: name,
      claimedMime: "image/jpeg",
    });
    expect(
      (
        await routes.POST_IMAGE(
          request(new Uint8Array([1]), { "x-file-name": "literal%20name%252F.jpg" }),
        )
      ).status,
    ).toBe(201);
    expect(service.createImageUpload).toHaveBeenLastCalledWith("owner", expect.any(Uint8Array), {
      fileName: "literal%20name%252F.jpg",
      claimedMime: "image/jpeg",
    });
  });
  it("rejects malformed UTF-8 escapes and unknown encoding markers before upload persistence", async () => {
    for (const [name, encoding] of [
      ["bad%GG.jpg", "percent-utf8"],
      ["x".repeat(255 * 9 + 1), "percent-utf8"],
      [encodeURIComponent("ä".repeat(256)), "percent-utf8"],
      ["bad%FF.jpg", "percent-utf8"],
      ["safe.jpg", "base64"],
    ]) {
      const { routes, service } = fixture();
      expect(
        (
          await routes.POST_IMAGE(
            request(new Uint8Array([1]), {
              "x-file-name": name!,
              "x-file-name-encoding": encoding!,
            }),
          )
        ).status,
      ).toBe(400);
      expect(service.createImageUpload).not.toHaveBeenCalled();
    }
  });
});
