import { ApiError } from "@sammlerraum/contracts/errors";
import {
  CATALOG_PROPOSAL_MAX_BYTES,
  CatalogProposalDecisionSchema,
  CatalogProposalIdSchema,
  CatalogProposalListInputSchema,
  CatalogRollbackInputSchema,
  SubmitCatalogProposalInputSchema,
} from "@sammlerraum/contracts/catalog-proposals";
import { ApplicationRoleError } from "@sammlerraum/domain/authz/application-role";
import { CategoryTemplateServiceError } from "@sammlerraum/domain/catalog/category-template-service";
import { CatalogServiceError } from "@sammlerraum/domain/catalog/catalog-service";
import {
  CatalogProposalError,
  type createCatalogProposalService,
} from "@sammlerraum/domain/catalog/proposal-service";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";

type Dependencies = {
  appOrigin: string;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  createService(): ReturnType<typeof createCatalogProposalService>;
};
const noStore = { "cache-control": "no-store" };
function mapped(error: unknown): never {
  if (error instanceof ApplicationRoleError)
    throw new ApiError("FORBIDDEN", 403, "Moderator authority required");
  if (error instanceof CatalogProposalError) {
    if (error.code === "CATALOG_PROPOSAL_ISOLATION_UNSUPPORTED") throw error;
    if (error.code === "CATALOG_PROPOSAL_NOT_FOUND")
      throw new ApiError("NOT_FOUND", 404, "Resource not found");
    if (
      error.code === "CATALOG_PROPOSAL_CONFLICT" ||
      error.code === "CATALOG_PROPOSAL_ALREADY_DECIDED"
    )
      throw new ApiError(error.code, 409, "Proposal cannot be applied");
    if (error.code === "CATALOG_PROPOSAL_LIMIT_EXCEEDED")
      throw new ApiError(error.code, 429, "Proposal submission limit reached");
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid catalog proposal request");
  }
  if (
    error instanceof CategoryTemplateServiceError &&
    [
      "CATALOG_ATTRIBUTE_DEFINITION_INVALID",
      "CATALOG_ATTRIBUTE_TYPE_MISMATCH",
      "CATALOG_ATTRIBUTE_VALUE_INVALID",
    ].includes(error.code)
  )
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid catalog attribute");
  if (error instanceof CatalogServiceError) {
    if (error.code === "CATALOG_REVISION_CONFLICT" || error.code === "CATALOG_IDENTIFIER_CONFLICT")
      throw new ApiError("CONFLICT", 409, "Catalog revision cannot be applied");
    if (error.code === "CATALOG_NOT_FOUND")
      throw new ApiError("NOT_FOUND", 404, "Resource not found");
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid catalog operation");
  }
  throw error;
}
async function json(request: Request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    throw new ApiError("VALIDATION_ERROR", 400, "JSON body required");
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedBody(request, CATALOG_PROPOSAL_MAX_BYTES),
      ),
    ) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid JSON body");
  }
}
function id(value: string) {
  const parsed = CatalogProposalIdSchema.safeParse(value);
  if (!parsed.success) throw new ApiError("NOT_FOUND", 404, "Resource not found");
  return parsed.data;
}
function listInput(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!["state", "limit", "cursor"].includes(key) || params.getAll(key).length !== 1)
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid list query");
  }
  const limit = params.get("limit");
  if (limit !== null && !/^[0-9]{1,2}$/u.test(limit))
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid list query");
  return CatalogProposalListInputSchema.parse({
    ...(params.has("state") ? { state: params.get("state") } : {}),
    ...(limit === null ? {} : { limit: Number(limit) }),
    ...(params.has("cursor") ? { cursor: params.get("cursor") } : {}),
  });
}
export function createCatalogProposalRouteHandlers(dependencies: Dependencies) {
  async function actor(request: Request, mutation: boolean) {
    if (mutation && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return session.user.id;
  }
  async function run<T>(work: () => Promise<T>, key: "proposal" | "result", status = 200) {
    try {
      return Response.json({ [key]: await work() }, { status, headers: noStore });
    } catch (error) {
      mapped(error);
    }
  }
  async function list(request: Request, review: boolean) {
    const userId = await actor(request, false);
    const input = listInput(request);
    try {
      return Response.json(
        await dependencies.createService().listProposals(userId, input, review),
        { headers: noStore },
      );
    } catch (error) {
      mapped(error);
    }
  }
  async function detail(request: Request, proposalId: string, review: boolean) {
    const userId = await actor(request, false);
    return run(
      () => dependencies.createService().getProposal(id(proposalId), userId, review),
      "proposal",
    );
  }
  return {
    POST_PROPOSAL: apiRoute(async (request) => {
      const userId = await actor(request, true);
      const input = SubmitCatalogProposalInputSchema.parse(await json(request));
      return run(() => dependencies.createService().submitProposal(userId, input), "proposal", 201);
    }),
    GET_PROPOSALS: apiRoute((request) => list(request, false)),
    GET_PROPOSAL: apiRoute((request, proposalId: string) => detail(request, proposalId, false)),
    GET_REVIEW_PROPOSALS: apiRoute((request) => list(request, true)),
    GET_REVIEW_PROPOSAL: apiRoute((request, proposalId: string) =>
      detail(request, proposalId, true),
    ),
    POST_DECISION: apiRoute(async (request, proposalId: string) => {
      const userId = await actor(request, true);
      const input = CatalogProposalDecisionSchema.parse(await json(request));
      return run(
        () =>
          input.decision === "APPROVE"
            ? dependencies.createService().approveProposal(id(proposalId), userId, input.reason)
            : dependencies.createService().rejectProposal(id(proposalId), userId, input.reason),
        "proposal",
      );
    }),
    POST_ROLLBACK: apiRoute(async (request, entryId: string) => {
      const userId = await actor(request, true);
      const input = CatalogRollbackInputSchema.parse(await json(request));
      return run(
        () => dependencies.createService().rollbackCatalogEntry(id(entryId), userId, input),
        "result",
      );
    }),
  };
}
