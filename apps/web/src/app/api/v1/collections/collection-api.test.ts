import { createTrustedResourceFacts } from "@sammlerraum/domain/authz/types";
import { describe, expect, it, vi } from "vitest";

import { createCollectionRouteHandlers } from "../../../../lib/collection-item-routes";

const collection = {
  id: "20000000-0000-4000-8000-000000000002",
  name: "Pokémon",
  visibility: "PUBLIC" as const,
};
const ownerId = "owner-user";
const facts = createTrustedResourceFacts({
  type: "COLLECTION",
  ownerId,
  visibility: "PUBLIC",
  ancestorVisibility: [],
  role: null,
  moderation: "VISIBLE",
  interactionBlocked: false,
});

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    appOrigin: "https://sammlerraum.example",
    getSession: vi.fn().mockResolvedValue(null),
    loadCollection: vi.fn().mockResolvedValue({ collection, facts }),
    loadNode: vi.fn(),
    listCollections: vi.fn().mockResolvedValue([collection]),
    listNodes: vi.fn(),
    createCollectionService: vi.fn(),
    ...overrides,
  };
}

describe("collection API", () => {
  it("lists only the already-whitelisted public collection DTO for anonymous users", async () => {
    const handlers = createCollectionRouteHandlers(dependencies());
    const response = await handlers.GET_COLLECTIONS(
      new Request("https://sammlerraum.example/api/v1/collections"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ collections: [collection] });
  });

  it("does not expose children, counts, notes, or locations from public by-id reads", async () => {
    const handlers = createCollectionRouteHandlers(dependencies());
    const response = await handlers.GET_COLLECTION(
      new Request(`https://sammlerraum.example/api/v1/collections/${collection.id}`),
      collection.id,
    );
    await expect(response.json()).resolves.toEqual({ collection });
  });

  it("soft-deletes an owner collection through the domain service", async () => {
    const deleteCollection = vi.fn().mockResolvedValue(undefined);
    const handlers = createCollectionRouteHandlers(
      dependencies({
        getSession: vi.fn().mockResolvedValue({ user: { id: ownerId } }),
        createCollectionService: vi.fn().mockReturnValue({ deleteCollection }),
      }),
    );
    const response = await handlers.DELETE_COLLECTION(
      new Request(`https://sammlerraum.example/api/v1/collections/${collection.id}`, {
        method: "DELETE",
        headers: { origin: "https://sammlerraum.example" },
      }),
      collection.id,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deleteCollection).toHaveBeenCalledWith(collection.id);
  });

  it.each([
    ["collection", "POST_COLLECTION", { name: "bad\u0000name" }],
    ["node", "POST_NODE", { name: "bad\u0000name" }],
  ] as const)("rejects a NUL in a %s name before persistence", async (_kind, operation, body) => {
    const createCollection = vi.fn();
    const createCollectionNode = vi.fn();
    const handlers = createCollectionRouteHandlers(
      dependencies({
        getSession: vi.fn().mockResolvedValue({ user: { id: ownerId } }),
        createCollectionService: vi.fn().mockReturnValue({
          createCollection,
          createCollectionNode,
        }),
      }),
    );
    const request = new Request(
      operation === "POST_COLLECTION"
        ? "https://sammlerraum.example/api/v1/collections"
        : `https://sammlerraum.example/api/v1/collections/${collection.id}/nodes`,
      {
        method: "POST",
        headers: {
          origin: "https://sammlerraum.example",
          "content-type": "application/json",
          "x-request-id": "nul-request",
        },
        body: JSON.stringify(body),
      },
    );

    const response =
      operation === "POST_COLLECTION"
        ? await handlers.POST_COLLECTION(request)
        : await handlers.POST_NODE(request, collection.id);

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("nul-request");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", requestId: "nul-request" },
    });
    expect(createCollection).not.toHaveBeenCalled();
    expect(createCollectionNode).not.toHaveBeenCalled();
  });
});
