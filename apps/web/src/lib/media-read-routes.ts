import { ApiError } from "@sammlerraum/contracts/errors";
import { StorageError } from "@sammlerraum/storage";
import type { ResolvedMediaRead } from "@sammlerraum/domain/media/media-read";

import { apiRoute } from "./api/route-handler";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  resolveRead(
    userId: string | null,
    assetId: string,
    variant: string,
  ): Promise<ResolvedMediaRead | null>;
  storage: { read(key: string): Promise<Uint8Array> };
};

function matchesEtag(header: string | null, etag: string): boolean {
  return (
    header !== null &&
    header.split(",").some((value) => {
      const tag = value.trim();
      return tag === "*" || tag === etag || tag === `W/${etag}`;
    })
  );
}

export function createMediaReadHandlers(dependencies: Dependencies) {
  return {
    GET: apiRoute(async (request: Request, assetId: string, variant: string) => {
      const session = await dependencies.getSession(request.headers);
      const media = await dependencies.resolveRead(session?.user.id ?? null, assetId, variant);
      if (!media) throw new ApiError("NOT_FOUND", 404, "Resource not found");
      const etag = `"${media.checksumSha256}"`;
      const headers = new Headers({
        "content-type": media.mimeType,
        etag: etag,
        "cache-control": media.public ? "public, max-age=0, must-revalidate" : "private, no-store",
        vary: "Cookie",
        "x-content-type-options": "nosniff",
      });
      if (media.download) {
        headers.set("content-disposition", 'attachment; filename="document.pdf"');
        headers.set("content-security-policy", "sandbox");
      }
      if (matchesEtag(request.headers.get("if-none-match"), etag)) {
        return new Response(null, { status: 304, headers });
      }
      let bytes: Uint8Array;
      try {
        bytes = await dependencies.storage.read(media.storageKey);
      } catch (error) {
        if (error instanceof StorageError && error.code === "STORAGE_NOT_FOUND") {
          throw new ApiError("NOT_FOUND", 404, "Resource not found");
        }
        throw error;
      }
      return new Response(bytes as unknown as ConstructorParameters<typeof Response>[0], {
        headers,
      });
    }),
  };
}
