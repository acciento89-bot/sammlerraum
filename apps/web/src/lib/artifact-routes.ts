import { ApiError } from "@sammlerraum/contracts/errors";
import { ExportError } from "@sammlerraum/contracts/exports";
import { parseImportRequestJson } from "@sammlerraum/contracts/imports";
import { createExportService } from "@sammlerraum/domain/exports/export-service";
import { createArtifactAccessService } from "@sammlerraum/domain/exports/artifact-access-service";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
import { mapItemSearchError, readSearchQueryMap } from "./item-search-routes";
import type { PrivateTransferContext } from "./private-transfer-context";
export function createArtifactRouteHandlers(deps: PrivateTransferContext) {
  const service = createArtifactAccessService(deps.database, deps.storage, deps.lock, {
      canonicalMoneyEnabled: deps.canonicalMoneyEnabled === true,
    }),
    exports = createExportService(deps.database, {
      canonicalMoneyEnabled: deps.canonicalMoneyEnabled === true,
    });
  async function actor(request: Request, mutation = false) {
    if (mutation && request.headers.get("origin") !== new URL(deps.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await deps.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return { userId: session.user.id };
  }
  async function mapped(work: () => Promise<Response>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ExportError)
        throw new ApiError(
          error.code,
          error.code === "EXPORT_INVALID"
            ? 400
            : error.code === "EXPORT_NOT_FOUND"
              ? 404
              : error.code === "EXPORT_LIMIT_EXCEEDED"
                ? 413
                : error.code === "EXPORT_INTEGRITY"
                  ? 500
                  : 409,
          "Export request cannot be completed",
        );
      return mapItemSearchError(error);
    }
  }
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "cache-control": "no-store" } });
  return {
    POST_PROOF_OPTIONS: apiRoute(async (request) =>
      mapped(async () =>
        json(
          await service.listProofOptions(
            await actor(request, true),
            await readPrivateJson(request),
          ),
        ),
      ),
    ),
    POST_EXPORT: apiRoute(async (request) =>
      mapped(async () =>
        json(
          await exports.requestExport(await actor(request, true), await readPrivateJson(request)),
          202,
        ),
      ),
    ),
    GET_HISTORY: apiRoute(async (request) =>
      mapped(async () => {
        const who = await actor(request),
          query = readSearchQueryMap(request, ["limit", "before"]);
        if (query.limit !== undefined && !/^[1-9][0-9]?$/u.test(query.limit))
          throw new ExportError("EXPORT_INVALID");
        let before: unknown;
        try {
          before = query.before === undefined ? undefined : parseImportRequestJson(query.before);
        } catch {
          throw new ExportError("EXPORT_INVALID");
        }
        return json(
          await service.listArtifacts(who, {
            ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}),
            ...(before !== undefined ? { before } : {}),
          }),
        );
      }),
    ),
    GET_DOWNLOAD: apiRoute(async (request) =>
      mapped(async () => {
        const who = await actor(request),
          query = readSearchQueryMap(request, ["id", "kind"]);
        if (request.headers.has("range") || new URL(request.url).hash)
          throw new ExportError("EXPORT_INVALID");
        const file = await service.downloadArtifact(who, { kind: query.kind, jobId: query.id });
        return new Response(new Uint8Array(file.bytes).buffer, {
          headers: {
            "content-type": file.mimeType,
            "content-length": String(file.bytes.byteLength),
            "content-disposition": `attachment; filename="${file.fileName}"`,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        });
      }),
    ),
  };
}
