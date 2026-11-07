import {
  CollaborativeCollectionUpdateRequestSchema,
  CollaborativeNodeCreateRequestSchema,
  CollaborativeNodeUpdateRequestSchema,
} from "@sammlerraum/contracts/collections";
import { createCollaborativeCollectionService } from "@sammlerraum/domain/collaboration/collection-authoring-service";
import { CollectionServiceError } from "@sammlerraum/domain/collections/collection-service";
import {
  CollaborativeItemCreateSchema,
  CollaborativeItemUpdateRequestSchema,
} from "@sammlerraum/contracts/items";
import { createCollaborativeItemService } from "@sammlerraum/domain/collaboration/item-authoring-service";
import { ItemServiceError } from "@sammlerraum/domain/items/item-service";
import { ApiError } from "@sammlerraum/contracts/errors";
import { AuditError, AuditResourceQuerySchema } from "@sammlerraum/contracts/audit";
import {
  MembershipError,
  MembershipManagementMutationSchema,
  MembershipCollectionIdSchema,
} from "@sammlerraum/contracts/collaboration";
import { createMembershipService } from "@sammlerraum/domain/collaboration/membership-service";
import { createCollaborationManagementService } from "@sammlerraum/domain/collaboration/management-service";
import { createAuditService } from "@sammlerraum/domain/audit/audit-service";
import type { createItemSearchRouteDependencies } from "./item-search-routes";
import { readSearchQueryMap, mapItemSearchError } from "./item-search-routes";
import { apiRoute } from "./api/route-handler";
import { readPrivateJson } from "./api/read-private-json";
export function createCollaborationManagementDependencies(
  database: Parameters<typeof createMembershipService>[0] &
    Parameters<typeof createCollaborativeItemService>[0] &
    Parameters<typeof createCollaborativeCollectionService>[0],
  auth: Parameters<typeof createItemSearchRouteDependencies>[1],
  appOrigin: string,
) {
  return {
    appOrigin,
    collectionEditor: (userId: string, id: string) =>
      createCollaborativeCollectionService(database, userId, id),
    items: (userId: string) => createCollaborativeItemService(database, userId),
    getSession: (headers: Headers) =>
      auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } }),
    members: createMembershipService(database),
    management: createCollaborationManagementService(database),
    audit: createAuditService(database),
  };
}
function mapped(error: unknown): never {
  if (error instanceof CollectionServiceError) {
    const status = error.code.endsWith("NOT_FOUND") ? 404 : 409;
    throw new ApiError(
      error.code,
      status,
      status === 404
        ? "Resource not found"
        : "The collection changed or the hierarchy cannot be edited in this way",
    );
  }
  if (error instanceof ItemServiceError) {
    const status = error.code.endsWith("NOT_FOUND") ? 404 : 409;
    throw new ApiError(
      error.code,
      status,
      status === 404
        ? "Resource not found"
        : "The item changed or cannot be edited in its current state",
    );
  }
  if (error instanceof MembershipError || error instanceof AuditError) {
    const code = error.code,
      status = code.endsWith("_INVALID")
        ? 400
        : code.endsWith("_NOT_FOUND")
          ? 404
          : code.endsWith("_FORBIDDEN") || code.endsWith("_OWNER_REQUIRED")
            ? 403
            : code.endsWith("_UNAVAILABLE")
              ? 503
              : code.endsWith("_INTEGRITY")
                ? 500
                : 409;
    throw new ApiError(
      code,
      status,
      status === 404
        ? "Resource not found"
        : status === 409
          ? "Access changed; refresh the current state"
          : status === 403
            ? "This role does not allow the action"
            : status === 400
              ? "Invalid management request"
              : status === 503
                ? "Management is temporarily unavailable"
                : "An unexpected error occurred",
    );
  }
  return mapItemSearchError(error);
}
export function createCollaborationManagementHandlers(
  dependencies: ReturnType<typeof createCollaborationManagementDependencies>,
) {
  async function actor(request: Request, write = false) {
    const origin = request.headers.get("origin"),
      expected = new URL(dependencies.appOrigin).origin;
    if (write ? origin !== expected : origin !== null && origin !== expected)
      throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
    const session = await dependencies.getSession(request.headers);
    if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
    if (new URL(request.url).hash) throw new MembershipError("MEMBERSHIP_INVALID");
    return { userId: session.user.id };
  }
  async function run(work: () => Promise<unknown>) {
    try {
      return Response.json(await work(), { headers: { "cache-control": "no-store" } });
    } catch (error) {
      return mapped(error);
    }
  }
  function collection(value: string) {
    const parsed = MembershipCollectionIdSchema.safeParse(value);
    if (!parsed.success) throw new MembershipError("MEMBERSHIP_INVALID");
    return parsed.data;
  }
  return {
    UPDATE_SHARED_COLLECTION: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const { changes, ...expected } = CollaborativeCollectionUpdateRequestSchema.parse(
          await readPrivateJson(request),
        );
        return {
          collection: await dependencies
            .collectionEditor(who.userId, collection(id))
            .updateCollection(changes, expected),
        };
      }),
    ),
    CREATE_SHARED_NODE: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const { node, ...expected } = CollaborativeNodeCreateRequestSchema.parse(
          await readPrivateJson(request),
        );
        return {
          node: await dependencies
            .collectionEditor(who.userId, collection(id))
            .createNode(node, expected),
        };
      }),
    ),
    UPDATE_SHARED_NODE: apiRoute((request, id: string, nodeId: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const { changes, ...expected } = CollaborativeNodeUpdateRequestSchema.parse(
          await readPrivateJson(request),
        );
        return {
          node: await dependencies
            .collectionEditor(who.userId, collection(id))
            .updateNode(nodeId, changes, expected),
        };
      }),
    ),
    SHARED_COLLECTIONS: apiRoute((request) =>
      run(async () => {
        const who = await actor(request),
          query = readSearchQueryMap(request, ["afterCollectionId"]);
        return dependencies.management.getSharedCollections(who, query);
      }),
    ),
    WORKSPACE: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request),
          query = readSearchQueryMap(request, ["afterItemId"]);
        return dependencies.management.getWorkspace(who, {
          collectionId: collection(id),
          ...query,
        });
      }),
    ),
    CREATE_SHARED_ITEM: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const body = CollaborativeItemCreateSchema.omit({ collectionId: true })
          .strict()
          .parse(await readPrivateJson(request));
        return {
          item: await dependencies
            .items(who.userId)
            .createItem({ ...body, collectionId: collection(id) }),
        };
      }),
    ),
    UPDATE_SHARED_ITEM: apiRoute((request, id: string, itemId: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const { changes, ...preconditions } = CollaborativeItemUpdateRequestSchema.parse(
          await readPrivateJson(request),
        );
        return {
          item: await dependencies
            .items(who.userId)
            .updateItem(collection(id), itemId, changes, preconditions),
        };
      }),
    ),
    GET_MEMBERS: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request);
        readSearchQueryMap(request, []);
        return dependencies.management.getMemberDirectory(who, collection(id));
      }),
    ),
    MUTATE_MEMBERS: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request, true);
        readSearchQueryMap(request, []);
        const collectionId = collection(id),
          parsed = MembershipManagementMutationSchema.safeParse(await readPrivateJson(request));
        if (!parsed.success) throw new MembershipError("MEMBERSHIP_INVALID");
        const { action, ...input } = parsed.data;
        return action === "CHANGE_ROLE"
          ? dependencies.members.changeRole(who, { ...input, collectionId })
          : action === "REMOVE"
            ? dependencies.members.removeMember(who, { ...input, collectionId })
            : dependencies.members.transferOwnership(who, { ...input, collectionId });
      }),
    ),
    SHARING_SETUP: apiRoute((request, id: string) =>
      run(async () => {
        const who = await actor(request),
          query = readSearchQueryMap(request, ["afterShareId"]);
        return dependencies.management.getSharingSetup(who, {
          collectionId: collection(id),
          ...query,
        });
      }),
    ),
    AUDIT: apiRoute((request) =>
      run(async () => {
        const who = await actor(request),
          query = readSearchQueryMap(request, [
            "resourceType",
            "resourceId",
            "limit",
            "beforeSequence",
          ]),
          input = {
            ...query,
            ...(query.limit !== undefined
              ? { limit: /^[1-9][0-9]*$/.test(query.limit) ? Number(query.limit) : NaN }
              : {}),
          };
        if (query.resourceType === undefined && query.resourceId === undefined)
          return dependencies.management.getAuditOverview(who, input);
        const parsed = AuditResourceQuerySchema.safeParse(input);
        if (!parsed.success) throw new AuditError("AUDIT_INVALID");
        return dependencies.audit.listAuditEventsForResource(who, parsed.data);
      }),
    ),
  };
}
