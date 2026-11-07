import { ApiError } from "@sammlerraum/contracts/errors";
import {
  ImportServiceError,
  importFail,
  parseImportRequestJson,
  IMPORT_MAX_SOURCE_BYTES,
} from "@sammlerraum/contracts/imports";
import { createImportService } from "@sammlerraum/domain/imports/import-service";
import { createImportCommitService } from "@sammlerraum/domain/imports/import-commit-service";
import { createImportWorkflowService } from "@sammlerraum/domain/imports/import-workflow-service";
import type { createPrismaClient } from "@sammlerraum/db/create-client";
import type { StorageProvider, StorageStagingLocker } from "@sammlerraum/storage";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
import { mapItemSearchError, readSearchQueryMap } from "./item-search-routes";
type Dependencies = {
  database: ReturnType<typeof createPrismaClient>;
  storage: StorageProvider;
  lock: StorageStagingLocker;
  appOrigin: string;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
};
export function createImportRouteHandlers(deps: Dependencies) {
  const core = createImportService(deps.database),
    commit = createImportCommitService(deps.database),
    workflow = createImportWorkflowService(deps.database, deps.storage, deps.lock);
  const actor = async (request: Request, mutation = false) => {
    if (mutation && request.headers.get("origin") !== new URL(deps.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await deps.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return { userId: session.user.id };
  };
  async function mapped(work: () => Promise<Response>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ImportServiceError)
        throw new ApiError(
          error.code,
          error.code === "IMPORT_INVALID"
            ? 400
            : error.code === "IMPORT_NOT_FOUND"
              ? 404
              : error.code === "IMPORT_LIMIT_EXCEEDED"
                ? 413
                : 409,
          "Import request cannot be completed",
        );
      return mapItemSearchError(error);
    }
  }
  const json = (input: unknown, status = 200) =>
    Response.json(input, { status, headers: { "cache-control": "no-store" } });
  async function readJson(request: Request) {
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
      return importFail("IMPORT_INVALID");
    const bytes = await readBoundedBody(request, 16384);
    try {
      return parseImportRequestJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      return importFail("IMPORT_INVALID");
    }
  }
  return {
    GET: apiRoute(async (request: Request, operation: string) =>
      mapped(async () => {
        const who = await actor(request);
        if (operation === "profiles") {
          if (new URL(request.url).search) return importFail("IMPORT_INVALID");
          return json(await core.listImportProfiles(who));
        }
        if (operation === "status") {
          const query = readSearchQueryMap(request, ["id"]);
          return json(await core.getImportState(who, query.id));
        }
        throw new ApiError("NOT_FOUND", 404, "Resource not found");
      }),
    ),
    POST: apiRoute(async (request: Request, operation: string) =>
      mapped(async () => {
        const who = await actor(request, true);
        if (new URL(request.url).search) return importFail("IMPORT_INVALID");
        if (operation === "upload") {
          const contentType = request.headers.get("content-type") ?? "";
          if (!/^multipart\/form-data\s*;/iu.test(contentType)) return importFail("IMPORT_INVALID");
          const bytes = await readBoundedBody(request, IMPORT_MAX_SOURCE_BYTES + 16384);
          let form: FormData;
          try {
            form = await new Request(request.url, {
              method: "POST",
              headers: { "content-type": contentType },
              body: new Uint8Array(bytes).buffer,
            }).formData();
          } catch {
            return importFail("IMPORT_INVALID");
          }
          if (
            [...form.keys()].length !== 2 ||
            form.getAll("metadata").length !== 1 ||
            form.getAll("file").length !== 1
          )
            return importFail("IMPORT_INVALID");
          const metadata = form.get("metadata"),
            file = form.get("file");
          if (
            typeof metadata !== "string" ||
            !(file instanceof File) ||
            file.size > IMPORT_MAX_SOURCE_BYTES
          )
            return importFail("IMPORT_INVALID");
          return json(
            await workflow.uploadImport(
              who,
              parseImportRequestJson(metadata),
              new Uint8Array(await file.arrayBuffer()),
            ),
            202,
          );
        }
        const input = await readJson(request);
        switch (operation) {
          case "preview":
            return json(await core.buildImportPreview(who, input));
          case "preview-page":
            return json(await core.getImportReviewPage(who, input));
          case "profile":
            return json(await core.saveImportProfile(who, input));
          case "merge-target":
            return json(await commit.prepareMergeTarget(who, input));
          case "decisions":
            return json(await commit.saveDecisions(who, input));
          case "approve":
            return json(await commit.approveCommit(who, input), 202);
          default:
            throw new ApiError("NOT_FOUND", 404, "Resource not found");
        }
      }),
    ),
  };
}
