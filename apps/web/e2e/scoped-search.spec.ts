import { createWishlistService } from "@sammlerraum/domain/wishlist/wishlist-service";
import { createScopedSavedSearchService } from "@sammlerraum/domain/search/scoped-saved-search-service";
import { createValuationService } from "@sammlerraum/domain/valuations/valuation-service";
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
      await panel
        .getByRole("button", {
          name: locale === "de" ? "Ansicht aktualisieren" : "Update view",
          exact: true,
        })
        .click();
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
  test(`${locale}: explicit shared value grants execute actual controls and exact manual totals`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Guarded native cookie database required");
    const f = await fixture();
    try {
      await db!.collectibleItem.update({
        where: { id: f.sharedItem },
        data: { purchaseAmountMinor: 0n, purchaseCurrency: "EUR" },
      });
      await createValuationService(db!, f.foreignId).addManualValuation(f.sharedItem, {
        amountMinor: 100n,
        currency: "EUR",
      });
      const grant = await createShareService(db!).createShare(
        { userId: f.foreignId },
        {
          target: { kind: "ITEM", id: f.sharedItem },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          permissions: { values: true, images: true },
        },
      );
      await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: origin }]);
      await page.goto(`/share/${grant.token}`);
      const panel = page.getByTestId("scoped-search-panel");
      await panel.getByRole("button", { name: t.open, exact: true }).click();
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(1);
      await panel.getByRole("button", { name: t.add, exact: true }).click();
      await panel.getByRole("button", { name: t.apply, exact: true }).click();
      // The default granted purchase presence condition must count raw zero.
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(1);
      await panel.getByRole("button", { name: t.overview, exact: true }).click();
      const overview = panel.getByRole("region", { name: t.overview });
      await expect(overview).toContainText(locale === "de" ? "2,00 EUR" : "2.00 EUR");
      await expect(overview).not.toContainText(
        locale === "de"
          ? "Werte sind für diese Auswahl nicht freigegeben"
          : "Values are not shared",
      );
      await capture(page, `scoped-values-${locale}-${info.project.name}`);
    } finally {
      await cleanup(f);
    }
  });
  for (const mode of ["search", "dashboard"] as const)
    test(`${locale}: delayed scoped ${mode} preserves newer draft changes`, async ({ page }) => {
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
        const panel = page.getByTestId("scoped-search-panel");
        await expect(panel.locator(".scoped-result-list li")).toHaveCount(1);
        {
          let release!: () => void, entered!: () => void;
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          const started = new Promise<void>((resolve) => {
            entered = resolve;
          });
          const path = mode === "search" ? "**/api/v1/search/scoped" : "**/api/v1/dashboard/scoped";
          await page.route(
            path,
            async (route) => {
              const response = await route.fetch();
              entered();
              await held;
              await route.fulfill({ response });
            },
            { times: 1 },
          );
          await panel.getByLabel(t.text, { exact: true }).fill("ceramic");
          await panel
            .getByRole("button", { name: mode === "search" ? t.apply : t.overview, exact: true })
            .click();
          await started;
          await panel.getByLabel(t.text, { exact: true }).fill("unapplied newer draft");
          release();
          await expect(panel).toHaveAttribute("aria-busy", "false");
          await expect(
            panel.getByText(
              locale === "de"
                ? "Bedingungen geändert. Bitte anwenden, bevor weitere Treffer geladen werden."
                : "Conditions changed. Apply them before loading more results.",
              { exact: true },
            ),
          ).toBeVisible();
        }
      } finally {
        await cleanup(f);
      }
    });
  test(`${locale}: stale saved scope cannot resolve another authorized collection under selected labels`, async ({
    page,
  }) => {
    test.skip(!enabled, "Guarded native cookie database required");
    const f = await fixture();
    try {
      const b = await createCollectionService(db!, f.foreignId).createCollection({
        name: "Second authorized scope",
      });
      await createItemService(db!, f.foreignId).createItem({
        collectionId: b.id,
        title: "Other scope sentinel",
      });
      const members = createMembershipService(db!);
      for (const collectionId of [f.sharedCollection, b.id])
        await members.addMember(
          { userId: f.foreignId },
          {
            collectionId,
            userId: f.ownerId,
            role: "VIEWER",
            expectedRevision: 0,
          },
        );
      const service = createScopedSavedSearchService(db!);
      const definition = {
        version: 2,
        scope: { kind: "MEMBER_COLLECTION", collectionId: f.sharedCollection },
        text: "",
        filter: null,
        lifecycle: "ALL",
      };
      const saved = await service.create(
        { userId: f.ownerId },
        { name: "Stale scope view", definition },
      );
      await signIn(page, f);
      await page.goto(`/${locale}/shared-search?collection=${b.id}`);
      await expect(
        page.getByTestId("scoped-search-panel").locator(".scoped-result-list"),
      ).toContainText("Other scope sentinel");
      const oldEntry = page
        .locator(".scoped-saved-list button")
        .filter({ hasText: saved.name })
        .last();
      await expect(oldEntry).toBeVisible();
      await service.update({ userId: f.ownerId }, saved.id, {
        name: saved.name,
        expectedRevision: 1,
        definition: { ...definition, scope: { kind: "MEMBER_COLLECTION", collectionId: b.id } },
      });
      let resolutions = 0;
      page.on("request", (request) => {
        if (request.url().endsWith(`/scoped-smart-collections/${saved.id}/items`)) resolutions++;
      });
      await oldEntry.click();
      const panel = page.getByTestId("scoped-search-panel");
      await expect(panel.getByRole("alert")).toBeVisible();
      await expect(panel.locator(".scoped-result-list")).toHaveCount(0);
      expect(resolutions).toBe(0);
    } finally {
      await cleanup(f);
    }
  });
  test(`${locale}: explicit save as new preserves the first view and supports removal without scope access`, async ({
    page,
  }) => {
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
      await expect(panel.locator(".scoped-result-list li")).toHaveCount(1);
      await panel.getByLabel(t.name, { exact: true }).fill("First view");
      await panel.getByRole("button", { name: t.save, exact: true }).click();
      await expect(panel.getByText(t.saved, { exact: true })).toBeVisible();
      await panel.getByLabel(t.name, { exact: true }).fill("Second view");
      await panel
        .getByRole("button", {
          name: locale === "de" ? "Als neue Ansicht speichern" : "Save as new view",
          exact: true,
        })
        .click();
      await expect
        .poll(() => db!.smartCollection.count({ where: { ownerId: f.ownerId, deletedAt: null } }))
        .toBe(2);
      const first = await db!.smartCollection.findFirstOrThrow({
        where: { ownerId: f.ownerId, name: "First view" },
      });
      expect(first.revision).toBe(1);
      await members.removeMember(
        { userId: f.foreignId },
        { collectionId: f.sharedCollection, userId: f.ownerId, expectedRevision: 1 },
      );
      await page.reload();
      const row = page
        .locator(".management-shell > section .scoped-saved-list li")
        .filter({ hasText: "First view" })
        .last();
      await row
        .getByRole("button", {
          name: locale === "de" ? "Ansicht löschen" : "Delete view",
          exact: true,
        })
        .click();
      await row
        .getByRole("button", {
          name: locale === "de" ? "Löschen bestätigen" : "Confirm deletion",
          exact: true,
        })
        .click();
      await expect
        .poll(
          async () =>
            (await db!.smartCollection.findUniqueOrThrow({ where: { id: first.id } })).deletedAt !==
            null,
        )
        .toBe(true);
    } finally {
      await cleanup(f);
    }
  });
  test(`${locale}: collector search discovers private literal wishlist search and safe market-source controls`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Guarded native cookie database required");
    const f = await fixture();
    try {
      const service = createWishlistService(db!);
      await service.createWishlistEntry(
        { userId: f.ownerId },
        { title: "Ceramic 100%_wish", notes: "blue glaze" },
      );
      await service.createWishlistEntry({ userId: f.ownerId }, { title: "Different wish" });
      await service.createWishlistEntry(
        { userId: f.foreignId },
        { title: "Foreign private wish", notes: "100%_wish" },
      );
      await signIn(page, f);
      await page.goto(`/${locale}/search`);
      if (info.project.name === "mobile")
        await page
          .getByRole("button", {
            name: locale === "de" ? "Filter öffnen" : "Open filters",
            exact: true,
          })
          .click();
      await page.getByRole("button", { name: t.add, exact: true }).click();
      await page
        .getByLabel(locale === "de" ? "Filterart" : "Filter family", { exact: true })
        .selectOption("marketMoney");
      await expect(
        page.getByLabel(
          locale === "de" ? "Marktquelle und Messwert" : "Market source and measure",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          locale === "de"
            ? "Zurzeit ist keine Marktquelle für deine Suche freigegeben."
            : "No market source is currently enabled for your searches.",
          { exact: true },
        ),
      ).toBeVisible();
      // Metadata transport fixture exercises controls; it grants no actual backend rights.
      const selector = {
        mode: "CURRENT_ITEM_MAPPING",
        providerId: "fixture",
        identifierNamespace: "fixture",
        identifierType: "product",
        kind: "LAST_SOLD",
        currency: "EUR",
        minorUnitExponent: 2,
        sourceMetric: "sold_item",
        qualifiers: { region: "EU" },
      };
      await page.route("**/api/v1/search/market-selectors", (route) =>
        route.fulfill({ json: { selectors: [selector] } }),
      );
      const family = page.getByLabel(locale === "de" ? "Filterart" : "Filter family", {
        exact: true,
      });
      await family.selectOption("tags");
      await family.selectOption("marketMoney");
      await page
        .getByLabel(locale === "de" ? "Marktquelle und Messwert" : "Market source and measure", {
          exact: true,
        })
        .selectOption("0");
      await page
        .getByLabel(locale === "de" ? "Vergleich" : "Operator", { exact: true })
        .selectOption("range");
      await page.getByLabel(locale === "de" ? "Minimum" : "Minimum", { exact: true }).fill("0");
      const denied = page.waitForResponse(
        (r) => r.url().endsWith("/api/v1/search/items") && r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: locale === "de" ? "Anwenden" : "Apply", exact: true })
        .click();
      const deniedResponse = await denied;
      expect(deniedResponse.status()).toBe(422);
      expect(JSON.parse(deniedResponse.request().postDataJSON().f).root).toMatchObject({
        kind: "marketMoney",
        selector,
        test: { op: "range", minMinor: "0" },
      });
      await page.unroute("**/api/v1/search/market-selectors");
      // Real deployment has no activated license: source registration never invents one.
      await page.goto(`/${locale}/search`);
      await page
        .locator(".management-nav")
        .getByRole("link", { name: locale === "de" ? "Wunschliste" : "Wishlist", exact: true })
        .click();
      const text = page.getByLabel(
        locale === "de" ? "In meiner Wunschliste suchen" : "Search my wishlist",
        { exact: true },
      );
      await text.fill("%_");
      const response = page.waitForResponse(
        (r) =>
          r.url().includes("/api/v1/wishlist?") &&
          new URL(r.url()).searchParams.get("text") === "%_" &&
          r.request().method() === "GET",
      );
      await page
        .getByRole("button", {
          name: locale === "de" ? "Wünsche suchen" : "Search wishes",
          exact: true,
        })
        .click();
      expect(
        (await (await response).json()).entries.map((entry: { title: string }) => entry.title),
      ).toEqual(["Ceramic 100%_wish"]);
      await expect(page.getByText("Ceramic 100%_wish", { exact: true })).toBeVisible();
      await expect(page.getByText("Foreign private wish", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Different wish", { exact: true })).toHaveCount(0);
    } finally {
      await cleanup(f);
    }
  });
}
