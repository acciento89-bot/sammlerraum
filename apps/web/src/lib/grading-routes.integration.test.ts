import { randomUUID } from "node:crypto";
import type { Grading } from "@sammlerraum/contracts/grading";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createGradingService } from "@sammlerraum/domain/grading/grading-service";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGradingRouteDependencies, createGradingRouteHandlers } from "./grading-routes";
import { createItemRouteHandlers } from "./collection-item-routes";
import { createManagementRouteDependencies } from "./management-route-dependencies";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const ownerId = `GradingRouteOwner_${randomUUID()}`;
const origin = "https://sammlerraum.example";
let collectionId: string;
let itemId: string;
const session = vi.fn(
  async (_input: unknown): Promise<{ user: { id: string } } | null> => ({ user: { id: ownerId } }),
);
const auth = { api: { getSession: session } };
const handlers = () =>
  createGradingRouteHandlers(createGradingRouteDependencies(db!, auth, origin));
const request = (method = "GET", body?: unknown, requestOrigin: string | null = origin) =>
  new Request(`${origin}/api/v1/items/${itemId}/gradings`, {
    method,
    headers: {
      ...(requestOrigin === null ? {} : { origin: requestOrigin }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const service = () => createGradingService(db!, ownerId);

describe.runIf(enabled)("grading routes PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: {
        id: ownerId,
        name: "Grading routes",
        email: `${ownerId}@example.invalid`,
        emailVerified: true,
      },
    });
    collectionId = (
      await db!.collection.create({
        data: { ownerId, name: "Grading routes", visibility: "PUBLIC" },
      })
    ).id;
  });
  beforeEach(async () => {
    session.mockReset();
    session.mockResolvedValue({ user: { id: ownerId } });
    itemId = (
      await createItemService(db!, ownerId).createItem({
        collectionId,
        title: "Graded card",
        visibility: "PUBLIC",
      })
    ).id;
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: ownerId } });
      await db.$disconnect();
    }
  });

  it("persists owner CRUD through the adapter with full replacement and private no-store DTOs", async () => {
    const api = handlers();
    const created = await api.POST_GRADING(
      request("POST", {
        provider: " PSA ",
        grade: "10",
        certificateNo: "00123",
        comparableValue: "10",
        comparableScale: "Authored 1 to 10",
        source: "Private receipt",
        verificationUrl: "https://example.invalid/00123",
      }),
      itemId.toUpperCase(),
    );
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const body = (await created.json()) as { grading: Grading };
    const id = body.grading.id as string;
    expect(body).toMatchObject({
      grading: {
        itemId,
        provider: "PSA",
        certificateNo: "00123",
        comparableValue: "10.0000",
        source: "Private receipt",
      },
    });
    expect(body.grading).not.toHaveProperty("ownerId");
    expect(body.grading).not.toHaveProperty("certificateKey");
    expect(await (await api.GET_GRADINGS(request(), itemId)).json()).toMatchObject({
      gradings: [{ id }],
    });
    expect(await (await api.GET_GRADING(request(), itemId, id.toUpperCase())).json()).toEqual(body);
    const replacement = await api.PUT_GRADING(
      request("PUT", { provider: "CGC", grade: "9.5" }),
      itemId,
      id,
    );
    expect(replacement.status).toBe(200);
    expect(await replacement.json()).toMatchObject({
      grading: {
        id,
        provider: "CGC",
        grade: "9.5",
        certificateNo: null,
        comparableValue: null,
        comparableScale: null,
        source: null,
        verificationUrl: null,
      },
    });
    const removed = await api.DELETE_GRADING(request("DELETE"), itemId, id);
    expect(removed.status).toBe(204);
    expect(removed.headers.get("cache-control")).toBe("no-store");
    expect((await api.GET_GRADING(request(), itemId, id)).status).toBe(404);
    expect(await service().listGradings(itemId)).toEqual([]);
    expect(session).toHaveBeenLastCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
  });
  it("persists multiline source through protected service writes and private DTO reads", async () => {
    const source = "Café receipt\r\nSecond\tline\rThird\nlast";
    const created = await handlers().POST_GRADING(
      request("POST", { provider: "Multiline", grade: "A", source: `  ${source}  ` }),
      itemId,
    );
    expect(created.status).toBe(201);
    const { grading } = (await created.json()) as { grading: Grading };
    expect(grading.source).toBe(source);
    expect((await db!.grading.findUniqueOrThrow({ where: { id: grading.id } })).source).toBe(
      source,
    );
    expect((await service().getGrading(itemId, grading.id)).source).toBe(source);
    const replacement = "Changed\nreceipt\tentry";
    await service().updateGrading(itemId, grading.id, {
      provider: "Multiline",
      grade: "A",
      source: replacement,
    });
    const read = await handlers().GET_GRADING(request(), itemId, grading.id);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.json()).toMatchObject({ grading: { source: replacement } });
  });
  it("requires fresh authentication and hides foreign, mismatched and invalid resource IDs", async () => {
    const row = await service().addGrading(itemId, {
      provider: "Private",
      grade: "A",
      certificateNo: "private-number",
      source: "Private receipt",
    });
    const other = (
      await createItemService(db!, ownerId).createItem({ collectionId, title: "Other" })
    ).id;
    const api = handlers();
    session.mockResolvedValue(null);
    for (const work of [
      () => api.GET_GRADINGS(request(), itemId),
      () => api.GET_GRADING(request(), itemId, row.id),
      () => api.POST_GRADING(request("POST", { provider: "X", grade: "A" }), itemId),
      () => api.PUT_GRADING(request("PUT", { provider: "X", grade: "A" }), itemId, row.id),
      () => api.DELETE_GRADING(request("DELETE"), itemId, row.id),
    ])
      expect((await work()).status).toBe(401);
    session.mockResolvedValue({ user: { id: "Foreign" } });
    for (const work of [
      () => api.GET_GRADINGS(request(), itemId),
      () => api.GET_GRADING(request(), itemId, row.id),
      () => api.POST_GRADING(request("POST", { provider: "X", grade: "A" }), itemId),
      () => api.PUT_GRADING(request("PUT", { provider: "X", grade: "A" }), itemId, row.id),
      () => api.DELETE_GRADING(request("DELETE"), itemId, row.id),
    ]) {
      const response = await work();
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toMatchObject({ error: { code: "NOT_FOUND", requestId: expect.any(String) } });
      expect(JSON.stringify(body)).not.toContain("private-number");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    session.mockResolvedValue({ user: { id: ownerId } });
    expect((await api.GET_GRADING(request(), other, row.id)).status).toBe(404);
    expect((await api.GET_GRADINGS(request(), "invalid")).status).toBe(404);
    expect((await api.GET_GRADING(request(), itemId, "invalid")).status).toBe(404);
  });
  it("enforces exact Origin on every mutation", async () => {
    const row = await service().addGrading(itemId, { provider: "Origin", grade: "A" });
    const api = handlers();
    for (const value of [null, "https://evil.example", `${origin}/`, `${origin}.evil.example`]) {
      expect(
        (await api.POST_GRADING(request("POST", { provider: "X", grade: "B" }, value), itemId))
          .status,
      ).toBe(403);
      expect(
        (
          await api.PUT_GRADING(
            request("PUT", { provider: "X", grade: "B" }, value),
            itemId,
            row.id,
          )
        ).status,
      ).toBe(403);
      expect(
        (await api.DELETE_GRADING(request("DELETE", undefined, value), itemId, row.id)).status,
      ).toBe(403);
    }
    expect((await service().getGrading(itemId, row.id)).grade).toBe("A");
  });
  it("rejects strict malformed facts and never accepts trusted verification or cross-scale numbers", async () => {
    const row = await service().addGrading(itemId, { provider: "Strict", grade: "A" });
    const api = handlers();
    for (const body of [
      { provider: "X" },
      { provider: "X", grade: "A", ownerId },
      { provider: "X", grade: "A", verified: true },
      { provider: "X", grade: "A", comparableValue: 10, comparableScale: "ten" },
      { provider: "X", grade: "A", comparableValue: "1e1", comparableScale: "ten" },
      { provider: "X", grade: "A", comparableScale: "ten" },
      { provider: "X", grade: "A", verificationUrl: "javascript:alert(1)" },
    ]) {
      expect((await api.POST_GRADING(request("POST", body), itemId)).status).toBe(400);
      expect((await api.PUT_GRADING(request("PUT", body), itemId, row.id)).status).toBe(400);
    }
    for (const method of ["POST", "PUT"]) {
      for (const contentType of ["text/plain", "application/json"]) {
        const malformed = new Request(`${origin}/api/v1/items/x/gradings`, {
          method,
          headers: { origin, "content-type": contentType },
          body: "{",
        });
        const response =
          method === "POST"
            ? await api.POST_GRADING(malformed, itemId)
            : await api.PUT_GRADING(malformed, itemId, row.id);
        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    }
    expect((await service().getGrading(itemId, row.id)).grade).toBe("A");
  });
  it("bounds actual UTF-8 streams independently of absent or false Content-Length", async () => {
    const row = await service().addGrading(itemId, { provider: "Body", grade: "A" });
    const api = handlers();
    for (const method of ["POST", "PUT"]) {
      for (const declared of [null, "1"]) {
        const body = new TextEncoder().encode(
          JSON.stringify({ provider: "X", grade: "A", source: "💎".repeat(2100) }),
        );
        const input = new Request(`${origin}/api/v1/items/x/gradings`, {
          method,
          headers: {
            origin,
            "content-type": "application/json",
            ...(declared === null ? {} : { "content-length": declared }),
          },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(body.slice(0, 4000));
              controller.enqueue(body.slice(4000));
              controller.close();
            },
          }),
          duplex: "half",
        } as RequestInit);
        expect(
          (method === "POST"
            ? await api.POST_GRADING(input, itemId)
            : await api.PUT_GRADING(input, itemId, row.id)
          ).status,
        ).toBe(413);
      }
    }
    const invalidUtf8 = new Request(`${origin}/api/v1/items/x/gradings`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: new Uint8Array([0xff]),
    });
    expect((await api.POST_GRADING(invalidUtf8, itemId)).status).toBe(400);
  });
  it("returns stable conflicts for duplicate certificates, lifecycle and shared item quantity writes", async () => {
    const api = handlers();
    const row = await service().addGrading(itemId, {
      provider: "Conflict",
      grade: "A",
      certificateNo: "duplicate",
    });
    const duplicate = await api.POST_GRADING(
      request("POST", { provider: "conflict", grade: "B", certificateNo: "duplicate" }),
      itemId,
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      error: { code: "GRADING_CERTIFICATE_CONFLICT" },
    });
    const itemApi = createItemRouteHandlers(createManagementRouteDependencies(db!, auth, origin));
    expect((await itemApi.PATCH_ITEM(request("PATCH", { quantity: 2 }), itemId)).status).toBe(409);
    expect((await itemApi.SPLIT_ITEM(request("POST", { quantity: 1 }), itemId)).status).toBe(409);
    const bulk = (
      await createItemService(db!, ownerId).createItem({ collectionId, title: "Bulk", quantity: 2 })
    ).id;
    const quantity = await api.POST_GRADING(
      request("POST", { provider: "Bulk", grade: "A" }),
      bulk,
    );
    expect(quantity.status).toBe(409);
    expect(await quantity.json()).toMatchObject({
      error: { code: "GRADING_REQUIRES_SINGLE_ITEM" },
    });
    await createItemService(db!, ownerId).archiveItem(itemId);
    expect((await api.GET_GRADING(request(), itemId, row.id)).status).toBe(200);
    for (const work of [
      () => api.POST_GRADING(request("POST", { provider: "X", grade: "B" }), itemId),
      () => api.PUT_GRADING(request("PUT", { provider: "X", grade: "B" }), itemId, row.id),
      () => api.DELETE_GRADING(request("DELETE"), itemId, row.id),
    ])
      expect((await work()).status).toBe(409);
  });
  it("does not leak grading or private provenance through anonymous or other-user public item reads", async () => {
    await service().addGrading(itemId, {
      provider: "Private provider",
      grade: "10",
      certificateNo: "secret-certificate",
      source: "Secret receipt",
    });
    const itemApi = createItemRouteHandlers(createManagementRouteDependencies(db!, auth, origin));
    for (const viewer of [null, { user: { id: "Other viewer" } }]) {
      session.mockResolvedValue(viewer);
      const response = await itemApi.GET_ITEM(request(), itemId);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        item: {
          id: itemId,
          title: "Graded card",
          publicDescription: null,
          quantity: 1,
          tradeStatus: "NOT_FOR_TRADE",
        },
      });
    }
    expect((await handlers().GET_GRADINGS(request(), itemId)).status).toBe(404);
  });
  it("accepts a zero-byte DELETE stream while removing only the requested grading", async () => {
    const row = await service().addGrading(itemId, { provider: "Empty stream", grade: "9" });
    const response = await handlers().DELETE_GRADING(
      new Request(origin, {
        method: "DELETE",
        headers: { origin, "content-length": "0" },
        body: "",
      }),
      itemId,
      row.id,
    );
    expect(response.status).toBe(204);
    expect(await db!.grading.findUnique({ where: { id: row.id } })).toBeNull();
  });
  it("rejects DELETE payloads within the same independent body bound", async () => {
    const row = await service().addGrading(itemId, { provider: "Delete body", grade: "A" });
    const api = handlers();
    expect((await api.DELETE_GRADING(request("DELETE", {}), itemId, row.id)).status).toBe(400);
    expect(
      (await api.DELETE_GRADING(request("DELETE", { padding: "x".repeat(9000) }), itemId, row.id))
        .status,
    ).toBe(413);
    expect((await service().getGrading(itemId, row.id)).grade).toBe("A");
  });
});
