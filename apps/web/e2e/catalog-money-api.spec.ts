import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { expect, test } from "@playwright/test";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import {
  CatalogMoneyRevisionResultSchema,
  CatalogMoneyHistoryResultSchema,
} from "@sammlerraum/contracts/catalog-money";
import { z } from "zod";
const enabled = process.env.RUN_AUTH_E2E === "1" && process.env.RUN_CATALOG_MONEY_E2E === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
// Catalog interpretation events are deliberately immutable. Use an owned disposable database,
// never weaken their deletion guard merely to clean a browser fixture.
if (
  enabled &&
  !/^sammlerraum_m4_browser_[0-9]+_test$/u.test(new URL(databaseUrl).pathname.slice(1))
)
  throw Error("Owned disposable M4 browser database required");
const db = enabled ? createTestDatabaseClient() : undefined;
const origin = "http://localhost:3000";
test.afterAll(async () => {
  await db?.$disconnect();
});
test("actual built Next catalog monetary proposal and moderator lifecycle", async ({ page }) => {
  test.skip(!enabled, "Requires owned guarded browser database");
  const actor = randomUUID(),
    email = `${actor}@example.invalid`,
    password = "synthetic-browser-catalog-fixture";
  await db!.user.create({
    data: {
      id: actor,
      name: "Synthetic browser reviewer",
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: actor,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  await db!.applicationRoleGrant.create({
    data: {
      userId: actor,
      role: "MODERATOR",
      grantedBy: "synthetic fixture",
      reason: "Actual Next route verification",
    },
  });
  const category = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
    key: `browser_money_${actor.replaceAll("-", "")}`,
    labels: { de: "Test", en: "Test" },
    definitions: [{ key: "price", type: "MONEY", labels: { de: "Preis", en: "Price" } }],
  });
  const definitionId = category.definitions[0]!.id;
  const signed = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin, "x-forwarded-for": "198.18.246.15" },
    data: { email, password },
  });
  expect(signed.status()).toBe(200);
  const proposal = await page.request.post("/api/v1/catalog/money-proposals", {
    headers: { origin },
    data: {
      proposal: {
        targetEntryId: null,
        baseRevision: null,
        summary: "Explicit actual Next route test",
        patch: {
          kind: "CREATE_ENTRY",
          input: {
            categoryTemplateId: category.id,
            text: { language: "en", title: "Actual built finance reference" },
            attributes: [{ definitionId, value: { amountMinor: 100, currency: "AFN" } }],
          },
        },
      },
      money: {
        schemaVersion: 1,
        intents: [
          {
            target: "ENTRY",
            definitionId,
            intent: {
              op: "NEW",
              authoring: {
                kind: "DECIMAL",
                profileId: "legacy-money-iso-2026-09-17-v1",
                currency: "AFN",
                decimal: "1",
              },
            },
          },
        ],
      },
    },
  });
  expect(proposal.status()).toBe(201);
  expect(proposal.headers()["cache-control"]).toBe("no-store");
  expect(proposal.headers()["x-request-id"]).toBeTruthy();
  const submitted = z
    .object({ proposal: z.object({ id: z.string(), state: z.literal("PENDING") }) })
    .parse(await proposal.json());
  const decision = await page.request.post(
    `/api/v1/catalog/proposals/${submitted.proposal.id}/decision`,
    {
      headers: { origin },
      data: { decision: "APPROVE", reason: "Checked actual pinned authoring" },
    },
  );
  expect(decision.status()).toBe(200);
  const approved = z
    .object({ proposal: z.object({ resultEntryId: z.string(), resultRevision: z.number() }) })
    .parse(await decision.json());
  const base = `/api/v1/catalog/entries/${approved.proposal.resultEntryId}/revisions/${approved.proposal.resultRevision}/money`;
  const read = await page.request.get(base);
  expect(read.status()).toBe(200);
  const authored = CatalogMoneyRevisionResultSchema.parse(await read.json());
  expect(authored.money[0]!.interpretation).toMatchObject({ kind: "INTERPRETED", decimal: "1.00" });
  const classified = await page.request.post(`${base}/classifications`, {
    headers: { origin },
    data: {
      schemaVersion: 1,
      target: { kind: "ENTRY" },
      definitionId,
      input: {
        expectedFactToken: authored.money[0]!.factToken,
        exponent: 0,
        unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
        evidence: {
          category: "OPERATOR_VERIFIED_RECORD",
          reason: "Private browser evidence",
          reference: "PRIVATE-BROWSER-RECORD",
        },
      },
    },
  });
  expect(classified.status()).toBe(201);
  const current = await page.request.get(base);
  const view = CatalogMoneyRevisionResultSchema.parse(await current.json());
  expect(view.money[0]!.interpretation).toMatchObject({ kind: "INTERPRETED", decimal: "100" });
  expect(JSON.stringify(view)).not.toContain("PRIVATE-BROWSER-RECORD");
  const history = await page.request.get(
    `${base}/classifications?target=ENTRY&definitionId=${definitionId}&limit=1`,
  );
  expect(history.status()).toBe(200);
  const audit = CatalogMoneyHistoryResultSchema.parse(await history.json());
  expect(audit.events[0]!.reason).toBe("Private browser evidence");
  expect(audit.nextCursor).not.toBeNull();
  const event = audit.events[0]!;
  const revoked = await page.request.post(`${base}/revocations`, {
    headers: { origin },
    data: {
      schemaVersion: 1,
      target: { kind: "ENTRY" },
      definitionId,
      input: {
        assertionId: event.id,
        expectedAssertionToken: event.expectedAssertionToken,
        reason: "Native browser withdrawal",
      },
    },
  });
  expect(revoked.status()).toBe(200);
  expect(
    CatalogMoneyRevisionResultSchema.parse(await (await page.request.get(base)).json()).money[0]!
      .interpretation,
  ).toMatchObject({ kind: "UNKNOWN", reason: "REVOKED" });
  const bad = await page.request.post("/api/v1/catalog/money-proposals", {
    headers: { origin, "content-type": "application/json" },
    data: '{"money":{"op":1,"\\u006fp":2}}',
  });
  expect(bad.status()).toBe(400);
  const signedOut = await page.request.post("/api/auth/sign-out", {
    headers: { origin },
    data: {},
  });
  expect(signedOut.status()).toBe(200);
  expect((await page.request.get(base)).status()).toBe(401);
});
