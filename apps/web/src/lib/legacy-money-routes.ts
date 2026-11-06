import { ApiError } from "@sammlerraum/contracts/errors";
import {
  LegacyMoneyError,
  LegacyMoneySubjectSchema,
  legacyMoneyFail,
  type MoneySubject,
} from "@sammlerraum/contracts/legacy-money";
import {
  scanPersonalMoneyJson,
  copyPersonalMoneyInput,
} from "@sammlerraum/contracts/personal-money";
import {
  createPersonalMoneyService,
  type PersonalMoneyDatabase,
} from "@sammlerraum/domain/money/personal-money-service";
import { ItemServiceError } from "@sammlerraum/domain/items/item-service";
import { CustomFieldServiceError } from "@sammlerraum/domain/custom-fields/custom-field-service";
import { ItemSearchError } from "@sammlerraum/contracts/item-search";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
import { readSearchQueryMap, type createItemSearchRouteDependencies } from "./item-search-routes";
export function createLegacyMoneyRouteDependencies(
  database: PersonalMoneyDatabase,
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    appOrigin,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: (id: string) => createPersonalMoneyService(database, id),
  };
}
export function mapLegacyMoneyError(error: unknown): never {
  if (error instanceof LegacyMoneyError) {
    const code = error.code;
    const status =
      code === "MONEY_NOT_FOUND"
        ? 404
        : code === "MONEY_FORBIDDEN"
          ? 403
          : code === "MONEY_CONFLICT"
            ? 409
            : code === "MONEY_UNAVAILABLE"
              ? 503
              : code === "MONEY_DATA_INTEGRITY"
                ? 500
                : code === "LEGACY_MONEY_INTERPRETATION_UNSUPPORTED"
                  ? 422
                  : 400;
    throw new ApiError(
      code,
      status,
      status === 404
        ? "Resource not found"
        : status === 409
          ? "Money changed; inspect the current record"
          : status === 503
            ? "Money service unavailable"
            : status === 500
              ? "Money data is unavailable"
              : "Invalid money request",
    );
  }
  if (error instanceof ItemSearchError && error.code === "SEARCH_INVALID")
    throw new ApiError("LEGACY_MONEY_INVALID", 400, "Invalid money request");
  if (error instanceof ItemServiceError || error instanceof CustomFieldServiceError) {
    const code = error.code;
    throw new ApiError(
      code,
      code.includes("NOT_FOUND")
        ? 404
        : code.includes("INVALID") || code.includes("MISMATCH")
          ? 400
          : 409,
      code.includes("NOT_FOUND") ? "Resource not found" : "Item change is unavailable",
    );
  }
  throw error;
}
async function body(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  try {
    const bytes = await readBoundedBody(request, 16 * 1024);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw Error();
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    scanPersonalMoneyJson(raw);
    return copyPersonalMoneyInput(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ApiError && error.status === 413)
      throw new ApiError("MONEY_BODY_TOO_LARGE", 413, "Money request is too large");
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  }
}
function subject(id: string, field?: string): Exclude<MoneySubject, { family: "CATALOG" }> {
  const parsed = LegacyMoneySubjectSchema.safeParse(
    field === undefined
      ? { family: "PURCHASE", itemId: id }
      : { family: "CUSTOM", itemId: id, fieldDefinitionId: field },
  );
  if (!parsed.success || parsed.data.family === "CATALOG")
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return parsed.data;
}
export function createLegacyMoneyRouteHandlers(
  d: ReturnType<typeof createLegacyMoneyRouteDependencies>,
) {
  type Service = ReturnType<typeof createPersonalMoneyService>;
  type Work = (
    request: Request,
    service: Service,
    id: string,
    field: string | undefined,
    query: Record<string, string>,
  ) => Promise<unknown>;
  const handle = (work: Work, status = 200, allowed: readonly string[] = []) =>
    apiRoute(async (request: Request, id: string = "", field?: string) => {
      try {
        const supplied = request.headers.get("origin"),
          expected = new URL(d.appOrigin).origin;
        if ((request.method !== "GET" || supplied !== null) && supplied !== expected)
          throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
        const session = await d.getSession(request.headers);
        if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
        if (new URL(request.url).hash) return legacyMoneyFail("LEGACY_MONEY_INVALID");
        const query = readSearchQueryMap(request, allowed);
        const value = await work(request, d.service(session.user.id), id, field, query);
        return Response.json(value, { status, headers: { "cache-control": "no-store" } });
      } catch (error) {
        return mapLegacyMoneyError(error);
      }
    });
  return {
    CREATE: handle(async (r, s) => s.createItemV2(await body(r)), 201),
    READ_ITEM: handle(async (_r, s, id) => s.getItemV2(subject(id).itemId)),
    UPDATE: handle(async (r, s, id) => s.updateItemV2(subject(id).itemId, await body(r))),
    CUSTOM: handle(async (r, s, id, field) => {
      if (field === undefined) return legacyMoneyFail("LEGACY_MONEY_INVALID");
      const target = subject(id, field);
      if (target.family !== "CUSTOM") return legacyMoneyFail("LEGACY_MONEY_INVALID");
      return {
        schemaVersion: 1,
        money: await s.setCustomMoneyV2(target.itemId, target.fieldDefinitionId, await body(r)),
      };
    }),
    READ: handle(
      async (_r, s, id, _f, q) => {
        subject(id);
        const fields = q.fields === undefined ? [] : q.fields.split(",");
        for (const field of fields) subject(id, field);
        return s.getMoneyBulk(id, fields);
      },
      200,
      ["fields"],
    ),
    CLASSIFY: handle(
      async (r, s, id, field) => ({
        schemaVersion: 1,
        money: await s.classifyMoney(subject(id, field), await body(r)),
      }),
      201,
    ),
    HISTORY: handle(
      async (_r, s, id, field, q) => {
        if (q.limit !== undefined && !/^[1-9][0-9]?$/u.test(q.limit))
          return legacyMoneyFail("LEGACY_MONEY_INVALID");
        return s.listHistory(subject(id, field), {
          ...(q.limit === undefined ? {} : { limit: Number(q.limit) }),
          ...(q.cursor === undefined ? {} : { cursor: q.cursor }),
        });
      },
      200,
      ["limit", "cursor"],
    ),
    REVOKE: handle(async (r, s, id, field) => {
      await s.revokeAssertion(subject(id, field), await body(r));
      return { schemaVersion: 1, revoked: true };
    }),
  };
}
