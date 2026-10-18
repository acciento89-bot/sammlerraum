import { describe, expect, it, vi } from "vitest";

import type { ResolvedMediaRead } from "@sammlerraum/domain/media/media-read";

import { createMediaReadHandlers } from "../../../../lib/media-read-routes";

const ASSET_ID = "323e4567-e89b-42d3-a456-426614174000";

function setup(session: string | null = null) {
  const storage = { read: vi.fn(async () => new Uint8Array([1, 2, 3])) };
  const resolveRead = vi.fn<
    (
      _userId: string | null,
      _assetId: string,
      _variant: string,
    ) => Promise<ResolvedMediaRead | null>
  >(async () => null);
  const routes = createMediaReadHandlers({
    getSession: async () => (session ? { user: { id: session } } : null),
    resolveRead,
    storage,
  });
  const read = (variant: string, headers?: Headers | Record<string, string>) =>
    routes.GET(
      new Request(`https://example.test/api/v1/media/${ASSET_ID}/${variant}`, {
        ...(headers ? { headers } : {}),
      }),
      ASSET_ID,
      variant,
    );
  return { storage, resolveRead, read };
}

describe("protected media GET", () => {
  it("returns a generic 404 without reading bytes for a foreign private document UUID", async () => {
    const { read, storage } = setup("other-user");
    const response = await read("original");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("serves a public sanitized variant with revalidation headers and a strong ETag", async () => {
    const { read, storage, resolveRead } = setup();
    resolveRead.mockResolvedValueOnce({
      storageKey: "variants/safe",
      mimeType: "image/webp",
      byteSize: 3n,
      checksumSha256: "b".repeat(64),
      public: true,
      download: false,
    });
    const response = await read("medium");
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(response.headers.get("etag")).toBe(`"${"b".repeat(64)}"`);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(storage.read).toHaveBeenCalledWith("variants/safe");
  });

  it("reauthorizes a matching conditional request before returning 304", async () => {
    const { read, storage, resolveRead } = setup();
    const granted = {
      storageKey: "variants/safe",
      mimeType: "image/webp",
      byteSize: 3n,
      checksumSha256: "b".repeat(64),
      public: true,
      download: false,
    };
    resolveRead.mockResolvedValueOnce(granted).mockResolvedValueOnce(null);
    const headers = { "if-none-match": `"${"b".repeat(64)}"` };
    const first = await read("medium", headers);
    const revoked = await read("medium", headers);
    expect(first.status).toBe(304);
    expect(first.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(revoked.status).toBe(404);
    expect(revoked.headers.get("cache-control")).toBe("no-store");
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("sends explicit public PDFs as an attachment with a fixed safe filename", async () => {
    const { read, resolveRead } = setup();
    resolveRead.mockResolvedValueOnce({
      storageKey: "originals/pdf",
      mimeType: "application/pdf",
      byteSize: 3n,
      checksumSha256: "a".repeat(64),
      public: true,
      download: true,
    });
    const response = await read("original");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="document.pdf"');
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
  });

  it("marks owner originals private and never caches them across sessions", async () => {
    const { read, resolveRead } = setup("owner");
    resolveRead.mockResolvedValueOnce({
      storageKey: "originals/private",
      mimeType: "image/jpeg",
      byteSize: 3n,
      checksumSha256: "a".repeat(64),
      public: false,
      download: false,
    });
    const response = await read("original");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
  });
});
