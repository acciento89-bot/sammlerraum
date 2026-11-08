import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { createCollectionService } from "@sammlerraum/domain/collections/collection-service";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createMembershipService } from "@sammlerraum/domain/collaboration/membership-service";
import { createShareService } from "@sammlerraum/domain/sharing/share-service";
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
const copies = {
  de: {
    text: "Titel oder öffentliche Beschreibung",
    apply: "Suche anwenden",
    open: "Suche öffnen",
    add: "Bedingung hinzufügen",
    name: "Name der geteilten Ansicht",
    save: "Ansicht speichern",
    overview: "Übersicht",
    saved: "Die geteilte Ansicht wurde gespeichert.",
    remove: "Entfernen",
    unavailable: "Mindestens eine Bedingung",
    gone: "Der Zugriff auf diesen Bereich ist nicht mehr verfügbar.",
  },
  en: {
    text: "Title or public description",
    apply: "Apply search",
    open: "Open search",
    add: "Add condition",
    name: "Shared view name",
    save: "Save view",
    overview: "Overview",
    saved: "The shared view has been saved.",
    remove: "Remove",
    unavailable: "A condition uses a field",
    gone: "Access to this area is no longer available.",
  },
};
async function fixture() {
  const base = await searchFixture();
  try {
    const collection = await createCollectionService(db!, base.foreignId).createCollection({
      name: "Shared private ceramics",
    });
    const item = await createItemService(db!, base.foreignId).createItem({
      collectionId: collection.id,
      title: "Shared native ceramic",
      publicDescription: "Blue glazed pottery",
      privateNotes: "private-scoped-browser-sentinel",
      quantity: 2,
    });
    return { ...base, sharedCollection: collection.id, sharedItem: item.id };
  } catch (error) {
    await cleanupSearchFixture(base);
    throw error;
  }
}
async function cleanup(f: Awaited<ReturnType<typeof fixture>>) {
  // Delete only these synthetic owners' collections first, letting real FK
  // cascades retire their anchored audit rows before user-identity erasure.
  await db!.collection.deleteMany({ where: { ownerId: { in: [f.ownerId, f.foreignId] } } });
  await cleanupSearchFixture(f);
}
async function signIn(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email: f.email, password: f.password },
        headers: { origin, "x-forwarded-for": f.ip },
      })
    ).status(),
  ).toBe(200);
}
async function capture(page: Page, name: string) {
  const panel = page.getByTestId("scoped-search-panel"),
    box = await panel.boundingBox();
  const input = await panel.locator('input[type="search"]').boundingBox();
  expect(input!.width).toBeGreaterThan(box!.width * 0.7);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  await page.screenshot({
    path: resolve(
      process.cwd(),
      `../../.superpowers/sdd/2026-11-08-shared-search-integration/${name}.png`,
    ),
    fullPage: true,
  });
}
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const) {
  const t = copies[locale];
  test(`${locale}: real member cookie searches saves and summarizes only its selected private collection`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Guarded native cookie database required");
    const f = await fixture();
    try {
      const members = createMembershipService(db!);
      await members.addMember(
        { userId: f.foreignId },
        {
          collectionId: f.sharedCollection,
          userId: f.ownerId,
          role: "VIEWER",
          expectedRevision: 0,
        },
      );
      await signIn(page, f);
      await page.goto(`/${locale}/shared-search?collection=${f.sharedCollection}`);
      const panel = page.getByTestId("scoped-search-panel");
      await expect(panel.locator(".scoped-result-list")).toContainText("Shared native ceramic");
      await expect(panel).not.toContainText("Synthetic untagged card");
      await expect(panel).not.toContainText("private-scoped-browser-sentinel");
      await panel.getByRole("button", { name: t.add, exact: true }).click();
      await expect(
        panel.getByRole("option", {
          name: locale === "de" ? "Ausgewählte Sammlung" : "Selected collection",
          exact: true,
        }),
      ).toHaveCount(1);
      await panel.getByRole("button", { name: t.apply, exact: true }).click();
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(1);
      await panel.getByLabel(t.name, { exact: true }).fill(`Native member ${locale}`);
      await panel.getByRole("button", { name: t.save, exact: true }).click();
      await expect(panel.getByText(t.saved, { exact: true })).toBeVisible();
      const stored = await db!.smartCollection.findFirstOrThrow({
        where: { ownerId: f.ownerId, name: `Native member ${locale}` },
      });
      expect(stored.filterVersion).toBe(1);
      expect(stored.definition).toMatchObject({
        version: 2,
        scope: { kind: "MEMBER_COLLECTION", collectionId: f.sharedCollection },
      });
      await panel.getByRole("button", { name: t.overview, exact: true }).click();
      await expect(panel.getByRole("region", { name: t.overview })).toContainText(
        locale === "de" ? "1 Objekt · 2 Stück" : "1 item · 2 units",
      );
      await capture(page, `scoped-member-${locale}-${info.project.name}`);
      await members.removeMember(
        { userId: f.foreignId },
        { collectionId: f.sharedCollection, userId: f.ownerId, expectedRevision: 1 },
      );
      await panel.getByRole("button", { name: t.apply, exact: true }).click();
      await expect(panel.getByRole("alert")).toContainText(t.gone);
      await expect(panel.getByRole("region", { name: t.overview })).toHaveCount(0);
      await db!.session.deleteMany({ where: { userId: f.ownerId } });
      expect(
        (
          await page.request.post("/api/v1/search/scoped", {
            headers: { origin },
            data: {
              target: { kind: "MEMBER_COLLECTION", collectionId: f.sharedCollection },
              query: {},
            },
          })
        ).status(),
      ).toBe(401);
    } finally {
      await cleanup(f);
    }
  });
  test(`${locale}: anonymous original share link searches only visible text and loses access immediately on revoke`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Guarded native cookie database required");
    const f = await fixture();
    try {
      const service = createShareService(db!);
      const grant = await service.createShare(
        { userId: f.foreignId },
        {
          target: { kind: "ITEM", id: f.sharedItem },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        },
      );
      await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: origin }]);
      const referers: string[] = [];
      page.on("request", (request) => {
        const referer = request.headers().referer;
        if (referer) referers.push(referer);
      });
      await page.goto(`/share/${grant.token}`);
      const panel = page.getByTestId("scoped-search-panel");
      await panel.getByRole("button", { name: t.open, exact: true }).click();
      await expect(panel.locator(".scoped-result-list")).toContainText("Shared native ceramic");
      await expect(panel.getByRole("button", { name: t.add, exact: true })).toBeDisabled();
      await panel.getByLabel(t.text, { exact: true }).fill("private-scoped-browser-sentinel");
      await panel.getByRole("button", { name: t.apply, exact: true }).click();
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(0);
      await panel.getByLabel(t.text, { exact: true }).fill("Blue glazed");
      await panel.getByRole("button", { name: t.apply, exact: true }).click();
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(1);
      expect(
        await page.evaluate(() =>
          JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
        ),
      ).not.toContain(grant.token!);
      expect(referers.some((value) => value.includes(grant.token!))).toBe(false);
      await capture(page, `scoped-share-${locale}-${info.project.name}`);
      await service.revokeShare(
        { userId: f.foreignId },
        { shareId: grant.share.id, expectedRevision: 0 },
      );
      await panel.getByRole("button", { name: t.apply, exact: true }).click();
      await expect(panel.getByRole("alert")).toContainText(t.gone);
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(0);
    } finally {
      await cleanup(f);
    }
  });
  test(`${locale}: retained unavailable false predicate stays editable and repairs the same scoped saved record`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Guarded native cookie database required");
    const f = await fixture();
    try {
      await createMembershipService(db!).addMember(
        { userId: f.foreignId },
        {
          collectionId: f.sharedCollection,
          userId: f.ownerId,
          role: "VIEWER",
          expectedRevision: 0,
        },
      );
      await signIn(page, f);
      await page.goto(`/${locale}/shared-search?collection=${f.sharedCollection}`);
      const panel = page.getByTestId("scoped-search-panel"),
        name = `Repair scoped ${locale}`;
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(1);
      await panel.getByLabel(t.name, { exact: true }).fill(name);
      await panel.getByRole("button", { name: t.save, exact: true }).click();
      await expect(panel.getByText(t.saved, { exact: true })).toBeVisible();
      const stored = await db!.smartCollection.findFirstOrThrow({
        where: { ownerId: f.ownerId, name },
      });
      // Guarded historical saved definition fixture; this does not grant execution.
      await db!.smartCollection.update({
        where: { id: stored.id },
        data: {
          revision: 2,
          definition: {
            version: 2,
            scope: { kind: "MEMBER_COLLECTION", collectionId: f.sharedCollection },
            text: "",
            lifecycle: "ALL",
            filter: { version: 1, root: { kind: "duplicate", value: false } },
          },
        },
      });
      await panel.getByRole("button", { name, exact: true }).click();
      await expect(panel.getByRole("alert")).toContainText(t.unavailable);
      await panel
        .getByRole("button", { name: locale === "de" ? "Bearbeiten" : "Edit", exact: true })
        .click();
      await expect(panel.locator(".scoped-retained-condition")).toContainText('"value": false');
      await panel.getByRole("button", { name: t.remove, exact: true }).click();
      await panel.getByRole("button", { name: t.apply, exact: true }).click();
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(1);
      const update = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/v1/scoped-smart-collections/${stored.id}`) &&
          response.request().method() === "PATCH",
      );
      await panel.getByRole("button", { name: t.save, exact: true }).click();
      expect((await update).status()).toBe(200);
      const repaired = await db!.smartCollection.findUniqueOrThrow({ where: { id: stored.id } });
      expect(repaired.revision).toBe(3);
      expect(repaired.definition).toMatchObject({ version: 2, filter: null });
      expect(await db!.smartCollection.count({ where: { ownerId: f.ownerId, name } })).toBe(1);
      await capture(page, `scoped-repaired-${locale}-${info.project.name}`);
    } finally {
      await cleanup(f);
    }
  });
}
