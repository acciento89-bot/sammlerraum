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
    linkAsset: vi.fn(async () => ({ id: randomUUID(), position: 0 })),
  };
  return {
    service,
    routes: createMediaRouteHandlers({
      appOrigin: "https://example.test",
      getSession: async () => (session ? { user: { id: session } } : null),
      createMediaService: () => service as never,
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
