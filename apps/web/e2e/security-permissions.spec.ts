import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { credentialRateLimitFixture } from "./support/credential-rate-limit-fixture";
import {
  permissionMatrix,
  permissionRoles,
  type PermissionRole,
  type PermissionResource,
} from "../../../packages/testing/src/permission-fixtures";
const enabled = process.env.RUN_SECURITY_E2E === "1";
const origin = "http://localhost:3000",
  url = process.env.DATABASE_URL ?? "";
if (enabled && (!new URL(url).pathname.endsWith("_test") || process.env.NODE_ENV === "production"))
  throw Error("Owned security test database required");
const db = enabled ? createPrismaClient(url) : undefined;
const ids = Object.fromEntries(
  permissionRoles.filter((role) => role !== "anonymous").map((role) => [role, randomUUID()]),
) as Record<Exclude<PermissionRole, "anonymous">, string>;
const clients = new Map<PermissionRole, APIRequestContext>();
const addresses: Awaited<ReturnType<typeof credentialRateLimitFixture>>[] = [];
const keys: string[] = [];
const privateNote = "matrix-private-note-never-public",
  privateLocation = "matrix-private-storage-never-public";
let collectionId: string, itemId: string, documentId: string, locationId: string;
let storage: LocalPersistentStorage;
const documentBytes = Buffer.from("%PDF-1.4\nOwned private permission witness\n%%EOF");
const actor = (role: PermissionRole) => clients.get(role)!;
test.describe("compiled V1 permission matrix", () => {
  test.skip(!enabled, "Dedicated guarded real-cookie permission run");
  test.beforeAll(async ({ playwright }) => {
    const [guard] = await db!.$queryRaw<
      { name: string; major: number }[]
    >`SELECT current_database() AS name,current_setting('server_version_num')::integer/10000 AS major`;
    if (!guard?.name.endsWith("_test") || guard.major !== 17)
      throw Error("Owned PostgreSQL17 required");
    await appendFile(
      resolve(
        process.cwd(),
        "../../.superpowers/sdd/2026-09-19-13-integration-hardening-release/owned-matrix-fixtures.jsonl",
      ),
      JSON.stringify({ ids: Object.values(ids), stage: "before-seed" }) + "\n",
    );
    storage = new LocalPersistentStorage(process.env.UPLOADS_DIR!);
    const password = "owned-security-cookie-fixture-only",
      hash = await hashPassword(password);
    for (const role of permissionRoles) {
      const context = await playwright.request.newContext({
        baseURL: origin,
        extraHTTPHeaders: { origin },
      });
      clients.set(role, context);
      if (role === "anonymous") continue;
      const id = ids[role];
      await db!.user.create({
        data: {
          id,
          name: `Owned ${role} fixture`,
          email: `${id}@example.invalid`,
          emailVerified: true,
          profile: {
            create: {
              handle: `m_${id.replaceAll("-", "").slice(0, 20)}`,
              displayName: `Owned ${role}`,
            },
          },
          accounts: {
            create: { id: randomUUID(), accountId: id, providerId: "credential", password: hash },
          },
        },
      });
      const address = await credentialRateLimitFixture(db!);
      addresses.push(address);
      const response = await context.post("/api/auth/sign-in/email", {
        headers: { "x-forwarded-for": address.ip },
        data: { email: `${id}@example.invalid`, password },
      });
      expect(response.status(), `actual ${role} sign-in`).toBe(200);
    }
    const collection = await db!.collection.create({
      data: { ownerId: ids.owner, name: "Permission matrix collection", visibility: "PUBLIC" },
    });
    collectionId = collection.id;
    const parent = await db!.collectionNode.create({
      data: { collectionId, name: "Private ancestor", visibility: "PRIVATE" },
    });
    const child = await db!.collectionNode.create({
      data: { collectionId, parentId: parent.id, name: "Public child", visibility: "PUBLIC" },
    });
    const location = await db!.storageLocation.create({
      data: {
        ownerId: ids.owner,
        name: privateLocation,
        type: "ROOM",
        qrToken: randomBytes(32).toString("base64url"),
      },
    });
    locationId = location.id;
    const item = await db!.collectibleItem.create({
      data: {
        ownerId: ids.owner,
        collectionId,
        nodeId: child.id,
        title: "Owned matrix item",
        visibility: "PUBLIC",
        privateNotes: privateNote,
        storageLocationId: locationId,
      },
    });
    itemId = item.id;
    await db!.collectionMember.createMany({
      data: ["admin", "editor", "viewer"].map((role) => ({
        collectionId,
        userId: ids[role as "admin" | "editor" | "viewer"],
        role: role.toUpperCase() as "ADMIN" | "EDITOR" | "VIEWER",
      })),
    });
    await db!.applicationRoleGrant.create({
      data: {
        userId: ids.moderator,
        role: "MODERATOR",
        grantedBy: "owned-security-fixture",
        reason: "Owned disposable permission matrix",
      },
    });
    await db!.userBlock.create({ data: { blockerId: ids.owner, blockedId: ids.blocked } });
    await db!
      .$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${ids.owner},'stripe_test',${"cus_" + randomUUID()})`;
    await db!
      .$executeRaw`INSERT INTO "BillingSubscription" (id,"subjectId",provider,"providerSubscriptionId","planEligible",status,"currentPeriodStart","currentPeriodEnd","providerUpdatedAt") VALUES (${randomUUID()}::uuid,${ids.owner},'stripe_test',${"sub_" + randomUUID()},true,'ACTIVE',${new Date(Date.now() - 1000)},${new Date(Date.now() + 3600000)},CURRENT_TIMESTAMP)`;
    const key = "originals/security-" + randomUUID();
    keys.push(key);
    const asset = await db!.mediaAsset.create({
      data: {
        ownerId: ids.owner,
        kind: "DOCUMENT",
        status: "READY",
        storageKey: key,
        mimeType: "application/pdf",
        byteSize: BigInt(documentBytes.length),
        checksumSha256: createHash("sha256").update(documentBytes).digest("hex"),
        originalFileName: "owned-private.pdf",
      },
    });
    documentId = asset.id;
    await db!.documentLink.create({
      data: {
        ownerId: ids.owner,
        itemId,
        assetId: documentId,
        category: "PURCHASE_RECEIPT",
        visibility: "PRIVATE",
        position: 0,
      },
    });
    await storage.put(key, documentBytes);
  });
  test.afterAll(async () => {
    for (const context of clients.values()) await context.dispose();
    if (db) {
      for (const address of addresses) await address.cleanup();
      await db.collection.deleteMany({ where: { ownerId: { in: Object.values(ids) } } });
      await db.mediaAsset.deleteMany({ where: { ownerId: { in: Object.values(ids) } } });
      await db.applicationRoleGrant.deleteMany({
        where: { userId: { in: Object.values(ids) }, grantedBy: "owned-security-fixture" },
      });
      await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
      await db.$disconnect();
    }
    if (storage) for (const key of keys) await storage.delete(key);
  });
  async function execute(role: PermissionRole, resource: PermissionResource) {
    const request = actor(role);
    switch (resource) {
      case "public-child-private-ancestor":
        return request.get(`/api/v1/items/${itemId}`);
      case "workspace":
        return request.get(`/api/v1/collections/${collectionId}/workspace`);
      case "create-workspace-item":
        return request.post(`/api/v1/collections/${collectionId}/workspace/items`, {
          data: { title: `Allowed ${role} matrix addition` },
        });
      case "private-document":
        return request.get(`/api/v1/media/${documentId}/original`);
      case "private-location":
        return request.get(`/api/v1/locations/${locationId}`);
      case "audit":
        return request.get(`/api/v1/audit?resourceType=COLLECTION&resourceId=${collectionId}`);
      case "insurance":
        return request.get(`/api/v1/insurance?kind=ITEM&id=${itemId}`);
      case "moderation":
        return request.get("/api/v1/moderation/reports");
      case "premium-export":
        return request.post("/api/v1/exports", {
          data: { scope: { kind: "ALL" }, locale: "en", format: "XLSX" },
        });
      case "advanced-filter":
        return request.post("/api/v1/search/items", {
          data: {
            f: JSON.stringify({
              version: 1,
              root: { kind: "acquisitionDate", test: { op: "missing" } },
            }),
          },
        });
    }
  }
  for (const scenario of permissionMatrix) {
    test(`${scenario.role}: ${scenario.resource}`, async () => {
      const response = await execute(scenario.role, scenario.resource);
      expect(response.status()).toBe(scenario.status);
      if (scenario.resource === "create-workspace-item")
        expect(
          await db!.collectibleItem.count({
            where: { collectionId, title: `Allowed ${scenario.role} matrix addition` },
          }),
        ).toBe(scenario.status === 200 ? 1 : 0);
      if (scenario.resource === "premium-export" && scenario.role !== "anonymous")
        expect(await db!.exportJob.count({ where: { ownerId: ids[scenario.role] } })).toBe(
          scenario.status === 202 ? 1 : 0,
        );
      if (scenario.resource === "private-document" && scenario.status === 200) {
        expect(await response.body()).toEqual(documentBytes);
        expect(response.headers()["cache-control"]).toContain("no-store");
      } else {
        const text = await response.text();
        if (scenario.role !== "owner") {
          expect(text).not.toContain(privateNote);
          expect(text).not.toContain(privateLocation);
          expect(text).not.toContain("owned-private.pdf");
        }
        if (scenario.status >= 400) {
          const body = JSON.parse(text);
          expect(typeof body.error.code).toBe("string");
          expect(text).not.toContain("Owned matrix item");
          if (scenario.resource === "premium-export" || scenario.resource === "advanced-filter")
            expect(body.error.code).toBe(
              scenario.role === "anonymous" ? "UNAUTHORIZED" : "PREMIUM_REQUIRED",
            );
        }
        expect(response.headers()["cache-control"]).toContain("no-store");
      }
    });
  }
  async function makeRecipientShare() {
    const collection = await db!.collection.findUniqueOrThrow({ where: { id: collectionId } });
    const response = await actor("owner").post("/api/v1/shares", {
      data: {
        target: { kind: "ITEM", id: itemId },
        recipient: { kind: "USER", userId: ids.shared },
        expectedRevision: collection.collaborationRevision,
        permissions: { readOnly: true },
        expiresInSeconds: 60,
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as { share: { id: string } };
  }
  test("recipient-only share hides sensitive fields and never becomes membership", async () => {
    const created = await makeRecipientShare();
    const response = await actor("shared").post("/api/v1/shares/resolve", {
      data: { shareId: created.share.id },
    });
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain("Owned matrix item");
    expect(text).not.toMatch(/matrix-private|owned-private.pdf|storageKey|tokenHash/);
    expect(
      (
        await actor("editor").post("/api/v1/shares/resolve", {
          data: { shareId: created.share.id },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await actor("shared").get(`/api/v1/collections/${collectionId}/workspace`)).status(),
    ).toBe(404);
  });
  test("actual share revocation invalidates the recipient immediately", async () => {
    const created = await makeRecipientShare();
    const before = await db!.collectionShare.findUniqueOrThrow({ where: { id: created.share.id } });
    expect(
      (
        await actor("shared").post("/api/v1/shares/resolve", { data: { shareId: before.id } })
      ).status(),
    ).toBe(200);
    const revoke = await actor("owner").post(`/api/v1/shares/${before.id}/revoke`, {
      data: { expectedRevision: before.revision },
    });
    expect(revoke.status()).toBe(200);
    expect(
      (
        await actor("shared").post("/api/v1/shares/resolve", { data: { shareId: before.id } })
      ).status(),
    ).toBe(410);
  });
  test("expired own fixture share cannot disclose selected items", async () => {
    const share = await db!.collectionShare.create({
      data: {
        id: randomUUID(),
        collectionId,
        creatorUserId: ids.owner,
        targetKind: "ITEM",
        targetId: itemId,
        recipientUserId: ids.shared,
        permissions: { readOnly: true },
        createdAt: new Date(Date.now() - 120000),
        expiresAt: new Date(Date.now() - 60000),
      },
    });
    const response = await actor("shared").post("/api/v1/shares/resolve", {
      data: { shareId: share.id },
    });
    expect(response.status()).toBe(410);
    expect(await response.text()).not.toContain("Owned matrix item");
  });
  test("blocking refuses community interaction while an independent actor can follow", async () => {
    expect(
      (
        await actor("shared").post("/api/v1/community/follows", { data: { userId: ids.owner } })
      ).status(),
    ).toBe(200);
    const blocked = await actor("blocked").post("/api/v1/community/follows", {
      data: { userId: ids.owner },
    });
    expect(blocked.status()).toBe(403);
    expect(
      await db!.userFollow.count({ where: { followerId: ids.blocked, followedId: ids.owner } }),
    ).toBe(0);
  });
});
