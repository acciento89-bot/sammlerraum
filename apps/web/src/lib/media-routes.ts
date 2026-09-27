import { ApiError } from "@sammlerraum/contracts/errors";
import { LinkAssetInputSchema } from "@sammlerraum/contracts/media";
import {
  MediaServiceError,
  type MediaLimits,
  type createMediaService,
} from "@sammlerraum/domain/media/media-service";

import { apiRoute } from "./api/route-handler";

type Session = { user: { id: string } };
type Service = ReturnType<typeof createMediaService>;
type Dependencies = {
  appOrigin: string;
  getSession(headers: Headers): Promise<Session | null>;
  createMediaService(): Service;
  limits: Pick<MediaLimits, "maxImageBytes" | "maxDocumentBytes">;
};
const noStore = { "cache-control": "no-store" };

function assertOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== new URL(origin).origin) {
    throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
  }
}

async function actor(dependencies: Dependencies, request: Request): Promise<string> {
  assertOrigin(request, dependencies.appOrigin);
  const session = await dependencies.getSession(request.headers);
  if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
  return session.user.id;
}

// The stream is counted independently of Content-Length, including when absent or false.
export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new ApiError("UPLOAD_TOO_LARGE", 413, "Upload too large");
  }
  if (!request.body) throw new ApiError("VALIDATION_ERROR", 400, "Request body required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new ApiError("UPLOAD_TOO_LARGE", 413, "Upload too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function safeMediaError(error: unknown): never {
  if (!(error instanceof MediaServiceError)) throw error;
  if (error.code === "UPLOAD_TOO_LARGE" || error.code === "IMAGE_TOO_LARGE") {
    throw new ApiError(error.code, 413, "Upload too large");
  }
  if (error.code === "ASSET_NOT_FOUND" || error.code === "ITEM_NOT_FOUND") {
    throw new ApiError("NOT_FOUND", 404, "Resource not found");
  }
  if (error.code === "ASSET_NOT_READY" || error.code === "LINK_ALREADY_EXISTS") {
    throw new ApiError("CONFLICT", 409, "Asset cannot be linked");
  }
  throw new ApiError("VALIDATION_ERROR", 400, "Invalid media request");
}

export function createMediaRouteHandlers(dependencies: Dependencies) {
  async function upload(request: Request, kind: "IMAGE" | "DOCUMENT") {
    const userId = await actor(dependencies, request);
    const fileName = request.headers.get("x-file-name");
    const claimedMime = request.headers.get("content-type");
    if (!fileName || !claimedMime)
      throw new ApiError("VALIDATION_ERROR", 400, "File metadata required");
    const bytes = await readBoundedBody(
      request,
      kind === "IMAGE" ? dependencies.limits.maxImageBytes : dependencies.limits.maxDocumentBytes,
    );
    try {
      const service = dependencies.createMediaService();
      const asset =
        kind === "IMAGE"
          ? await service.createImageUpload(userId, bytes, { fileName, claimedMime })
          : await service.createDocumentUpload(userId, bytes, { fileName, claimedMime });
      return Response.json({ asset }, { status: 201, headers: noStore });
    } catch (error) {
      safeMediaError(error);
    }
  }

  async function link(request: Request, itemId: string, target: "ITEM" | "ITEM_DOCUMENT") {
    const userId = await actor(dependencies, request);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 4096)));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("VALIDATION_ERROR", 400, "Request validation failed");
    }
    const input = LinkAssetInputSchema.parse({
      ...(body && typeof body === "object" ? body : {}),
      target,
      itemId,
    });
    try {
      const link = await dependencies.createMediaService().linkAsset(userId, input);
      return Response.json({ link }, { status: 201, headers: noStore });
    } catch (error) {
      safeMediaError(error);
    }
  }

  return {
    POST_IMAGE: apiRoute((request) => upload(request, "IMAGE")),
    POST_DOCUMENT: apiRoute((request) => upload(request, "DOCUMENT")),
    POST_ITEM_IMAGE: apiRoute((request, itemId: string) => link(request, itemId, "ITEM")),
    POST_ITEM_DOCUMENT: apiRoute((request, itemId: string) =>
      link(request, itemId, "ITEM_DOCUMENT"),
    ),
  };
}
