import { AIAnalysisError, AIIdSchema, ApplyAISuggestionsSchema } from "@sammlerraum/contracts/ai";
import { parseCollaborativeItemRequestJson } from "@sammlerraum/contracts/items";
import { ApiError } from "@sammlerraum/contracts/errors";
import {
  createSuggestionApplyService,
  type AIApplyDatabase,
} from "@sammlerraum/domain/ai/suggestion-apply-service";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
export type AIAuthentication = {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: true; disableRefresh: true };
    }): Promise<{ user: { id: string } } | null>;
  };
};
type ApplyService = {
  getReview(actor: { userId: string }, id: unknown): Promise<unknown>;
  applySuggestions(actor: { userId: string }, id: unknown, input: unknown): Promise<unknown>;
};
export function createAIApplyRouteDependencies(
  database: AIApplyDatabase,
  auth: AIAuthentication,
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    createService: () => createSuggestionApplyService(database),
  };
}
export function mapAIError(error: unknown): never {
  if (!(error instanceof AIAnalysisError)) throw error;
  const status =
    error.code === "AI_ITEM_NOT_FOUND"
      ? 404
      : error.code === "AI_INVALID_REQUEST" || error.code === "AI_INVALID_SELECTION"
        ? 400
        : error.code === "AI_LIMIT_REACHED"
          ? 429
          : ["AI_UNAVAILABLE", "AI_INVALID_RESPONSE", "AI_PROVIDER_UNAVAILABLE"].includes(
                error.code,
              )
            ? 503
            : 409;
  throw new ApiError(error.code, status, "Photo analysis request cannot be completed");
}
export async function readAIJson(request: Request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    throw new ApiError("VALIDATION_ERROR", 400, "JSON body required");
  try {
    return parseCollaborativeItemRequestJson(
      new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedBody(request, 32768)),
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid JSON body");
  }
}
export function aiRouteId(input: unknown) {
  const parsed = AIIdSchema.safeParse(input);
  if (!parsed.success) throw new ApiError("NOT_FOUND", 404, "Resource not found");
  return parsed.data;
}
export async function aiRouteActor(
  dependencies: {
    appOrigin: string;
    getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  },
  request: Request,
  mutation: boolean,
) {
  if (mutation && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
    throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
  const session = await dependencies.getSession(request.headers);
  if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
  return { userId: session.user.id };
}
export function createAIApplyRouteHandlers(dependencies: {
  appOrigin: string;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  createService(): ApplyService;
}) {
  return {
    REVIEW: apiRoute(async (request, id: string) => {
      const actor = await aiRouteActor(dependencies, request, false);
      try {
        return Response.json(
          { review: await dependencies.createService().getReview(actor, aiRouteId(id)) },
          { headers: { "cache-control": "no-store" } },
        );
      } catch (error) {
        mapAIError(error);
      }
    }),
    APPLY: apiRoute(async (request, id: string) => {
      const actor = await aiRouteActor(dependencies, request, true),
        input = ApplyAISuggestionsSchema.parse(await readAIJson(request));
      try {
        return Response.json(
          {
            receipt: await dependencies
              .createService()
              .applySuggestions(actor, aiRouteId(id), input),
          },
          { headers: { "cache-control": "no-store" } },
        );
      } catch (error) {
        mapAIError(error);
      }
    }),
  };
}
