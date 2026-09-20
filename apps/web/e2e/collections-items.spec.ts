import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

const runManagementE2E = process.env.RUN_AUTH_E2E === "1";
const mailboxPath = "/tmp/sammlerraum-auth-e2e-mailbox.json";

type Locale = "de" | "en";
type Mailbox = Record<string, { subject: string; url: string }>;

const copy = {
  de: {
    collectionName: "Name der Sammlung",
    collections: "Sammlungen",
    createCollection: "Sammlung anlegen",
    subcollectionName: "Name der Teilsammlung",
    createSubcollection: "Teilsammlung anlegen",
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
    register: "Registrieren",
    signIn: "Anmelden",
    checkEmail: "Prüfe jetzt dein E-Mail-Postfach.",
  },
  en: {
    collectionName: "Collection name",
    collections: "Collections",
    createCollection: "Create collection",
    subcollectionName: "Subcollection name",
    createSubcollection: "Create subcollection",
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
    register: "Register",
    signIn: "Sign in",
    checkEmail: "Check your email inbox now.",
  },
} as const;

function localeFor(testInfo: TestInfo): Locale {
  return testInfo.project.name === "mobile" ? "en" : "de";
}

async function verificationUrlFor(email: string): Promise<string> {
  await expect
    .poll(async () => {
      try {
        const mailbox = JSON.parse(await readFile(mailboxPath, "utf8")) as Mailbox;
        return mailbox[email]?.url;
      } catch {
        return undefined;
      }
    })
    .toBeTruthy();
  const mailbox = JSON.parse(await readFile(mailboxPath, "utf8")) as Mailbox;
  return mailbox[email]!.url;
}

async function loginTestCollector(page: Page, locale: Locale) {
  const labels = copy[locale];
  const email = `collections-browser-${randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";

  await page.goto(`/${locale}/register`);
  await page.getByLabel("Name").fill("Test Collector");
  await page.getByLabel(labels.email).fill(email);
  await page.getByLabel(labels.password).fill(password);
  await page.getByRole("button", { name: labels.register }).click();
  await expect(page.getByText(labels.checkEmail)).toBeVisible();
  await page.goto(await verificationUrlFor(email));

  await page.goto(`/${locale}/login`);
  await page.getByLabel(labels.email).fill(email);
  await page.getByLabel(labels.password).fill(password);
  await page.getByRole("button", { name: labels.signIn, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account/profile$`));
}

test.describe("localized collection and item management", () => {
  test.skip(!runManagementE2E, "requires the migrated PostgreSQL database and Chromium");

  test("collector creates a nested collection and item with custom field and location", async ({
    page,
  }, testInfo) => {
    const locale = localeFor(testInfo);
    const labels = copy[locale];
    await loginTestCollector(page, locale);

    await page.goto(`/${locale}/collections`);
    await expect(page.getByRole("heading", { name: labels.collections })).toBeVisible();
    await page.getByLabel(labels.collectionName).fill("Pokémon");
    await page.getByLabel(labels.visibility).selectOption("PRIVATE");
    await page.getByRole("button", { name: labels.createCollection }).click();
    await page.getByRole("link", { name: "Pokémon" }).click();

    await page.getByLabel(labels.subcollectionName).fill("Base Set");
    await page.getByRole("button", { name: labels.createSubcollection }).click();
    await expect(page.getByRole("treeitem", { name: "Base Set" })).toBeVisible();

    await page.getByLabel(labels.customFieldName).fill("Edition");
    await page.getByLabel(labels.customFieldType).selectOption({ label: labels.shortText });
    await page.getByRole("button", { name: labels.createCustomField }).click();
    await expect(page.getByText("Edition", { exact: true })).toBeVisible();

    const createLocation = async (name: string, type: string, parent?: string) => {
      await page.getByLabel(labels.locationName).fill(name);
      await page.getByLabel(labels.locationType).selectOption({ label: type });
      if (parent) await page.getByLabel(labels.locationParent).selectOption({ label: parent });
      await page.getByRole("button", { name: labels.createLocation }).click();
      await expect(page.getByRole("treeitem", { name })).toBeVisible();
    };
    await createLocation("Wohnzimmer", labels.room);
    await createLocation("Vitrine", labels.cabinet, "Wohnzimmer");
    await createLocation("Fach 2", labels.shelf, "Vitrine");

    await page.getByRole("link", { name: labels.addItem }).click();
    await page.getByLabel(labels.node).selectOption({ label: "Base Set" });
    await page.getByLabel(labels.title).fill("Glurak");
    await page.getByLabel(labels.publicDescription).fill("Holographic card");
    await page.getByLabel(labels.privateNotes).fill("Kept in a protective sleeve");
    await page.getByLabel(labels.unitPrice).fill("12.34");
    await page.getByLabel(labels.currency).selectOption("EUR");
    await page.getByLabel(labels.tags).fill("holo, favorite");
    await page.getByLabel(labels.identifierType).selectOption("EAN");
    await page.getByLabel(labels.identifierValue).fill("4006381333931");
    await page.getByLabel("Edition").fill("1st");
    await page.getByLabel(labels.location).selectOption({ label: "Fach 2" });
    await page.getByRole("button", { name: labels.saveItem }).click();

    await expect(page.getByRole("heading", { name: "Glurak" })).toBeVisible();
    await expect(page.getByText("Edition: 1st")).toBeVisible();
    await expect(page.getByText("Fach 2", { exact: true })).toBeVisible();
    await expect(page.getByText("4006381333931", { exact: true })).toBeVisible();
  });
});
