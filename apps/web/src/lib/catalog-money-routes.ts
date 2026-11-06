import type { CatalogProposalDatabase } from "@sammlerraum/db/catalog-types";
import { ApiError } from "@sammlerraum/contracts/errors";
import { legacyMoneyFail } from "@sammlerraum/contracts/legacy-money";
import { scanCatalogMoneyJson, copyCatalogMoneyInput } from "@sammlerraum/contracts/catalog-money";
import {
  scanPersonalMoneyJson,
  copyPersonalMoneyInput,
} from "@sammlerraum/contracts/personal-money";
import { createCatalogMoneyService } from "@sammlerraum/domain/catalog/catalog-money-service";
import { createCatalogProposalService } from "@sammlerraum/domain/catalog/proposal-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readSearchQueryMap } from "./item-search-routes";
import { mapLegacyMoneyError } from "./legacy-money-routes";
import { ItemSearchError } from "@sammlerraum/contracts/item-search";
import { mapCatalogProposalError } from "./catalog-proposal-routes";
import { apiRoute } from "./api/route-handler";
import { readBoundedBody } from "./api/read-bounded-body";
export function createCatalogMoneyRouteDependencies(
  database: CatalogProposalDatabase,
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
  authoringEnabled: boolean,
) {
  return {
    appOrigin,
    authoringEnabled,
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    service: (id: string) => createCatalogMoneyService(database, id),
    proposals: () => createCatalogProposalService(database),
  };
}
async function body(request: Request, proposal = false): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  try {
    const bytes = await readBoundedBody(request, (proposal ? 64 : 16) * 1024);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw Error();
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    (proposal ? scanCatalogMoneyJson : scanPersonalMoneyJson)(raw);
    return (proposal ? copyCatalogMoneyInput : copyPersonalMoneyInput)(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ApiError && error.status === 413)
      throw new ApiError("MONEY_BODY_TOO_LARGE", 413, "Money request is too large");
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  }
}
function revision(value: string): number {
  if (!/^[1-9][0-9]{0,9}$/u.test(value)) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return number;
}
export function createCatalogMoneyRouteHandlers(
  d: ReturnType<typeof createCatalogMoneyRouteDependencies>,
) {
  type Service = ReturnType<typeof createCatalogMoneyService>;
  type Work = (
    r: Request,
    s: Service,
    actor: string,
    id: string,
    revision: string,
    query: Record<string, string>,
  ) => Promise<unknown>;
  const handle = (work: Work, status = 200, allowed: readonly string[] = []) =>
    apiRoute(async (r: Request, id: string = "", rev: string = "") => {
      try {
        const supplied = r.headers.get("origin"),
          expected = new URL(d.appOrigin).origin;
        if ((r.method !== "GET" || supplied !== null) && supplied !== expected)
          throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
        const session = await d.getSession(r.headers);
        if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
        if (r.method !== "GET" && !d.authoringEnabled)
          throw new ApiError("MONEY_UNAVAILABLE", 503, "Monetary authoring is currently disabled");
        if (new URL(r.url).hash) return legacyMoneyFail("LEGACY_MONEY_INVALID");
        const query = readSearchQueryMap(r, allowed);
        return Response.json(
          await work(r, d.service(session.user.id), session.user.id, id, rev, query),
          { status, headers: { "cache-control": "no-store" } },
        );
      } catch (error) {
        if (error instanceof ItemSearchError) return mapLegacyMoneyError(error);
        return mapCatalogProposalError(error);
      }
    });
  return {
    SUBMIT: handle(
      async (r, _s, actor) => ({
        proposal: await d.proposals().submitMoneyProposal(actor, await body(r, true)),
      }),
      201,
    ),
    READ: handle((_r, s, _actor, id, rev) => s.getRevision(id, revision(rev))),
    CLASSIFY: handle(
      async (r, s, _actor, id, rev) => ({
        schemaVersion: 1,
        money: await s.classify(id, revision(rev), await body(r)),
      }),
      201,
    ),
    REVOKE: handle(async (r, s, _actor, id, rev) => ({
      schemaVersion: 1,
      money: await s.revoke(id, revision(rev), await body(r)),
    })),
    HISTORY: handle(
      (_r, s, _actor, id, rev, q) => {
        if (q.limit !== undefined && !/^[1-9][0-9]?$/u.test(q.limit))
          return legacyMoneyFail("LEGACY_MONEY_INVALID");
        if (q.target !== "ENTRY" && q.target !== "VARIANT")
          return legacyMoneyFail("LEGACY_MONEY_INVALID");
        if (q.target === "ENTRY" && q.variantId !== undefined)
          return legacyMoneyFail("LEGACY_MONEY_INVALID");
        return s.listHistory(
          id,
          revision(rev),
          {
            target:
              q.target === "ENTRY"
                ? { kind: "ENTRY" }
                : { kind: "VARIANT", variantId: q.variantId },
            definitionId: q.definitionId,
          },
          {
            ...(q.limit === undefined ? {} : { limit: Number(q.limit) }),
            ...(q.cursor === undefined ? {} : { cursor: q.cursor }),
          },
        );
      },
      200,
      ["target", "variantId", "definitionId", "limit", "cursor"],
    ),
  };
}
