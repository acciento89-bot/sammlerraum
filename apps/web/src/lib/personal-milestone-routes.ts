import { ApiError } from "@sammlerraum/contracts/errors";
import { PersonalMilestoneError, milestoneFail } from "@sammlerraum/contracts/personal-milestones";
import { ItemSearchError } from "@sammlerraum/contracts/item-search";
import { createPersonalMilestoneService } from "@sammlerraum/domain/dashboard/personal-milestone-service";
import type { SearchDatabase } from "@sammlerraum/domain/search/item-search-service";
import {
  readItemSearchQuery,
  mapItemSearchError,
  type createItemSearchRouteDependencies,
} from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
import { readMilestoneBody } from "./api/read-milestone-body";
export function createPersonalMilestoneRouteDependencies(
  database: SearchDatabase,
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: createPersonalMilestoneService(database),
  };
}
function mapped(error: unknown): never {
  if (
    error instanceof PersonalMilestoneError ||
    (error instanceof ItemSearchError && error.code === "SEARCH_INVALID")
  ) {
    const code = error instanceof PersonalMilestoneError ? error.code : "MILESTONE_INVALID";
    const status = code === "MILESTONE_INVALID" ? 400 : code === "MILESTONE_NOT_FOUND" ? 404 : 409;
    throw new ApiError(
      code,
      status,
      status === 400
        ? "Invalid milestone request"
        : status === 404
          ? "Resource not found"
          : "Milestone changed; inspect the current record",
    );
  }
  return mapItemSearchError(error);
}
export function createPersonalMilestoneRouteHandlers(
  dependencies: ReturnType<typeof createPersonalMilestoneRouteDependencies>,
) {
  async function actor(request: Request) {
    if (request.headers.get("origin") !== new URL(dependencies.appOrigin).origin)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    if (new URL(request.url).hash) milestoneFail("MILESTONE_INVALID");
    readItemSearchQuery(request, []);
    return { userId: session.user.id };
  }
  async function run(work: () => Promise<unknown>, status = 200) {
    try {
      return Response.json(await work(), { status, headers: { "cache-control": "no-store" } });
    } catch (error) {
      return mapped(error);
    }
  }
  return {
    POST: apiRoute((request) =>
      run(async () => {
        const a = await actor(request);
        return dependencies.service.createMilestone(a, await readMilestoneBody(request, "create"));
      }, 201),
    ),
    QUERY: apiRoute((request) =>
      run(async () => {
        const a = await actor(request);
        return dependencies.service.listMilestones(a, await readMilestoneBody(request, "query"));
      }),
    ),
    PATCH: apiRoute((request, id: string) =>
      run(async () => {
        const a = await actor(request);
        return dependencies.service.updateMilestone(
          a,
          id,
          await readMilestoneBody(request, "update"),
        );
      }),
    ),
    DELETE: apiRoute((request, id: string) =>
      run(async () => {
        const a = await actor(request);
        return dependencies.service.deleteMilestone(
          a,
          id,
          await readMilestoneBody(request, "delete"),
        );
      }),
    ),
  };
}
