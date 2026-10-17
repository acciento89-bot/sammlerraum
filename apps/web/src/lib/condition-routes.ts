import {
  CONDITION_MAX_BODY_BYTES,
  ConditionIdSchema,
  SetItemCategoryInputSchema,
  SetItemConditionInputSchema,
} from "@sammlerraum/contracts/condition";
import { ApiError } from "@sammlerraum/contracts/errors";
import {
  ConditionServiceError,
  createConditionService,
  type ConditionDatabase,
} from "@sammlerraum/domain/condition/condition-service";
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
export function createConditionRouteDependencies(
  database: ConditionDatabase,
  auth: Authentication,
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    createService: (userId: string) => createConditionService(database, userId),
  };
}
function routeId(value: string) {
  const parsed = ConditionIdSchema.safeParse(value);
  if (!parsed.success) throw new ApiError("NOT_FOUND", 404, "Resource not found");
  return parsed.data;
}
function mapped(error: unknown): never {
  if (error instanceof ConditionServiceError) {
    if (error.code === "ITEM_NOT_FOUND" || error.code === "CONDITION_NOT_FOUND")
      throw new ApiError("NOT_FOUND", 404, "Resource not found");
    if (["ITEM_INACTIVE", "CONDITION_CLEAR_REQUIRED", "CONDITION_INACTIVE"].includes(error.code))
      throw new ApiError(error.code, 409, "Condition change cannot be applied");
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid condition request");
  }
  throw error;
}
async function json(request: Request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    throw new ApiError("VALIDATION_ERROR", 400, "JSON body required");
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedBody(request, CONDITION_MAX_BODY_BYTES),
      ),
    ) as unknown;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("VALIDATION_ERROR", 400, "Invalid JSON body");
  }
}
export function createConditionRouteHandlers(
  dependencies: ReturnType<typeof createConditionRouteDependencies>,
) {
  async function actor(request: Request, mutation: boolean) {
    if (mutation && request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    return dependencies.createService(session.user.id);
  }
  async function run(work: () => Promise<unknown>, key: "scheme" | "condition") {
    try {
      return Response.json({ [key]: await work() }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      mapped(error);
    }
  }
  return {
    GET_SCHEME: apiRoute(async (request, categoryId: string) => {
      const service = await actor(request, false);
      return run(() => service.getConditionScheme(routeId(categoryId)), "scheme");
    }),
    GET_CONDITION: apiRoute(async (request, itemId: string) => {
      const service = await actor(request, false);
      return run(() => service.getItemCondition(routeId(itemId)), "condition");
    }),
    PUT_CONDITION: apiRoute(async (request, itemId: string) => {
      const service = await actor(request, true);
      const parsed = SetItemConditionInputSchema.parse(await json(request));
      return run(() => service.setItemCondition(routeId(itemId), parsed.optionId), "condition");
    }),
    PUT_CATEGORY: apiRoute(async (request, itemId: string) => {
      const service = await actor(request, true);
      const parsed = SetItemCategoryInputSchema.parse(await json(request));
      return run(() => service.setItemCategory(routeId(itemId), parsed), "condition");
    }),
  };
}
