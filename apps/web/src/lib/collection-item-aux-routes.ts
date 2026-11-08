import {
  CreateCustomFieldDefinitionInputSchema,
  SetCustomFieldValueInputSchema,
} from "@sammlerraum/contracts/custom-fields";
import { ApiError } from "@sammlerraum/contracts/errors";
import {
  SetItemIdentifiersInputSchema,
  SetItemTagsInputSchema,
} from "@sammlerraum/contracts/items";
import {
  AssignItemLocationInputSchema,
  CreateLocationInputSchema,
  MoveLocationInputSchema,
} from "@sammlerraum/contracts/locations";
import { assertAuthorized } from "@sammlerraum/domain/authz/policy";
import { createTrustedActorFacts, type ResourceFacts } from "@sammlerraum/domain/authz/types";

import { apiRoute } from "./api/route-handler";
import {
  asNotFound,
  jsonBody,
  noStore,
  requireSameOrigin,
  requireSession,
} from "./collection-item-routes";

type Session = { user: { id: string } };
type Dependencies = {
  appOrigin: string;
  getSession(headers: Headers): Promise<Session | null>;
  loadCollection(id: string): Promise<{ collection: { id: string }; facts: ResourceFacts }>;
  loadItem(id: string): Promise<{ item: { id: string }; facts: ResourceFacts }>;
  listCustomFields(collectionId: string, ownerId: string): Promise<unknown[]>;
  listLocations(ownerId: string): Promise<unknown[]>;
  createCustomFieldService(userId: string): {
    createFieldDefinition(input: unknown): Promise<unknown>;
    setFieldValue(itemId: string, fieldId: string, value: unknown): Promise<unknown>;
  };
  createIdentifierService(userId: string): {
    setItemIdentifiers(
      itemId: string,
      input: Array<{ type: string; value: string }>,
    ): Promise<unknown>;
  };
  createTagService(userId: string): {
    setItemTags(itemId: string, input: string[]): Promise<unknown>;
  };
  createLocationService(userId: string): {
    createLocation(input: unknown): Promise<unknown>;
    moveLocation(locationId: string, parentId: string | null): Promise<void>;
    assignItemLocation(itemId: string, locationId: string | null): Promise<unknown>;
    getLocationContents(locationId: string): Promise<unknown>;
  };
};

function authorizeOwner(
  session: Session,
  action: "collection.edit" | "item.edit",
  facts: ResourceFacts,
): void {
  try {
    assertAuthorized(
      createTrustedActorFacts({ type: "AUTHENTICATED", userId: session.user.id }),
      action,
      facts,
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === "FORBIDDEN") {
      throw new ApiError("NOT_FOUND", 404, "Resource not found");
    }
    throw error;
  }
}

export function createAuxiliaryRouteHandlers(dependencies: Dependencies) {
  async function collectionOwner(request: Request, collectionId: string | undefined) {
    const session = await requireSession(dependencies.getSession, request.headers);
    const loaded = await asNotFound(() => dependencies.loadCollection(collectionId ?? ""));
    authorizeOwner(session, "collection.edit", loaded.facts);
    return { session, loaded };
  }
  async function itemOwner(request: Request, itemId: string | undefined) {
    const session = await requireSession(dependencies.getSession, request.headers);
    const loaded = await asNotFound(() => dependencies.loadItem(itemId ?? ""));
    authorizeOwner(session, "item.edit", loaded.facts);
    return { session, loaded };
  }

  return {
    GET_CUSTOM_FIELDS: apiRoute(async (request, collectionId?: string) => {
      const { session, loaded } = await collectionOwner(request, collectionId);
      return Response.json(
        {
          customFields: await dependencies.listCustomFields(loaded.collection.id, session.user.id),
        },
        { headers: noStore },
      );
    }),
    POST_CUSTOM_FIELD: apiRoute(async (request, collectionId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await collectionOwner(request, collectionId);
      const input = CreateCustomFieldDefinitionInputSchema.parse({
        ...((await jsonBody(request)) as object),
        collectionId: loaded.collection.id,
      });
      return Response.json(
        {
          customField: await asNotFound(() =>
            dependencies.createCustomFieldService(session.user.id).createFieldDefinition(input),
          ),
        },
        { status: 201, headers: noStore },
      );
    }),
    PUT_CUSTOM_FIELD_VALUE: apiRoute(async (request, itemId?: string, fieldId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await itemOwner(request, itemId);
      const input = SetCustomFieldValueInputSchema.parse(await jsonBody(request));
      return Response.json(
        {
          customFieldValue: await asNotFound(() =>
            dependencies
              .createCustomFieldService(session.user.id)
              .setFieldValue(loaded.item.id, fieldId ?? "", input.value),
          ),
        },
        { headers: noStore },
      );
    }),
    PUT_IDENTIFIERS: apiRoute(async (request, itemId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await itemOwner(request, itemId);
      const input = SetItemIdentifiersInputSchema.parse(await jsonBody(request));
      return Response.json(
        {
          identifiers: await asNotFound(() =>
            dependencies
              .createIdentifierService(session.user.id)
              .setItemIdentifiers(loaded.item.id, input.identifiers),
          ),
        },
        { headers: noStore },
      );
    }),
    PUT_TAGS: apiRoute(async (request, itemId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await itemOwner(request, itemId);
      const input = SetItemTagsInputSchema.parse(await jsonBody(request));
      return Response.json(
        {
          tags: await asNotFound(() =>
            dependencies.createTagService(session.user.id).setItemTags(loaded.item.id, input.tags),
          ),
        },
        { headers: noStore },
      );
    }),
    GET_LOCATIONS: apiRoute(async (request) => {
      const session = await requireSession(dependencies.getSession, request.headers);
      return Response.json(
        { locations: await dependencies.listLocations(session.user.id) },
        { headers: noStore },
      );
    }),
    POST_LOCATION: apiRoute(async (request) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const session = await requireSession(dependencies.getSession, request.headers);
      const input = CreateLocationInputSchema.parse(await jsonBody(request));
      return Response.json(
        {
          location: await asNotFound(() =>
            dependencies.createLocationService(session.user.id).createLocation(input),
          ),
        },
        { status: 201, headers: noStore },
      );
    }),
    GET_LOCATION: apiRoute(async (request, locationId?: string) => {
      const session = await requireSession(dependencies.getSession, request.headers);
      return Response.json(
        {
          contents: await asNotFound(() =>
            dependencies
              .createLocationService(session.user.id)
              .getLocationContents(locationId ?? ""),
          ),
        },
        { headers: noStore },
      );
    }),
    PATCH_LOCATION: apiRoute(async (request, locationId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const session = await requireSession(dependencies.getSession, request.headers);
      const input = MoveLocationInputSchema.parse(await jsonBody(request));
      await asNotFound(() =>
        dependencies
          .createLocationService(session.user.id)
          .moveLocation(locationId ?? "", input.parentId),
      );
      return new Response(null, { status: 204, headers: noStore });
    }),
    PUT_ITEM_LOCATION: apiRoute(async (request, itemId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await itemOwner(request, itemId);
      const input = AssignItemLocationInputSchema.parse(await jsonBody(request));
      return Response.json(
        {
          movement: await asNotFound(() =>
            dependencies
              .createLocationService(session.user.id)
              .assignItemLocation(loaded.item.id, input.locationId),
          ),
        },
        { headers: noStore },
      );
    }),
  };
}
