import {
  CreateCollectionInputSchema,
  CreateCollectionNodeInputSchema,
  UpdateCollectionInputSchema,
  UpdateCollectionNodeInputSchema,
  type Collection,
  type CollectionNode,
} from "@sammlerraum/contracts/collections";
import { ApiError } from "@sammlerraum/contracts/errors";
import {
  CreateItemInputSchema,
  SplitItemInputSchema,
  UpdateItemInputSchema,
  type CollectibleItem,
  type PublicItem,
} from "@sammlerraum/contracts/items";
import { assertAuthorized } from "@sammlerraum/domain/authz/policy";
import {
  createTrustedActorFacts,
  type ResourceFacts,
} from "@sammlerraum/domain/authz/types";

import { apiRoute } from "./api/route-handler";

type Session = { user: { id: string } };
type LoadedCollection = { collection: Collection; facts: ResourceFacts };
type LoadedNode = { node: CollectionNode; facts: ResourceFacts };
type LoadedItem = { item: CollectibleItem; facts: ResourceFacts };

const noStore = { "cache-control": "no-store" };

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 400, "Request validation failed");
  }
}

function requireSameOrigin(request: Request, appOrigin: string): void {
  if (request.headers.get("origin") !== new URL(appOrigin).origin) {
    throw new ApiError("FORBIDDEN", 403, "Cross-origin request rejected");
  }
}

async function requireSession(
  getSession: (headers: Headers) => Promise<Session | null>,
  headers: Headers,
): Promise<Session> {
  const session = await getSession(headers);
  if (!session) throw new ApiError("UNAUTHORIZED", 401, "Authentication required");
  return session;
}

function actor(session: Session | null) {
  return session
    ? createTrustedActorFacts({ type: "AUTHENTICATED", userId: session.user.id })
    : createTrustedActorFacts({ type: "ANONYMOUS" });
}

function hiddenAuthorization(
  currentActor: ReturnType<typeof actor>,
  action: "collection.view" | "collection.edit" | "item.view" | "item.edit",
  facts: ResourceFacts,
): void {
  try {
    assertAuthorized(currentActor, action, facts);
  } catch (error) {
    if (error instanceof ApiError && error.code === "FORBIDDEN") {
      throw new ApiError("NOT_FOUND", 404, "Resource not found");
    }
    throw error;
  }
}

async function asNotFound<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (code.includes("NOT_FOUND")) throw new ApiError("NOT_FOUND", 404, "Resource not found");
    if (code.includes("CYCLE") || code.includes("UNCHANGED")) {
      throw new ApiError("CONFLICT", 409, "The requested change conflicts with current state");
    }
    if (code.endsWith("_INVALID") || code === "ITEM_INACTIVE") {
      throw new ApiError("INVALID_STATE", 409, "The requested change is invalid");
    }
    throw error;
  }
}

type CollectionService = {
  createCollection(input: unknown): Promise<Collection>;
  updateCollection(id: string, input: unknown): Promise<Collection>;
  deleteCollection(id: string): Promise<void>;
  createCollectionNode(input: unknown): Promise<CollectionNode>;
  updateCollectionNode(id: string, input: unknown): Promise<CollectionNode>;
};

type CollectionDependencies = {
  appOrigin: string;
  getSession(headers: Headers): Promise<Session | null>;
  loadCollection(id: string): Promise<LoadedCollection>;
  loadNode(id: string): Promise<LoadedNode>;
  listCollections(ownerId: string | null): Promise<Collection[]>;
  listNodes(collectionId: string, ownerId: string): Promise<CollectionNode[]>;
  createCollectionService(userId: string): CollectionService;
};

export function createCollectionRouteHandlers(dependencies: CollectionDependencies) {
  return {
    GET_COLLECTIONS: apiRoute(async (request) => {
      const session = await dependencies.getSession(request.headers);
      return Response.json(
        { collections: await dependencies.listCollections(session?.user.id ?? null) },
        { headers: noStore },
      );
    }),
    POST_COLLECTION: apiRoute(async (request) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const session = await requireSession(dependencies.getSession, request.headers);
      const input = CreateCollectionInputSchema.parse(await jsonBody(request));
      return Response.json(
        { collection: await asNotFound(() => dependencies.createCollectionService(session.user.id).createCollection(input)) },
        { status: 201, headers: noStore },
      );
    }),
    GET_COLLECTION: apiRoute(async (request, collectionId?: string) => {
      const loaded = await asNotFound(() => dependencies.loadCollection(collectionId ?? ""));
      const session = await dependencies.getSession(request.headers);
      hiddenAuthorization(actor(session), "collection.view", loaded.facts);
      return Response.json({ collection: loaded.collection }, { headers: noStore });
    }),
    PATCH_COLLECTION: apiRoute(async (request, collectionId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const session = await requireSession(dependencies.getSession, request.headers);
      const loaded = await asNotFound(() => dependencies.loadCollection(collectionId ?? ""));
      hiddenAuthorization(actor(session), "collection.edit", loaded.facts);
      const input = UpdateCollectionInputSchema.parse(await jsonBody(request));
      return Response.json(
        { collection: await asNotFound(() => dependencies.createCollectionService(session.user.id).updateCollection(loaded.collection.id, input)) },
        { headers: noStore },
      );
    }),
    DELETE_COLLECTION: apiRoute(async (request, collectionId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const session = await requireSession(dependencies.getSession, request.headers);
      const loaded = await asNotFound(() => dependencies.loadCollection(collectionId ?? ""));
      hiddenAuthorization(actor(session), "collection.edit", loaded.facts);
      await asNotFound(() => dependencies.createCollectionService(session.user.id).deleteCollection(loaded.collection.id));
      return new Response(null, { status: 204, headers: noStore });
    }),
    GET_NODES: apiRoute(async (request, collectionId?: string) => {
      const session = await requireSession(dependencies.getSession, request.headers);
      const loaded = await asNotFound(() => dependencies.loadCollection(collectionId ?? ""));
      hiddenAuthorization(actor(session), "collection.edit", loaded.facts);
      return Response.json(
        { nodes: await dependencies.listNodes(loaded.collection.id, session.user.id) },
        { headers: noStore },
      );
    }),
    POST_NODE: apiRoute(async (request, collectionId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const session = await requireSession(dependencies.getSession, request.headers);
      const loaded = await asNotFound(() => dependencies.loadCollection(collectionId ?? ""));
      hiddenAuthorization(actor(session), "collection.edit", loaded.facts);
      const input = CreateCollectionNodeInputSchema.parse({
        ...(await jsonBody(request) as object),
        collectionId: loaded.collection.id,
      });
      return Response.json(
        { node: await asNotFound(() => dependencies.createCollectionService(session.user.id).createCollectionNode(input)) },
        { status: 201, headers: noStore },
      );
    }),
    PATCH_NODE: apiRoute(async (request, nodeId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const session = await requireSession(dependencies.getSession, request.headers);
      const loaded = await asNotFound(() => dependencies.loadNode(nodeId ?? ""));
      hiddenAuthorization(actor(session), "collection.edit", loaded.facts);
      const input = UpdateCollectionNodeInputSchema.parse(await jsonBody(request));
      return Response.json(
        { node: await asNotFound(() => dependencies.createCollectionService(session.user.id).updateCollectionNode(loaded.node.id, input)) },
        { headers: noStore },
      );
    }),
  };
}

type ItemService = {
  createItem(input: unknown): Promise<CollectibleItem>;
  updateItem(id: string, input: unknown): Promise<CollectibleItem>;
  archiveItem(id: string): Promise<CollectibleItem>;
  deleteItem(id: string): Promise<void>;
  splitQuantityItem(id: string, quantity: number): Promise<unknown>;
};

type ItemDependencies = {
  appOrigin: string;
  getSession(headers: Headers): Promise<Session | null>;
  getPublicItem(id: string): Promise<PublicItem>;
  loadItem(id: string): Promise<LoadedItem>;
  loadCollection?: (id: string) => Promise<LoadedCollection>;
  listItems?: (collectionId: string, ownerId: string) => Promise<CollectibleItem[]>;
  getItemMetadata?: (itemId: string, ownerId: string) => Promise<unknown>;
  createItemService(userId: string): ItemService;
};

function required<T>(value: T | undefined): T {
  if (!value) throw new Error("Missing route dependency");
  return value;
}

export function createItemRouteHandlers(dependencies: ItemDependencies) {
  async function ownedItem(request: Request, itemId: string | undefined) {
    const session = await requireSession(dependencies.getSession, request.headers);
    const loaded = await asNotFound(() => dependencies.loadItem(itemId ?? ""));
    hiddenAuthorization(actor(session), "item.edit", loaded.facts);
    return { session, loaded };
  }

  return {
    GET_ITEMS: apiRoute(async (request) => {
      const session = await requireSession(dependencies.getSession, request.headers);
      const collectionId = new URL(request.url).searchParams.get("collectionId");
      if (!collectionId) throw new ApiError("VALIDATION_ERROR", 400, "collectionId is required");
      const loaded = await asNotFound(() => required(dependencies.loadCollection)(collectionId));
      hiddenAuthorization(actor(session), "collection.edit", loaded.facts);
      return Response.json(
        { items: await required(dependencies.listItems)(collectionId, session.user.id) },
        { headers: noStore },
      );
    }),
    POST_ITEM: apiRoute(async (request) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const session = await requireSession(dependencies.getSession, request.headers);
      const input = CreateItemInputSchema.parse(await jsonBody(request));
      const collection = await asNotFound(() => required(dependencies.loadCollection)(input.collectionId));
      hiddenAuthorization(actor(session), "collection.edit", collection.facts);
      return Response.json(
        { item: await asNotFound(() => dependencies.createItemService(session.user.id).createItem(input)) },
        { status: 201, headers: noStore },
      );
    }),
    GET_ITEM: apiRoute(async (request, itemId?: string) => {
      const session = await dependencies.getSession(request.headers);
      if (!session) {
        const item = await asNotFound(() => dependencies.getPublicItem(itemId ?? ""));
        return Response.json({ item }, { headers: noStore });
      }
      const loaded = await asNotFound(() => dependencies.loadItem(itemId ?? ""));
      hiddenAuthorization(actor(session), "item.view", loaded.facts);
      if (session?.user.id === loaded.facts.ownerId) {
        const metadata = dependencies.getItemMetadata
          ? await dependencies.getItemMetadata(loaded.item.id, session.user.id)
          : undefined;
        return Response.json(
          metadata === undefined ? { item: loaded.item } : { item: loaded.item, metadata },
          { headers: noStore },
        );
      }
      const item = await asNotFound(() => dependencies.getPublicItem(loaded.item.id));
      return Response.json({ item }, { headers: noStore });
    }),
    PATCH_ITEM: apiRoute(async (request, itemId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await ownedItem(request, itemId);
      const input = UpdateItemInputSchema.parse(await jsonBody(request));
      return Response.json(
        { item: await asNotFound(() => dependencies.createItemService(session.user.id).updateItem(loaded.item.id, input)) },
        { headers: noStore },
      );
    }),
    DELETE_ITEM: apiRoute(async (request, itemId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await ownedItem(request, itemId);
      await asNotFound(() => dependencies.createItemService(session.user.id).deleteItem(loaded.item.id));
      return new Response(null, { status: 204, headers: noStore });
    }),
    ARCHIVE_ITEM: apiRoute(async (request, itemId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await ownedItem(request, itemId);
      return Response.json(
        { item: await asNotFound(() => dependencies.createItemService(session.user.id).archiveItem(loaded.item.id)) },
        { headers: noStore },
      );
    }),
    SPLIT_ITEM: apiRoute(async (request, itemId?: string) => {
      requireSameOrigin(request, dependencies.appOrigin);
      const { session, loaded } = await ownedItem(request, itemId);
      const input = SplitItemInputSchema.parse(await jsonBody(request));
      return Response.json(
        { result: await asNotFound(() => dependencies.createItemService(session.user.id).splitQuantityItem(loaded.item.id, input.quantity)) },
        { status: 201, headers: noStore },
      );
    }),
  };
}

export { asNotFound, hiddenAuthorization, jsonBody, noStore, requireSameOrigin, requireSession };
