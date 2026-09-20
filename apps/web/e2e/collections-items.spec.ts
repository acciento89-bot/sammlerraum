import { randomUUID } from "node:crypto";

import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { hashPassword } from "better-auth/crypto";

const runManagementE2E = process.env.RUN_AUTH_E2E === "1";

type Locale = "de" | "en";

const copy = {
  de: {
    collectionName: "Name der Sammlung",
    collections: "Sammlungen",
    createCollection: "Sammlung anlegen",
    subcollectionName: "Name der Teilsammlung",
    createSubcollection: "Teilsammlung anlegen",
    hierarchy: "Sammlungshierarchie",
    customFieldName: "Feldname",
    customFieldType: "Feldtyp",
    shortText: "Kurzer Text",
    createCustomField: "Feld anlegen",
    locationName: "Name des Lagerorts",
    locationParent: "Übergeordneter Lagerort",
    locationType: "Lagerorttyp",
    room: "Raum",
    cabinet: "Vitrine / Schrank",
    shelf: "Fach / Regal",
    createLocation: "Lagerort anlegen",
    addItem: "Stück hinzufügen",
    node: "Teilsammlung",
    title: "Titel",
    publicDescription: "Öffentliche Beschreibung",
    privateNotes: "Private Notizen",
    unitPrice: "Kaufpreis pro Stück",
    currency: "Währung",
    tags: "Tags",
    identifierType: "Kennungstyp",
    identifierValue: "EAN / UPC / ISBN oder andere Kennung",
    location: "Lagerort",
    saveItem: "Stück speichern",
    private: "Privat",
    visibility: "Sichtbarkeit",
    email: "E-Mail-Adresse",
    password: "Passwort",
    signIn: "Anmelden",
    identifiers: "Kennungen und Code-Erfassung",
    scanStart: "Code scannen",
    scanProposal: "Erkannter Vorschlag",
    scanConfirm: "Vorschlag übernehmen",
    archive: "Archivieren",
    archivedMessage: "Stück archiviert.",
    savedDetails: "Gespeicherte Zusatzdaten",
    setCustomField: "Wert verwenden",
  },
  en: {
    collectionName: "Collection name",
    collections: "Collections",
    createCollection: "Create collection",
    subcollectionName: "Subcollection name",
    createSubcollection: "Create subcollection",
    hierarchy: "Collection hierarchy",
    customFieldName: "Field name",
    customFieldType: "Field type",
    shortText: "Short text",
    createCustomField: "Create field",
    locationName: "Location name",
    locationParent: "Parent location",
    locationType: "Location type",
    room: "Room",
    cabinet: "Display cabinet / cabinet",
    shelf: "Shelf",
    createLocation: "Create location",
    addItem: "Add item",
    node: "Subcollection",
    title: "Title",
    publicDescription: "Public description",
    privateNotes: "Private notes",
    unitPrice: "Purchase price per unit",
    currency: "Currency",
    tags: "Tags",
    identifierType: "Identifier type",
    identifierValue: "EAN / UPC / ISBN or other identifier",
    location: "Location",
    saveItem: "Save item",
    private: "Private",
    visibility: "Visibility",
    email: "Email address",
    password: "Password",
    signIn: "Sign in",
    identifiers: "Identifiers and code capture",
    scanStart: "Scan code",
    scanProposal: "Detected proposal",
    scanConfirm: "Accept proposal",
    archive: "Archive",
    archivedMessage: "Item archived.",
    savedDetails: "Saved additional details",
    setCustomField: "Use value",
  },
} as const;

function localeFor(testInfo: TestInfo): Locale {
  return testInfo.project.name === "mobile" ? "en" : "de";
}

async function expectTreeItem(page: Page, name: string) {
  const item = page.getByRole("treeitem", { name, exact: true });
  try {
    await expect(item).toBeVisible();
  } catch (error) {
    const main = page.locator("main");
    const [text, aria] = await Promise.all([main.innerText(), main.ariaSnapshot()]);
    const original = error instanceof Error ? error.message : String(error);
    throw new Error(`${original}\nUI text: ${text.slice(0, 2000)}\nARIA: ${aria.slice(0, 3000)}`);
  }
}

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = (() => {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.split("/").at(-1) ?? "");
  } catch {
    return "";
  }
})();
if (runManagementE2E && !databaseName.endsWith("_test")) {
  throw new Error("Collection browser tests only seed a database whose name ends in _test");
}
if (runManagementE2E && process.env.NODE_ENV === "production") {
  throw new Error("Collection browser fixtures are disabled in production mode");
}
const prisma = createPrismaClient(databaseUrl);

async function seedTestCollector() {
  const email = `collections-browser-${randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";
  const userId = randomUUID();

  await prisma.user.create({
    data: {
      id: userId,
      name: "Test Collector",
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });

  return { email, password, userId };
}

async function loginTestCollector(
  page: Page,
  locale: Locale,
  credentials: { email: string; password: string },
) {
  const labels = copy[locale];

  await page.goto(`/${locale}/login`);
  await page.getByLabel(labels.email).fill(credentials.email);
  await page.getByLabel(labels.password).fill(credentials.password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-in/email") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: labels.signIn, exact: true }).click();
  const response = await loginResponse;
  expect(response.status(), `test collector sign-in returned HTTP ${response.status()}`).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/${locale}/account/profile$`));
}

test.describe("localized collection and item management", () => {
  test.skip(!runManagementE2E, "requires the migrated PostgreSQL database and Chromium");

  test.beforeAll(async () => {
    await prisma.$connect();
    // The authentication journey intentionally exercises the database-backed limiter first.
    // Isolate this later feature journey without changing production rate-limit behavior.
    await prisma.rateLimit.deleteMany();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("collector creates a nested collection and item with custom field and location", async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      const browser = globalThis as unknown as {
        BarcodeDetector?: unknown;
        navigator: { mediaDevices?: { getUserMedia(): Promise<unknown> } };
        MediaStream: new () => unknown;
        HTMLMediaElement: { prototype: { play(): Promise<void> } };
      };
      Object.defineProperty(browser, "BarcodeDetector", {
        configurable: true,
        value: class {
          async detect() {
            return [{ rawValue: "9783161484100" }];
          }
        },
      });
      Object.defineProperty(browser.navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async () => new browser.MediaStream() },
      });
      browser.HTMLMediaElement.prototype.play = async () => undefined;
    });
    const locale = localeFor(testInfo);
    const labels = copy[locale];
    const collector = await seedTestCollector();

    try {
      await loginTestCollector(page, locale, collector);
      await page.goto(`/${locale}/collections`);
      await expect(
        page.getByRole("heading", { level: 1, name: labels.collections, exact: true }),
      ).toBeVisible();
      await page.getByLabel(labels.collectionName).fill("Pokémon");
      await page.getByLabel(labels.visibility).selectOption("PRIVATE");
      const collectionCreated = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/v1/collections") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: labels.createCollection }).click();
      expect((await collectionCreated).status()).toBe(201);
      await page.getByRole("link", { name: `Pokémon ${labels.private}`, exact: true }).click();

      await page.getByLabel(labels.subcollectionName).fill("Base Set");
      const nodeCreated = page.waitForResponse(
        (response) => response.url().endsWith("/nodes") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: labels.createSubcollection }).click();
      expect((await nodeCreated).status()).toBe(201);
      await expectTreeItem(page, "Base Set");
      const hierarchy = page.getByRole("region", { name: labels.hierarchy, exact: true });
      await expect.soft(hierarchy.getByRole("list")).toBeVisible();
      const nodeDisclosure = hierarchy.getByText("Base Set", { exact: true });
      await nodeDisclosure.focus();
      await page.keyboard.press("Enter");
      await expect(nodeDisclosure.locator("..")).toHaveAttribute("open", "");

      await page.getByLabel(labels.customFieldName).fill("Edition");
      await page.getByLabel(labels.customFieldType).selectOption({ label: labels.shortText });
      await page.getByRole("button", { name: labels.createCustomField }).click();
      await expect(page.getByText("Edition", { exact: true })).toBeVisible();

      const locationSection = page
        .getByRole("heading", { name: labels.createLocation, exact: true })
        .locator("..");
      const createLocation = async (name: string, type: string, parent?: string) => {
        await locationSection.getByLabel(labels.locationName, { exact: true }).fill(name);
        await locationSection.getByLabel(labels.locationType, { exact: true }).selectOption({
          label: type,
        });
        if (parent) {
          await locationSection
            .getByLabel(labels.locationParent, { exact: true })
            .selectOption({ label: parent });
        }
        const locationCreated = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/v1/locations") && response.request().method() === "POST",
        );
        await locationSection.getByRole("button", { name: labels.createLocation }).click();
        expect((await locationCreated).status()).toBe(201);
        await expectTreeItem(page, name);
      };
      await createLocation("Wohnzimmer", labels.room);
      await createLocation("Vitrine", labels.cabinet, "Wohnzimmer");
      await createLocation("Fach 2", labels.shelf, "Vitrine");

      const addItemLink = page.getByRole("link", { name: labels.addItem });
      const addItemHref = await addItemLink.getAttribute("href");
      if (!addItemHref) throw new Error("Add-item link has no destination");
      const addItemUrl = new URL(addItemHref, page.url()).toString();
      await addItemLink.click();
      await expect(page).toHaveURL(addItemUrl);
      await expect(
        page.getByRole("heading", { level: 1, name: labels.addItem, exact: true }),
      ).toBeVisible();
      await page.getByLabel(labels.node).selectOption({ label: "Base Set" });
      await page.getByLabel(labels.title).fill("Glurak");
      await page.getByLabel(labels.publicDescription).fill("Holographic card");
      await page.getByLabel(labels.privateNotes).fill("Kept in a protective sleeve");
      await page.getByLabel(labels.unitPrice).fill("12.34");
      await page.getByLabel(labels.currency).selectOption("EUR");
      await page.getByLabel(labels.tags).fill("holo, favorite");
      await page.getByText(labels.identifiers, { exact: true }).click();
      await page.getByLabel(labels.identifierType).selectOption("EAN");
      await page.getByRole("button", { name: labels.scanStart }).click();
      await expect(page.getByText(labels.scanProposal)).toBeVisible();
      await expect(page.getByLabel(labels.identifierValue)).toHaveValue("");
      await page.getByRole("button", { name: labels.scanConfirm }).click();
      await expect(page.getByLabel(labels.identifierValue)).toHaveValue("9783161484100");
      await page.getByLabel(labels.identifierValue).fill("4006381333931");
      const editionField = page
        .locator(".custom-field")
        .filter({ has: page.getByLabel("Edition", { exact: true }) });
      await editionField
        .getByRole("checkbox", { name: labels.setCustomField, exact: true })
        .check();
      await editionField.getByLabel("Edition", { exact: true }).fill("1st");
      await page.getByLabel(labels.location).selectOption({ label: "Fach 2" });
      const itemCreated = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/v1/items") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: labels.saveItem }).click();
      const itemCreatedResponse = await itemCreated;
      expect(itemCreatedResponse.status()).toBe(201);
      const createdItemBody = (await itemCreatedResponse.json()) as { item: { id: string } };
      await expect(page).toHaveURL(new RegExp(`/${locale}/items/${createdItemBody.item.id}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: "Glurak", exact: true }),
      ).toBeVisible();
      const savedDetails = page.getByRole("region", { name: labels.savedDetails });
      await expect(savedDetails.getByText("Edition: 1st", { exact: true })).toBeVisible();
      await expect(savedDetails.getByText("Fach 2", { exact: true })).toBeVisible();
      await expect(savedDetails.getByText("4006381333931", { exact: true })).toBeVisible();

      await page.getByLabel(labels.title).fill("Glurak – edited");
      await page.getByRole("button", { name: labels.saveItem }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Glurak – edited", exact: true }),
      ).toBeVisible();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: labels.archive }).click();
      await expect(page.getByText(labels.archivedMessage)).toBeVisible();
      await expect(page.getByRole("button", { name: labels.saveItem })).toBeDisabled();
    } finally {
      await prisma.itemLocationHistory.deleteMany({ where: { assignedById: collector.userId } });
      await prisma.user.deleteMany({ where: { id: collector.userId } });
    }
  });
});
