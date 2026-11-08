import { createCollaborativeCollectionService } from "@sammlerraum/domain/collaboration/collection-authoring-service";
import { createMembershipService } from "@sammlerraum/domain/collaboration/membership-service";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { test, expect, type BrowserContext } from "@playwright/test";
import { credentialRateLimitFixture } from "./support/credential-rate-limit-fixture";
const enabled = process.env.RUN_AUTH_E2E === "1",
  databaseUrl = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw Error("Owned management UI database required");
async function signIn(
  db: ReturnType<typeof createPrismaClient>,
  context: BrowserContext,
  name: string,
) {
  const id = randomUUID(),
    password = "own-management-ui-password",
    address = await credentialRateLimitFixture(db);
  try {
    await db.user.create({
      data: {
        id,
        name,
        email: `${id}@example.invalid`,
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
      },
    });
    expect(
      (
        await context.request.post("http://localhost:3000/api/auth/sign-in/email", {
          headers: { origin: "http://localhost:3000", "x-forwarded-for": address.ip },
          data: { email: `${id}@example.invalid`, password },
        })
      ).status(),
    ).toBe(200);
    return {
      id,
      email: `${id}@example.invalid`,
      cleanup: async () => {
        await db.user.deleteMany({ where: { id } });
        await address.cleanup();
      },
    };
  } catch (error) {
    await db.user.deleteMany({ where: { id } });
    await address.cleanup();
    throw error;
  }
}
for (const locale of ["de", "en"] as const) {
  test(`${locale} invitation acceptance, actual role changes and member removal work through the UI`, async ({
    page,
    context,
    browser,
  }, testInfo) => {
    test.skip(!enabled, "Own local sessions only");
    const db = createPrismaClient(databaseUrl),
      recipientContext = await browser.newContext(),
      owner = await signIn(db, context, "Owner test account"),
      recipient = await signIn(db, recipientContext, "Invited collector");
    try {
      const c = await db.collection.create({
        data: {
          ownerId: owner.id,
          name: locale === "de" ? "Gemeinsam sammeln" : "Collecting together",
        },
      });
      await page.goto(`/${locale}/collections/${c.id}/members`);
      await page
        .getByLabel(locale === "de" ? "E-Mail-Adresse" : "Email address", { exact: true })
        .fill(recipient.email);
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
      const recipientPage = await recipientContext.newPage();
      await recipientPage.goto(await link.inputValue());
      await recipientPage
        .getByRole("button", {
          name: locale === "de" ? "Einladung annehmen" : "Accept invitation",
          exact: true,
        })
        .click();
      await expect(recipientPage.getByRole("status")).toContainText(
        locale === "de" ? "beigetreten" : "joined",
      );
      await recipientPage
        .getByRole("link", {
          name:
            locale === "de" ? "Mitglieder und deine Rolle ansehen" : "View members and your role",
        })
        .click();
      await expect(
        recipientPage.getByText(locale === "de" ? "Deine Rolle: Leser" : "Your role: Viewer", {
          exact: true,
        }),
      ).toBeVisible();
      await page.reload();
      const role = page.getByLabel(
        `${locale === "de" ? "Rolle ändern" : "Change role"} Invited collector`,
        { exact: true },
      );
      await role.selectOption("EDITOR");
      await expect(page.getByRole("status")).toContainText(
        locale === "de" ? "aktualisiert" : "updated",
      );
      await recipientPage.reload();
      await expect(
        recipientPage.getByText(locale === "de" ? "Deine Rolle: Bearbeiter" : "Your role: Editor", {
          exact: true,
        }),
      ).toBeVisible();
      const dir = resolve(
        process.cwd(),
        "../../.superpowers/sdd/2026-09-19-09-collaboration-sharing-audit/reports",
      );
      await mkdir(dir, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: resolve(dir, `task-7-members-${locale}-${testInfo.project.name}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: locale === "de" ? "Mitglied entfernen" : "Remove member",
          exact: true,
        })
        .click();
      await expect
        .poll(() =>
          db.collectionMember.count({ where: { collectionId: c.id, userId: recipient.id } }),
        )
        .toBe(0);
      await recipientPage.reload();
      await expect(recipientPage.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(
        recipientPage.getByRole("heading", {
          name: locale === "de" ? "Aktuelle Mitglieder" : "Current members",
          exact: true,
        }),
      ).not.toBeVisible();
    } finally {
      await recipientContext.close();
      await owner.cleanup();
      await recipient.cleanup();
      await db.$disconnect();
    }
  });
  test(`${locale} audit comparison restores a selected field and rejects a stale confirmation`, async ({
    page,
    context,
  }, testInfo) => {
    test.skip(!enabled, "Own local sessions only");
    const db = createPrismaClient(databaseUrl),
      owner = await signIn(db, context, "Own audit UI account");
    try {
      const c = await db.collection.create({
          data: { ownerId: owner.id, name: "Audit UI collection" },
        }),
        items = createItemService(db, owner.id),
        item = await items.createItem({
          collectionId: c.id,
          title: locale === "de" ? "Keramikvase" : "Ceramic vase",
        });
      await items.updateItem(item.id, { visibility: "PUBLIC" });
      await page.goto(`/${locale}/audit?resourceType=ITEM&resourceId=${item.id}`);
      await page
        .getByRole("button", {
          name: locale === "de" ? "Änderung prüfen" : "Inspect change",
          exact: true,
        })
        .first()
        .click();
      await expect(
        page.getByRole("heading", {
          name: locale === "de" ? "Wiederherstellung prüfen" : "Inspect restoration",
          exact: true,
        }),
      ).toBeVisible();
      const dir = resolve(
        process.cwd(),
        "../../.superpowers/sdd/2026-09-19-09-collaboration-sharing-audit/reports",
      );
      await mkdir(dir, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: resolve(dir, `task-7-audit-${locale}-${testInfo.project.name}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: locale === "de" ? "Wiederherstellung bestätigen" : "Confirm restoration",
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toContainText(
        locale === "de" ? "wiederhergestellt" : "restored",
      );
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).visibility,
      ).toBe("PRIVATE");
      await items.updateItem(item.id, { visibility: "PUBLIC" });
      await page.reload();
      await page
        .getByRole("button", {
          name: locale === "de" ? "Änderung prüfen" : "Inspect change",
          exact: true,
        })
        .first()
        .click();
      await expect(
        page.getByRole("button", {
          name: locale === "de" ? "Wiederherstellung bestätigen" : "Confirm restoration",
          exact: true,
        }),
      ).toBeVisible();
      await items.updateItem(item.id, { title: "A newer concurrent title" });
      await page
        .getByRole("button", {
          name: locale === "de" ? "Wiederherstellung bestätigen" : "Confirm restoration",
          exact: true,
        })
        .click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        locale === "de" ? "Stand hat sich geändert" : "state changed",
      );
      expect(await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
        visibility: "PUBLIC",
        title: "A newer concurrent title",
      });
      expect(
        await db.auditEvent.count({
          where: { resourceId: item.id, action: "ITEM_VISIBILITY_RESTORED" },
        }),
      ).toBe(1);
    } finally {
      await owner.cleanup();
      await db.$disconnect();
    }
  });

  test(`${locale} shared workspace discovers membership, preserves true Editor authorship and closes writes after demotion`, async ({
    page,
    context,
  }, testInfo) => {
    test.skip(!enabled, "Own local sessions only");
    const db = createPrismaClient(databaseUrl),
      editor = await signIn(db, context, "Actual Editor UI account"),
      owner = randomUUID();
    try {
      await db.user.create({
        data: {
          id: owner,
          name: "Own workspace Owner",
          email: `${owner}@example.invalid`,
          emailVerified: true,
        },
      });
      const c = await db.collection.create({
        data: { ownerId: owner, name: locale === "de" ? "Gemeinsames Atelier" : "Shared studio" },
      });
      await db.collectibleItem.create({
        data: {
          ownerId: owner,
          collectionId: c.id,
          title: locale === "de" ? "Bestehende Vase" : "Existing vase",
          privateNotes: "never-workspace-browser-private",
          purchaseAmountMinor: 456n,
          purchaseCurrency: "EUR",
        },
      });
      const members = createMembershipService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: editor.id, role: "EDITOR", expectedRevision: 0 },
      );
      await page.goto(`/${locale}/collections`);
      await page.getByRole("link", { name: new RegExp(c.name) }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: c.name, exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("navigation", {
            name: locale === "de" ? "Zusammenarbeit und Freigaben" : "Collaboration and sharing",
          })
          .getByRole("link", { name: locale === "de" ? "Freigaben" : "Sharing", exact: true }),
      ).not.toBeVisible();
      await expect(page.locator("main")).not.toContainText("never-workspace-browser-private");
      await expect(page.locator("main")).not.toContainText("456");
      const title = locale === "de" ? "Vom Bearbeiter erfasste Schale" : "Bowl entered by Editor";
      await page.getByLabel(locale === "de" ? "Titel" : "Title", { exact: true }).fill(title);
      await page.getByLabel(locale === "de" ? "Stückzahl" : "Quantity", { exact: true }).fill("2");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Objekt speichern" : "Save item",
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toContainText(
        locale === "de" ? "gespeichert" : "saved",
      );
      const created = await db.collectibleItem.findFirstOrThrow({
        where: { collectionId: c.id, title },
      });
      expect(created.ownerId).toBe(owner);
      expect(
        await db.auditEvent.findFirstOrThrow({
          where: { resourceId: created.id, action: "ITEM_CREATED" },
        }),
      ).toMatchObject({ actorId: editor.id, source: "USER" });
      await page
        .getByRole("listitem")
        .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
        .getByRole("button", {
          name: locale === "de" ? "Objekt bearbeiten" : "Edit item",
          exact: true,
        })
        .click();
      await page
        .getByLabel(locale === "de" ? "Titel" : "Title", { exact: true })
        .fill(title + " · 2");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Objekt speichern" : "Save item",
          exact: true,
        })
        .click();
      await expect(page.getByRole("heading", { name: title + " · 2", exact: true })).toBeVisible();
      expect(
        await db.auditEvent.findFirstOrThrow({
          where: { resourceId: created.id, action: "ITEM_DETAILS_CHANGED" },
        }),
      ).toMatchObject({ actorId: editor.id });
      const dir = resolve(
        process.cwd(),
        "../../.superpowers/sdd/2026-09-19-09-collaboration-sharing-audit/reports",
      );
      await mkdir(dir, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: resolve(dir, `task-7-workspace-${locale}-${testInfo.project.name}.png`),
        fullPage: true,
      });
      await members.changeRole(
        { userId: owner },
        { collectionId: c.id, userId: editor.id, role: "VIEWER", expectedRevision: 1 },
      );
      await page.reload();
      await expect(
        page.getByRole("button", {
          name: locale === "de" ? "Objekt speichern" : "Save item",
          exact: true,
        }),
      ).not.toBeVisible();
      await expect(
        page.getByText(
          locale === "de"
            ? "Du kannst diese Sammlung ansehen. Zum Bearbeiten brauchst du die Rolle Bearbeiter oder Administrator."
            : "You can view this collection. Editing requires the Editor or Admin role.",
          { exact: true },
        ),
      ).toBeVisible();
      await members.removeMember(
        { userId: owner },
        { collectionId: c.id, userId: editor.id, expectedRevision: 2 },
      );
      await page.reload();
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: title + " · 2", exact: true }),
      ).not.toBeVisible();
    } finally {
      await editor.cleanup();
      await db.user.deleteMany({ where: { id: owner } });
      await db.$disconnect();
    }
  });

  test(`${locale} stale node draft keeps its original confirmation after an item refresh`, async ({
    page,
    context,
  }) => {
    test.skip(!enabled, "Own stale draft sessions only");
    const db = createPrismaClient(databaseUrl),
      admin = await signIn(db, context, "Original node Admin"),
      owner = randomUUID();
    try {
      await db.user.create({
        data: {
          id: owner,
          name: "Other actual administrator",
          email: `${owner}@example.invalid`,
          emailVerified: true,
        },
      });
      const c = await db.collection.create({
        data: { ownerId: owner, name: "Draft confirmation collection" },
      });
      await createMembershipService(db).addMember(
        { userId: owner },
        { collectionId: c.id, userId: admin.id, role: "ADMIN", expectedRevision: 0 },
      );
      const other = createCollaborativeCollectionService(db, owner, c.id),
        node = await other.createNode({
          name: "Original node",
          visibility: "PRIVATE",
          parentId: null,
        });
      await page.goto(`/${locale}/collections/${c.id}/workspace`);
      await page
        .getByText(
          locale === "de"
            ? "Sammlung und Teilbereiche verwalten"
            : "Manage collection and subtrees",
          { exact: true },
        )
        .click();
      await page
        .getByRole("combobox", {
          name: locale === "de" ? "Teilbereich auswählen" : "Choose subtree",
          exact: true,
        })
        .selectOption(node.id);
      const name = page.getByLabel(locale === "de" ? "Name des Teilbereichs" : "Subtree name", {
        exact: true,
      });
      await name.fill("Unsaved old draft");
      await other.updateNode(node.id, { name: "Newer other administrator fact" });
      const title = page.getByLabel(locale === "de" ? "Titel" : "Title", { exact: true }),
        description = page.getByLabel(locale === "de" ? "Beschreibung" : "Description", {
          exact: true,
        });
      await expect(title).toHaveAttribute("maxlength", "200");
      await expect(description).toHaveAttribute("maxlength", "10000");
      await title.fill("Item used to refresh workspace");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Objekt speichern" : "Save item",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: "Item used to refresh workspace", exact: true }),
      ).toBeVisible();
      await expect(name).toHaveValue("Unsaved old draft");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Teilbereich speichern" : "Save subtree",
          exact: true,
        })
        .click();
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      expect((await db.collectionNode.findUniqueOrThrow({ where: { id: node.id } })).name).toBe(
        "Newer other administrator fact",
      );
      await expect(name).toHaveValue("Unsaved old draft");
      const choose = page.getByRole("combobox", {
        name: locale === "de" ? "Teilbereich auswählen" : "Choose subtree",
        exact: true,
      });
      await choose.selectOption("");
      await choose.selectOption(node.id);
      await expect(name).toHaveValue("Newer other administrator fact");
      await name.fill("Explicitly reopened node draft");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Teilbereich speichern" : "Save subtree",
          exact: true,
        })
        .click();
      await expect
        .poll(
          async () => (await db.collectionNode.findUniqueOrThrow({ where: { id: node.id } })).name,
        )
        .toBe("Explicitly reopened node draft");
    } finally {
      await admin.cleanup();
      await db.user.deleteMany({ where: { id: owner } });
      await db.$disconnect();
    }
  });
  test(`${locale} Admin changes collection and hierarchy with original authorship and loses those controls after demotion`, async ({
    page,
    context,
  }, testInfo) => {
    test.skip(!enabled, "Own local Admin sessions only");
    const db = createPrismaClient(databaseUrl),
      admin = await signIn(db, context, "Actual Admin UI account"),
      owner = randomUUID();
    try {
      await db.user.create({
        data: {
          id: owner,
          name: "Own Admin workspace Owner",
          email: `${owner}@example.invalid`,
          emailVerified: true,
        },
      });
      const c = await db.collection.create({ data: { ownerId: owner, name: "Admin workspace" } }),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: admin.id, role: "ADMIN", expectedRevision: 0 },
      );
      await page.goto(`/${locale}/collections/${c.id}/workspace`);
      await page
        .getByText(
          locale === "de"
            ? "Sammlung und Teilbereiche verwalten"
            : "Manage collection and subtrees",
          { exact: true },
        )
        .click();
      await page
        .getByLabel(locale === "de" ? "Name der Sammlung" : "Collection name", { exact: true })
        .fill("Actual Admin studio");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Sammlung speichern" : "Save collection",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Actual Admin studio", exact: true }),
      ).toBeVisible();
      await page
        .getByLabel(locale === "de" ? "Name des Teilbereichs" : "Subtree name", { exact: true })
        .fill("Admin shelf");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Teilbereich speichern" : "Save subtree",
          exact: true,
        })
        .click();
      await expect
        .poll(() => db.collectionNode.count({ where: { collectionId: c.id, name: "Admin shelf" } }))
        .toBe(1);
      await expect(
        page.getByRole("button", {
          name: locale === "de" ? "Teilbereich speichern" : "Save subtree",
          exact: true,
        }),
      ).toBeEnabled();
      const node = await db.collectionNode.findFirstOrThrow({
        where: { collectionId: c.id, name: "Admin shelf" },
      });
      await page
        .getByRole("combobox", {
          name: locale === "de" ? "Teilbereich auswählen" : "Choose subtree",
          exact: true,
        })
        .selectOption(node.id);
      await page
        .getByLabel(locale === "de" ? "Name des Teilbereichs" : "Subtree name", { exact: true })
        .fill("Admin renamed shelf");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Teilbereich speichern" : "Save subtree",
          exact: true,
        })
        .click();
      await expect
        .poll(
          async () => (await db.collectionNode.findUniqueOrThrow({ where: { id: node.id } })).name,
        )
        .toBe("Admin renamed shelf");
      expect(
        await db.auditEvent.findFirstOrThrow({
          where: { resourceId: c.id, action: "COLLECTION_DETAILS_CHANGED" },
        }),
      ).toMatchObject({ actorId: admin.id });
      expect(
        await db.auditEvent.findFirstOrThrow({
          where: { resourceId: node.id, action: "NODE_CREATED" },
        }),
      ).toMatchObject({ actorId: admin.id });
      await expect(
        page.getByRole("button", {
          name: locale === "de" ? "Teilbereich speichern" : "Save subtree",
          exact: true,
        }),
      ).toBeEnabled();
      const dir = resolve(
        process.cwd(),
        "../../.superpowers/sdd/2026-09-19-09-collaboration-sharing-audit/reports",
      );
      await mkdir(dir, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: resolve(dir, `task-7-admin-${locale}-${testInfo.project.name}.png`),
        fullPage: true,
      });
      await members.changeRole(
        { userId: owner },
        { collectionId: c.id, userId: admin.id, role: "EDITOR", expectedRevision: 1 },
      );
      await page.reload();
      await expect(
        page.getByText(
          locale === "de"
            ? "Sammlung und Teilbereiche verwalten"
            : "Manage collection and subtrees",
          { exact: true },
        ),
      ).not.toBeVisible();
      await expect(
        page.getByRole("button", {
          name: locale === "de" ? "Objekt speichern" : "Save item",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      await admin.cleanup();
      await db.user.deleteMany({ where: { id: owner } });
      await db.$disconnect();
    }
  });
}
