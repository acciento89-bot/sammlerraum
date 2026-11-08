import { hashPassword } from "better-auth/crypto";
import { createAIAnalysisService } from "@sammlerraum/domain/ai/ai-analysis-service";
import { createAnalyzeItemJob } from "../../worker/src/jobs/analyze-item";
import { createHmac, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import sharp from "sharp";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createBillingWebhookService } from "@sammlerraum/domain/billing/webhook-service";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createConditionMaintenanceService } from "@sammlerraum/domain/condition/condition-service";
import { credentialRateLimitFixture } from "./support/credential-rate-limit-fixture";
import { v1Seed } from "../../../packages/testing/src/v1-seed";
const enabled = process.env.RUN_V1_E2E === "1",
  origin = "http://localhost:3000",
  database = process.env.DATABASE_URL ?? "";
if (
  enabled &&
  (!new URL(database).pathname.endsWith("_test") ||
    !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
    process.env.RUN_BILLING_E2E !== "1" ||
    process.env.STRIPE_SECRET_KEY !== "sk_test_sammlerraum_offline_fixture" ||
    process.env.RUN_MEDIA_E2E !== "1" ||
    process.env.RUN_IMPORT_E2E !== "1")
)
  throw Error("Guarded complete V1 fixture configuration required");
const db = enabled ? createPrismaClient(database) : undefined;
test.use({ actionTimeout: 10000 });
test.afterAll(async () => {
  await db?.$disconnect();
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    const folder = resolve(
      "../../.superpowers/sdd/2026-09-19-13-integration-hardening-release/screenshots",
    );
    await mkdir(folder, { recursive: true });
    await page
      .screenshot({
        path: resolve(folder, `failed-${info.project.name}-${info.title.slice(0, 2)}.png`),
        fullPage: true,
      })
      .catch(() => {});
  }
});
async function verification(email: string) {
  let value: string | undefined;
  await expect
    .poll(async () => {
      try {
        value = JSON.parse(await readFile("/tmp/sammlerraum-auth-e2e-mailbox.json", "utf8"))[email]
          ?.url;
        return !!value;
      } catch {
        return false;
      }
    })
    .toBe(true);
  const target = new URL(value!);
  expect(target.origin).toBe(origin);
  expect(target.pathname).toBe("/api/auth/verify-email");
  return value!;
}
async function checkpoint(page: Page, info: TestInfo, locale: string, stage: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const folder = resolve(
    "../../.superpowers/sdd/2026-09-19-13-integration-hardening-release/screenshots",
  );
  await mkdir(folder, { recursive: true });
  await page.screenshot({
    path: resolve(folder, `${locale}-${info.project.name}-${stage}.png`),
    fullPage: true,
  });
}
for (const locale of ["de", "en"] as const)
  test(`${locale}: complete private collector journey`, async ({ page, browser }, info) => {
    test.skip(!enabled, "Owned complete V1 run only");
    test.setTimeout(180000);
    const f = v1Seed(locale),
      copy = locale === "de" ? de : en;
    page.setDefaultTimeout(10000);
    const network: { method: string; path: string; status: number }[] = [];
    page.on("response", (response) => {
      const target = new URL(response.url());
      if (target.origin === origin && target.pathname.startsWith("/api/"))
        network.push({
          method: response.request().method(),
          path: target.pathname,
          status: response.status(),
        });
    });
    const address = await credentialRateLimitFixture(db!);
    const guest = await browser.newContext({
      viewport: page.viewportSize() ?? { width: 390, height: 844 },
    });
    let ownerId: string | undefined,
      categoryId: string | undefined,
      recipientId: string | undefined;
    const recipientContext = await browser.newContext({
      viewport: page.viewportSize() ?? { width: 390, height: 844 },
    });
    const storage = new LocalPersistentStorage(
      process.env.UPLOADS_DIR!,
      createMediaAssetLocker(database),
    );
    try {
      await page.setExtraHTTPHeaders({ "x-forwarded-for": address.ip });
      await test.step("register verify sign in and set profile", async () => {
        await page.goto(`/${locale}/register`);
        await page.getByLabel(copy.Auth.name, { exact: true }).fill(f.name);
        await page.getByLabel(copy.Auth.email, { exact: true }).fill(f.email);
        await page.getByLabel(copy.Auth.password, { exact: true }).fill(f.password);
        await page.getByRole("button", { name: copy.Auth.register, exact: true }).click();
        await expect(page.getByText(copy.Auth.checkEmail, { exact: true })).toBeVisible();
        await page.goto(await verification(f.email));
        await page.goto(`/${locale}/login`);
        await page.getByLabel(copy.Auth.email, { exact: true }).fill(f.email);
        await page.getByLabel(copy.Auth.password, { exact: true }).fill(f.password);
        await page.getByRole("button", { name: copy.Auth.login, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/account/profile$`));
        ownerId = (await db!.user.findUniqueOrThrow({ where: { email: f.email } })).id;
        await page.getByLabel(copy.Profile.handle, { exact: true }).fill(f.handle);
        await page.getByLabel(copy.Profile.displayName, { exact: true }).fill(f.name);
        const profileSaved = page.waitForResponse(
          (r) => r.url().endsWith("/api/v1/account/profile") && r.request().method() === "PUT",
        );
        await page.getByRole("button", { name: copy.Profile.save, exact: true }).click();
        expect((await profileSaved).status()).toBe(200);
        await expect(page.getByText(copy.Profile.saved, { exact: true })).toBeVisible();
        await checkpoint(page, info, locale, "profile");
      });
      let collectionId = "",
        itemId = "";
      await test.step("create collection private location and item in actual forms", async () => {
        await page.goto(`/${locale}/collections`);
        await page.getByLabel(copy.Collections.name, { exact: true }).fill(f.collection);
        const created = page.waitForResponse(
          (r) => r.url().endsWith("/api/v1/collections") && r.request().method() === "POST",
        );
        await page.getByRole("button", { name: copy.Collections.create, exact: true }).click();
        const response = await created;
        expect(response.status()).toBe(201);
        const collectionLink = page.locator(".collection-list a").filter({ hasText: f.collection });
        await expect(collectionLink).toBeVisible();
        const destination = await collectionLink.getAttribute("href");
        if (!destination) throw Error("Created collection has no real navigation target");
        collectionId = new URL(destination, origin).pathname.split("/").at(-1)!;
        await collectionLink.click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/collections/${collectionId}$`));
        const locationSection = page
          .getByRole("heading", {
            name: locale === "de" ? "Lagerort anlegen" : "Create location",
            exact: true,
          })
          .locator("..");
        await locationSection
          .getByLabel(locale === "de" ? "Name des Lagerorts" : "Location name", { exact: true })
          .fill(f.location);
        await checkpoint(page, info, locale, "location-draft");
        expect(
          await locationSection
            .locator("form")
            .evaluate((form) => (form as HTMLFormElement).checkValidity()),
        ).toBe(true);
        const located = page.waitForResponse(
          (r) => r.url().endsWith("/api/v1/locations") && r.request().method() === "POST",
        );
        await locationSection
          .getByRole("button", {
            name: locale === "de" ? "Lagerort anlegen" : "Create location",
            exact: true,
          })
          .click();
        expect((await located).status()).toBe(201);
        await page.goto(`/${locale}/items/new?collectionId=${collectionId}`);
        await page.getByLabel(locale === "de" ? "Titel" : "Title", { exact: true }).fill(f.item);
        await page.getByLabel(copy.ItemForm.privateNotes).fill(f.privateNote);
        await page.getByLabel(copy.ItemForm.tags).fill("ceramic");
        await page.getByLabel(copy.ItemForm.location).selectOption({ label: f.location });
        const saved = page.waitForResponse(
          (r) => r.url().endsWith("/api/v1/money/items") && r.request().method() === "POST",
        );
        await page
          .getByRole("button", {
            name: locale === "de" ? "Stück speichern" : "Save item",
            exact: true,
          })
          .click();
        const responseItem = await saved;
        expect(responseItem.status()).toBe(201);
        await expect(page).toHaveURL(new RegExp(`/${locale}/items/[0-9a-f-]{36}$`));
        itemId = new URL(page.url()).pathname.split("/").at(-1)!;
        expect((await guest.request.get(`${origin}/api/v1/items/${itemId}`)).status()).toBe(404);
      });
      await test.step("upload real photo and set personal category and condition", async () => {
        const image = await sharp(Buffer.from(f.artwork)).png().toBuffer();
        await page
          .getByLabel(copy.Media.uploadImage, { exact: true })
          .setInputFiles({ name: "owned-vase.png", mimeType: "image/png", buffer: image });
        await expect(page.getByRole("img", { name: "owned-vase.png", exact: true })).toBeVisible({
          timeout: 50000,
        });
        const category = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate(
          { key: f.referenceKey, labels: { de: "V1 Keramik", en: "V1 ceramics" }, definitions: [] },
        );
        categoryId = category.id;
        const scheme = await createConditionMaintenanceService(db!).createConditionScheme({
          categoryTemplateId: category.id,
          key: f.referenceKey,
          labels: { de: "Keramikzustand", en: "Ceramic condition" },
          options: [{ labelKey: "good", labels: { de: "Gut", en: "Good" } }],
        });
        await page.reload();
        const conditionPanel = page.getByRole("region", {
          name: copy.Catalog.conditionSection,
          exact: true,
        });
        const categoryChoice = conditionPanel.getByLabel(copy.Catalog.category, { exact: true });
        await expect(categoryChoice).toBeEnabled();
        for (
          let catalogPage = 0;
          catalogPage < 64 &&
          !(await categoryChoice.locator(`option[value="${category.id}"]`).count());
          catalogPage++
        ) {
          await conditionPanel
            .getByRole("button", { name: copy.Catalog.moreCategories, exact: true })
            .click();
          await expect(categoryChoice).toBeEnabled();
        }
        await categoryChoice.selectOption(category.id);
        await page.getByRole("button", { name: copy.Catalog.saveCategory, exact: true }).click();
        await expect(page.getByText(copy.Catalog.categorySaved, { exact: true })).toBeVisible();
        await page
          .getByLabel(copy.Catalog.personalCondition, { exact: true })
          .selectOption(scheme.options[0]!.id);
        await page.getByRole("button", { name: copy.Catalog.saveCondition, exact: true }).click();
        await expect(page.getByText(copy.Catalog.conditionSaved, { exact: true })).toBeVisible();
        await checkpoint(page, info, locale, "private-item");
      });
      await test.step("hosted checkout return cannot grant and signed mock webhook confirms Premium", async () => {
        await page.goto(`/${locale}/account/billing`);
        await expect(page.getByTestId("billing-plan")).toHaveText("Free");
        await page.route("https://checkout.stripe.com/**", (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: "Owned offline V1 Checkout; no real purchase",
          }),
        );
        await page.getByTestId("billing-offer-MONTHLY").getByRole("button").click();
        await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/offline_/u);
        await page.goto(`/${locale}/account/billing?checkout=success`);
        await expect(page.getByTestId("billing-plan")).toHaveText("Free");
        const account = await db!.billingAccount.findFirstOrThrow({
          where: { subjectId: ownerId!, provider: "stripe_test" },
        });
        const customerId = account.providerCustomerId;
        if (!customerId) throw Error("Actual offline checkout did not bind an owned customer");
        const subscriptionId = "sub_" + f.key,
          eventId = "evt_" + f.key;
        const event = {
          id: eventId,
          type: "customer.subscription.updated",
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          data: {
            object: {
              id: subscriptionId,
              customer: customerId,
              metadata: { subjectId: "must-not-authorize" },
            },
          },
        };
        const raw = JSON.stringify(event),
          stamp = Math.floor(Date.now() / 1000),
          signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!)
            .update(`${stamp}.${raw}`)
            .digest("hex");
        const response = await page.request.post("/api/v1/billing/webhook", {
          headers: {
            "content-type": "application/json",
            "stripe-signature": `t=${stamp},v1=${signature}`,
          },
          data: raw,
        });
        expect(response.status()).toBe(202);
        const receipt = await db!.billingWebhookReceipt.findFirstOrThrow({
          where: { eventId, provider: "stripe_test" },
        });
        await createBillingWebhookService(db!, {
          providerId: "stripe_test",
          liveMode: false,
        }).processReceipt(receipt.id, {
          id: "stripe_test",
          resolveCustomer: async () => customerId,
          readEventState: async () => [
            {
              subscriptionId,
              customerId,
              status: "ACTIVE" as const,
              currentPeriodStart: new Date(Date.now() - 1000),
              currentPeriodEnd: new Date(Date.now() + 3600000),
              cancelAtPeriodEnd: false,
              planEligible: true,
              risk: null,
            },
          ],
        });
        await page.reload();
        await expect(page.getByTestId("billing-plan")).toHaveText("Premium");
        await checkpoint(page, info, locale, "premium-confirmed");
      });
      await test.step("photo analysis crosses actual admission worker and explicit field confirmation", async () => {
        await page.goto(`/${locale}/items/${itemId}/ai`);
        await page.getByLabel(copy.AI.photo.replace("{number}", "1"), { exact: true }).check();
        await page.getByLabel(copy.AI.consent, { exact: true }).check();
        const admitted = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === `/api/v1/items/${itemId}/ai` &&
            r.request().method() === "POST",
        );
        await page.getByRole("button", { name: copy.AI.analyze, exact: true }).click();
        expect((await admitted).status()).toBe(201);
        const job = await db!.aIAnalysisJob.findFirstOrThrow({
          where: { requesterId: ownerId!, itemId },
          orderBy: { createdAt: "desc" },
        });
        const nextTitle = locale === "de" ? "Geprüfte Atelier-Vase" : "Reviewed studio vase";
        const service = createAIAnalysisService(db!, {
          providerId: "openai",
          model: "fixture-vision",
          monthlyRequestLimit: 3,
        });
        await createAnalyzeItemJob(
          service,
          {
            id: "openai",
            model: "fixture-vision",
            analyzeCollectible: async () => ({
              analysis: {
                categoryKey: null,
                title: nextTitle,
                manufacturer: null,
                seriesOrSet: null,
                year: null,
                identifiers: [],
                catalogCandidates: [],
                warnings: [
                  locale === "de"
                    ? "Sichtbare Merkmale selbst prüfen."
                    : "Verify visible details yourself.",
                ],
              },
              usage: { inputTokens: 12, outputTokens: 5 },
            }),
          },
          storage,
        )({ analysisJobId: job.id });
        await expect(page.getByTestId("ai-review")).toBeVisible();
        expect((await db!.collectibleItem.findUniqueOrThrow({ where: { id: itemId } })).title).toBe(
          f.item,
        );
        await page
          .getByLabel(locale === "de" ? "Titel übernehmen" : "Accept title", { exact: true })
          .check();
        await page.getByRole("button", { name: copy.AI.apply, exact: true }).click();
        await expect(page.getByTestId("ai-decision")).toBeVisible();
        expect((await db!.collectibleItem.findUniqueOrThrow({ where: { id: itemId } })).title).toBe(
          nextTitle,
        );
        f.item = nextTitle;
        await checkpoint(page, info, locale, "analysis-confirmed");
      });
      await test.step("save real filtered view and share selected collection without private notes", async () => {
        await page.goto(`/${locale}/search`);
        if (await page.evaluate(() => matchMedia("(max-width: 44rem)").matches))
          await page.getByRole("button", { name: copy.Search.openFilters, exact: true }).click();
        await page.getByLabel(copy.Search.text, { exact: true }).fill(f.item);
        await page.getByRole("button", { name: copy.Search.apply, exact: true }).click();
        await expect(page.getByTestId("search-total")).toContainText("1");
        await page
          .getByRole("button", {
            name: locale === "de" ? "Suche speichern" : "Save search",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByLabel(locale === "de" ? "Name der Suche" : "Search name", { exact: true })
          .fill(f.savedSearch);
        await dialog
          .getByRole("button", { name: locale === "de" ? "Speichern" : "Save", exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections/`));
        await checkpoint(page, info, locale, "saved-search");
        await page.goto(`/${locale}/collections/${collectionId}/sharing`);
        await page.getByLabel(locale === "de" ? "Bilder" : "Images", { exact: true }).check();
        await page
          .getByRole("button", {
            name: locale === "de" ? "Freigabe erstellen" : "Create share",
            exact: true,
          })
          .click();
        const link = page.getByRole("link", {
          name: locale === "de" ? "Freigabelink öffnen" : "Open share link",
          exact: true,
        });
        const shared = await guest.newPage();
        await expect(link).toBeVisible();
        await shared.goto(new URL((await link.getAttribute("href"))!, origin).toString());
        await expect(shared.getByRole("heading", { name: f.item, exact: true })).toBeVisible();
        await expect(shared.locator("body")).not.toContainText(f.privateNote);
        await expect(shared.locator("body")).not.toContainText(f.location);
        await shared.close();
      });
      await test.step("upload preview explicitly approve and finish a real CSV import", async () => {
        await page.goto(`/${locale}/imports`);
        await page
          .getByLabel(locale === "de" ? "Zielsammlung" : "Target collection", { exact: true })
          .selectOption(collectionId);
        await page
          .getByLabel(locale === "de" ? "Datei auswählen" : "Choose file", { exact: true })
          .setInputFiles({
            name: "v1-inventory.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(`Title,Quantity\n${f.importItem},2\n`),
          });
        await page
          .getByRole("button", {
            name: locale === "de" ? "Datei hochladen" : "Upload file",
            exact: true,
          })
          .click();
        await expect(
          page.getByLabel(locale === "de" ? "Titelspalte" : "Title column", { exact: true }),
        ).toBeVisible({ timeout: 30000 });
        await page
          .getByLabel(locale === "de" ? "Titelspalte" : "Title column", { exact: true })
          .selectOption("0");
        await page
          .getByLabel(locale === "de" ? "Mengenspalte" : "Quantity column", { exact: true })
          .selectOption("1");
        await page
          .getByRole("button", {
            name: locale === "de" ? "Vorschau erstellen" : "Build preview",
            exact: true,
          })
          .click();
        await page
          .getByLabel(locale === "de" ? "Entscheidung für Zeile 1" : "Decision for row 1", {
            exact: true,
          })
          .selectOption("CREATE");
        await page
          .getByRole("button", {
            name: locale === "de" ? "Entscheidungen speichern" : "Save decisions",
            exact: true,
          })
          .click();
        const start = page.getByRole("button", {
          name: locale === "de" ? "Import starten" : "Start import",
          exact: true,
        });
        await expect(start).toBeEnabled();
        await start.click();
        await expect(
          page.getByText(locale === "de" ? "Import abgeschlossen" : "Import complete", {
            exact: true,
          }),
        ).toBeVisible({ timeout: 30000 });
        expect(
          await db!.collectibleItem.count({
            where: { ownerId: ownerId!, title: f.importItem, quantity: 2 },
          }),
        ).toBe(1);
        await checkpoint(page, info, locale, "import-complete");
      });
      await test.step("private wishlist and real public comment remain separate from inventory notes", async () => {
        await page.goto(`/${locale}/wishlist`);
        const wishTitle = locale === "de" ? "Gesuchte Atelier-Schale" : "Wanted studio bowl";
        await page
          .getByLabel(locale === "de" ? "Was suchst du?" : "What are you looking for?", {
            exact: true,
          })
          .fill(wishTitle);
        await page
          .getByLabel(locale === "de" ? "Private Notizen" : "Private notes", { exact: true })
          .fill(f.privateNote);
        await page
          .getByRole("button", {
            name: locale === "de" ? "Wunsch speichern" : "Save wish",
            exact: true,
          })
          .click();
        await expect(
          page.getByTestId("wishlist-entry").filter({ hasText: wishTitle }),
        ).toBeVisible();
        recipientId = randomUUID();
        await db!.user.create({
          data: {
            id: recipientId,
            name: "V1 invited collector",
            email: `${recipientId}@example.invalid`,
            emailVerified: true,
            profile: {
              create: {
                handle: `v1-friend-${f.key.slice(0, 20)}`,
                displayName: "V1 invited collector",
              },
            },
            accounts: {
              create: {
                id: randomUUID(),
                accountId: recipientId,
                providerId: "credential",
                password: await hashPassword(f.password),
              },
            },
          },
        });
        const publicCollection = await db!.collection.create({
          data: { ownerId: recipientId, name: "Owned public V1 display", visibility: "PUBLIC" },
        });
        const publicItem = await db!.collectibleItem.create({
          data: {
            ownerId: recipientId,
            collectionId: publicCollection.id,
            title: `Public V1 sample ${f.key.slice(0, 8)}`,
            visibility: "PUBLIC",
          },
        });
        await page.goto(`/${locale}/community`);
        const card = page.getByTestId(`feed-${publicItem.id}`);
        await expect(card).toBeVisible();
        await card
          .getByRole("button", { name: locale === "de" ? "Kommentare" : "Comments", exact: true })
          .click();
        const comment =
          locale === "de" ? "Schöne Glasur aus dem Atelier." : "Beautiful studio glaze.";
        await card
          .getByLabel(locale === "de" ? "Dein Kommentar" : "Your comment", { exact: true })
          .fill(comment);
        await card
          .getByRole("button", {
            name: locale === "de" ? "Kommentar senden" : "Send comment",
            exact: true,
          })
          .click();
        await expect(card.getByText(comment, { exact: true })).toBeVisible();
        await expect(page.locator("body")).not.toContainText(f.privateNote);
        await checkpoint(page, info, locale, "community-comment");
      });
      await test.step("create recipient-bound invitation and accept in a separate actual session", async () => {
        expect(
          (
            await recipientContext.request.post(`${origin}/api/auth/sign-in/email`, {
              headers: { origin, "x-forwarded-for": address.ip },
              data: { email: `${recipientId}@example.invalid`, password: f.password },
            })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/collections/${collectionId}/members`);
        await page
          .getByLabel(locale === "de" ? "E-Mail-Adresse" : "Email address", { exact: true })
          .fill(`${recipientId}@example.invalid`);
        await page
          .getByRole("button", {
            name: locale === "de" ? "Einladung erstellen" : "Create invitation",
            exact: true,
          })
          .click();
        const link = page.getByLabel(
          locale === "de" ? "Einladungslink zum Kopieren" : "Invitation link to copy",
          { exact: true },
        );
        await expect(link).toBeVisible();
        const invited = await recipientContext.newPage();
        await invited.goto(await link.inputValue());
        await invited
          .getByRole("button", {
            name: locale === "de" ? "Einladung annehmen" : "Accept invitation",
            exact: true,
          })
          .click();
        await expect(invited.getByRole("status")).toContainText(
          locale === "de" ? "beigetreten" : "joined",
        );
        expect(
          await db!.collectionMember.count({ where: { collectionId, userId: recipientId! } }),
        ).toBe(1);
        expect(
          (
            await recipientContext.request.get(
              `${origin}/api/v1/media/${(await db!.mediaLink.findFirstOrThrow({ where: { itemId } })).assetId}/original`,
            )
          ).status(),
        ).toBe(404);
        await invited.close();
        await checkpoint(page, info, locale, "members");
      });
      await test.step("save private insurance and download an actual selected-field PDF", async () => {
        await page.goto(`/${locale}/insurance`);
        await page
          .getByLabel(locale === "de" ? "Sammlung" : "Collection", { exact: true })
          .selectOption(collectionId);
        await page
          .getByRole("button", {
            name: locale === "de" ? "Versicherungsdaten laden" : "Load insurance data",
            exact: true,
          })
          .click();
        await page
          .getByLabel(locale === "de" ? "Versicherungswert" : "Insurance value", { exact: true })
          .fill(locale === "de" ? "123,45" : "123.45");
        await page
          .getByLabel(locale === "de" ? "Bewertungsdatum" : "Valuation date", { exact: true })
          .fill("2026-01-01");
        await page
          .getByRole("button", {
            name: locale === "de" ? "Versicherungsdaten speichern" : "Save insurance data",
            exact: true,
          })
          .click();
        await expect(
          page.getByText(locale === "de" ? "Versicherung gespeichert" : "Insurance saved", {
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("checkbox", {
            name: locale === "de" ? "Versicherungsdaten" : "Insurance data",
            exact: true,
          })
          .check();
        await expect(
          page.getByRole("checkbox", {
            name: locale === "de" ? "Private Notizen" : "Private notes",
            exact: true,
          }),
        ).not.toBeChecked();
        await page
          .getByRole("button", {
            name: locale === "de" ? "PDF-Bericht erstellen" : "Create PDF report",
            exact: true,
          })
          .click();
        await expect(
          page.getByText(locale === "de" ? "Bericht beauftragt" : "Report requested", {
            exact: true,
          }),
        ).toBeVisible();
        await page.goto(`/${locale}/exports`);
        const pdf = page.getByRole("link", {
          name: locale === "de" ? "PDF herunterladen" : "PDF download",
          exact: true,
        });
        await expect(pdf).toBeVisible({ timeout: 30000 });
        const download = page.waitForEvent("download");
        await pdf.click();
        const bytes = await readFile((await (await download).path())!);
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
        const report = await db!.reportJob.findFirstOrThrow({
          where: { ownerId: ownerId! },
          orderBy: { createdAt: "desc" },
        });
        expect(report.status).toBe("READY");
        expect(report.sourceJson).not.toContain(f.privateNote);
        expect(
          (
            await guest.request.get(`${origin}/api/v1/media/${report.artifactId}/original`)
          ).status(),
        ).toBe(404);
        await checkpoint(page, info, locale, "private-report");
      });
      await test.step("read actual job notifications and verify current whole dashboard", async () => {
        expect(await db!.notification.count({ where: { recipientId: ownerId! } })).toBeGreaterThan(
          0,
        );
        await page.goto(`/${locale}/notifications`);
        const readAll = page.getByRole("button", {
          name: locale === "de" ? "Alle als gelesen markieren" : "Mark all read",
          exact: true,
        });
        const unread = await db!.notification.findMany({
          where: { recipientId: ownerId!, readAt: null },
          select: { id: true },
        });
        await expect(readAll).toBeEnabled();
        const acknowledged = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === "/api/v1/notifications/read-all" &&
            r.request().method() === "POST",
        );
        await readAll.click();
        expect((await acknowledged).status()).toBe(200);
        await expect(readAll).toBeDisabled();
        expect(
          await db!.notification.count({
            where: { id: { in: unread.map((n) => n.id) }, recipientId: ownerId!, readAt: null },
          }),
        ).toBe(0);
        await page.goto(`/${locale}/dashboard`);
        await expect(page.getByTestId("dashboard-selection-rows")).toHaveText("2");
        await page.locator(".skip-link").focus();
        await expect(page.locator(".skip-link")).toBeFocused();
        await page.keyboard.press("Tab");
        expect((await guest.request.get(`${origin}/api/v1/items/${itemId}`)).status()).toBe(404);
        await checkpoint(page, info, locale, "dashboard");
        expect(network.filter((response) => response.status >= 500)).toEqual([]);
      });
    } finally {
      const proofFolder = resolve(
        "../../.superpowers/sdd/2026-09-19-13-integration-hardening-release",
      );
      await writeFile(
        resolve(proofFolder, `task-2-network-${f.key}.json`),
        JSON.stringify(network, null, 2),
      );
      await guest.close().catch(() => {});
      await recipientContext.close().catch(() => {});
      const owner = ownerId
        ? { id: ownerId }
        : await db!.user.findUnique({ where: { email: f.email }, select: { id: true } });
      if (owner) {
        const importSources = await db!.importJob.findMany({
          where: { ownerId: owner.id },
          select: { sourceStorageKey: true },
        });
        const assets = await db!.mediaAsset.findMany({
          where: { ownerId: owner.id },
          include: { variants: true },
        });
        await db!.collection.deleteMany({ where: { ownerId: owner.id } });
        await db!.mediaVariant.deleteMany({ where: { assetId: { in: assets.map((a) => a.id) } } });
        await db!.mediaAsset.deleteMany({ where: { ownerId: owner.id } });
        await db!.user.delete({ where: { id: owner.id } });
        for (const source of importSources)
          if (source.sourceStorageKey) await storage.delete(source.sourceStorageKey);
        for (const asset of assets) {
          await storage.delete(asset.storageKey);
          for (const variant of asset.variants) await storage.delete(variant.storageKey);
        }
      }
      if (recipientId) {
        await db!.collection.deleteMany({ where: { ownerId: recipientId } });
        await db!.user.deleteMany({ where: { id: recipientId } });
      }
      if (categoryId) {
        await db!.conditionOption.deleteMany({
          where: { scheme: { categoryTemplateId: categoryId } },
        });
        await db!.conditionScheme.deleteMany({ where: { categoryTemplateId: categoryId } });
        await db!.categoryTemplate.delete({ where: { id: categoryId } });
      }
      await address.cleanup();
    }
  });
