import { PublicItemQueryError } from "@sammlerraum/domain/items/item-query";
import { createTrustedResourceFacts } from "@sammlerraum/domain/authz/types";
import { describe, expect, it, vi } from "vitest";

import { createItemRouteHandlers } from "../../../../lib/collection-item-routes";

const itemId = "10000000-0000-4000-8000-000000000001";
const collectionId = "20000000-0000-4000-8000-000000000002";
const ownerId = "owner-user";
const privateItem = {
  id: itemId,
  collectionId,
  nodeId: null,
  title: "Glurak",
  publicDescription: "Public card",
  privateNotes: "paid at the flea market",
  quantity: 1,
  acquisitionType: "PURCHASE" as const,
  acquisitionDate: "2026-09-20",
  purchaseAmountMinor: 12_500,
  purchaseCurrency: "EUR",
  visibility: "PUBLIC" as const,
  tradeStatus: "NOT_FOR_TRADE" as const,
  archivedAt: null,
  disposedAt: null,
};

function itemFacts(owner = ownerId, visibility: "PRIVATE" | "PUBLIC" = "PUBLIC") {
  return createTrustedResourceFacts({
    type: "ITEM",
    ownerId: owner,
    visibility,
    ancestorVisibility: ["PUBLIC"],
    role: null,
    moderation: "VISIBLE",
    interactionBlocked: false,
    commentsEnabled: false,
  });
}

describe("item API", () => {
  it("returns 404 for anonymous access to a public item under a private ancestor", async () => {
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn().mockResolvedValue(null),
      getPublicItem: vi.fn().mockRejectedValue(new PublicItemQueryError()),
      loadItem: vi.fn(),
      createItemService: vi.fn(),
    });

    const response = await handlers.GET_ITEM(
      new Request(`https://sammlerraum.example/api/v1/items/${itemId}`),
      itemId,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("returns private fields and metadata only to the authenticated owner", async () => {
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn().mockResolvedValue({ user: { id: ownerId } }),
      getPublicItem: vi.fn(),
      loadItem: vi.fn().mockResolvedValue({ item: privateItem, facts: itemFacts() }),
      getItemMetadata: vi.fn().mockResolvedValue({ tags: ["Fire"] }),
      createItemService: vi.fn(),
    });

    const response = await handlers.GET_ITEM(
      new Request(`https://sammlerraum.example/api/v1/items/${itemId}`),
      itemId,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      item: privateItem,
      metadata: { tags: ["Fire"] },
    });
  });

  it("returns the same public whitelist to an authenticated non-owner", async () => {
    const publicItem = {
      id: itemId,
      title: "Glurak",
      publicDescription: "Public card",
      quantity: 1,
      tradeStatus: "NOT_FOR_TRADE" as const,
    };
    const getPublicItem = vi.fn().mockResolvedValue(publicItem);
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn().mockResolvedValue({ user: { id: "another-user" } }),
      getPublicItem,
      loadItem: vi.fn().mockResolvedValue({ item: privateItem, facts: itemFacts() }),
      createItemService: vi.fn(),
    });

    const response = await handlers.GET_ITEM(
      new Request(`https://sammlerraum.example/api/v1/items/${itemId}`),
      itemId,
    );

    await expect(response.json()).resolves.toEqual({ item: publicItem });
    expect(getPublicItem).toHaveBeenCalledWith(itemId);
  });

  it("hides a foreign private item on mutation", async () => {
    const updateItem = vi.fn();
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn().mockResolvedValue({ user: { id: ownerId } }),
      getPublicItem: vi.fn(),
      loadItem: vi.fn().mockResolvedValue({
        item: { ...privateItem, visibility: "PRIVATE" },
        facts: itemFacts("foreign-owner", "PRIVATE"),
      }),
      createItemService: vi.fn().mockReturnValue({ updateItem }),
    });

    const response = await handlers.PATCH_ITEM(
      new Request(`https://sammlerraum.example/api/v1/items/${itemId}`, {
        method: "PATCH",
        headers: { origin: "https://sammlerraum.example", "content-type": "application/json" },
        body: JSON.stringify({ title: "stolen" }),
      }),
      itemId,
    );

    expect(response.status).toBe(404);
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("rejects cross-origin writes with the standard request-id envelope", async () => {
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn(),
      getPublicItem: vi.fn(),
      loadItem: vi.fn(),
      createItemService: vi.fn(),
    });

    const response = await handlers.PATCH_ITEM(
      new Request(`https://sammlerraum.example/api/v1/items/${itemId}`, {
        method: "PATCH",
        headers: {
          origin: "https://attacker.example",
          "content-type": "application/json",
          "x-request-id": "origin-test",
        },
        body: JSON.stringify({ title: "changed" }),
      }),
      itemId,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("origin-test");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Cross-origin request rejected",
        requestId: "origin-test",
      },
    });
  });

  it("updates an owner item through the domain service", async () => {
    const updated = { ...privateItem, title: "Charizard" };
    const updateItem = vi.fn().mockResolvedValue(updated);
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn().mockResolvedValue({ user: { id: ownerId } }),
      getPublicItem: vi.fn(),
      loadItem: vi.fn().mockResolvedValue({ item: privateItem, facts: itemFacts() }),
      createItemService: vi.fn().mockReturnValue({ updateItem }),
    });

    const response = await handlers.PATCH_ITEM(
      new Request(`https://sammlerraum.example/api/v1/items/${itemId}`, {
        method: "PATCH",
        headers: { origin: "https://sammlerraum.example", "content-type": "application/json" },
        body: JSON.stringify({ title: "Charizard" }),
      }),
      itemId,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(updateItem).toHaveBeenCalledWith(itemId, { title: "Charizard" });
    await expect(response.json()).resolves.toEqual({ item: updated });
  });

  it.each([
    ["title", { title: "bad\u0000title" }],
    ["public description", { title: "Valid", publicDescription: "bad\u0000description" }],
    ["private notes", { title: "Valid", privateNotes: "bad\u0000notes" }],
  ])("rejects NUL in item %s before persistence", async (_label, invalidFields) => {
    const createItem = vi.fn();
    const loadCollection = vi.fn();
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn().mockResolvedValue({ user: { id: ownerId } }),
      getPublicItem: vi.fn(),
      loadItem: vi.fn(),
      loadCollection,
      createItemService: vi.fn().mockReturnValue({ createItem }),
    });

    const response = await handlers.POST_ITEM(
      new Request("https://sammlerraum.example/api/v1/items", {
        method: "POST",
        headers: {
          origin: "https://sammlerraum.example",
          "content-type": "application/json",
          "x-request-id": "item-nul-request",
        },
        body: JSON.stringify({ collectionId, ...invalidFields }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("item-nul-request");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", requestId: "item-nul-request" },
    });
    expect(loadCollection).not.toHaveBeenCalled();
    expect(createItem).not.toHaveBeenCalled();
  });

  it("preserves legitimate newlines in item descriptions and notes", async () => {
    const created = {
      ...privateItem,
      title: "Multiline item",
      publicDescription: "Line one\nLine two",
      privateNotes: "Private one\nPrivate two",
    };
    const createItem = vi.fn().mockResolvedValue(created);
    const handlers = createItemRouteHandlers({
      appOrigin: "https://sammlerraum.example",
      getSession: vi.fn().mockResolvedValue({ user: { id: ownerId } }),
      getPublicItem: vi.fn(),
      loadItem: vi.fn(),
      loadCollection: vi.fn().mockResolvedValue({
        collection: { id: collectionId, name: "Cards", visibility: "PRIVATE" },
        facts: createTrustedResourceFacts({
          type: "COLLECTION",
          ownerId,
          visibility: "PRIVATE",
          ancestorVisibility: [],
          role: null,
          moderation: "VISIBLE",
          interactionBlocked: false,
        }),
      }),
      createItemService: vi.fn().mockReturnValue({ createItem }),
    });

    const response = await handlers.POST_ITEM(
      new Request("https://sammlerraum.example/api/v1/items", {
        method: "POST",
        headers: {
          origin: "https://sammlerraum.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          collectionId,
          title: "Multiline item",
          publicDescription: "Line one\nLine two",
          privateNotes: "Private one\nPrivate two",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        publicDescription: "Line one\nLine two",
        privateNotes: "Private one\nPrivate two",
      }),
    );
  });
});
