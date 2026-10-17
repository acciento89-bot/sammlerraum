import {
  GRADING_MAX_BODY_BYTES,
  GradingIdSchema,
  GradingInputSchema,
} from "@sammlerraum/contracts/grading";
import { ApiError } from "@sammlerraum/contracts/errors";
import {
  createGradingService,
  GradingServiceError,
  type GradingDatabase,
} from "@sammlerraum/domain/grading/grading-service";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";

type Authentication = {
  api: {
    getSession(input: {
      headers: Headers;
      query: { disableCookieCache: true; disableRefresh: true };
    }): Promise<{ user: { id: string } } | null>;
  };
};
export function createGradingRouteDependencies(
  database: GradingDatabase,
  auth: Authentication,
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    createService: (actor: string) => createGradingService(database, actor),
  };
}
function routeId(value: string) {
  const parsed = GradingIdSchema.safeParse(value);
  if (!parsed.success) throw new ApiError("NOT_FOUND", 404, "Resource not found");
  return parsed.data;
}
function mapped(error: unknown): never {
  if (error instanceof GradingServiceError) {
    if (error.code === "ITEM_NOT_FOUND" || error.code === "GRADING_NOT_FOUND")
      throw new ApiError("NOT_FOUND", 404, "Resource not found");
    if (error.code === "GRADING_INVALID")
      throw new ApiError("VALIDATION_ERROR", 400, "Invalid grading request");
    throw new ApiError(error.code, 409, "Grading change cannot be applied");
  }
  throw error;
}
async function json(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    throw new ApiError("VALIDATION_ERROR", 400, "JSON body required");
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedBody(request, GRADING_MAX_BODY_BYTES),
      ),
    ) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid JSON body");
  }
}
export function createGradingRouteHandlers(
  dependencies: ReturnType<typeof createGradingRouteDependencies>,
) {
  async function actor(request: Request, mutation: boolean) {
    if (mutation && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return dependencies.createService(session.user.id);
  }
  async function run(work: () => Promise<unknown>, key: "grading" | "gradings", status = 200) {
    try {
      return Response.json(
        { [key]: await work() },
        { status, headers: { "cache-control": "no-store" } },
      );
    } catch (error) {
      mapped(error);
    }
  }
  return {
    GET_GRADINGS: apiRoute(async (request, itemId: string) => {
      const service = await actor(request, false);
      return run(() => service.listGradings(routeId(itemId)), "gradings");
    }),
    GET_GRADING: apiRoute(async (request, itemId: string, gradingId: string) => {
      const service = await actor(request, false);
      return run(() => service.getGrading(routeId(itemId), routeId(gradingId)), "grading");
    }),
    POST_GRADING: apiRoute(async (request, itemId: string) => {
      const service = await actor(request, true);
      const input = GradingInputSchema.parse(await json(request));
      return run(() => service.addGrading(routeId(itemId), input), "grading", 201);
    }),
    PUT_GRADING: apiRoute(async (request, itemId: string, gradingId: string) => {
      const service = await actor(request, true);
      const input = GradingInputSchema.parse(await json(request));
      return run(
        () => service.updateGrading(routeId(itemId), routeId(gradingId), input),
        "grading",
      );
    }),
    DELETE_GRADING: apiRoute(async (request, itemId: string, gradingId: string) => {
      const service = await actor(request, true);
      if (request.body !== null) {
        await readBoundedBody(request, GRADING_MAX_BODY_BYTES);
        throw new ApiError("VALIDATION_ERROR", 400, "DELETE does not accept a body");
      }
      try {
        await service.removeGrading(routeId(itemId), routeId(gradingId));
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      } catch (error) {
        mapped(error);
      }
    }),
  };
}
