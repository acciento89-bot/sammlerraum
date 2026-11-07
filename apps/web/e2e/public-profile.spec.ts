import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { createItemService } from "@sammlerraum/domain/items/item-service";
const enabled = process.env.RUN_AUTH_E2E === "1",
  databaseUrl = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw Error("Owned profile test DB required");
for (const locale of ["de", "en"] as const)
  test(`${locale}: anonymous public profile collection and item privacy`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Owned compiled browser only");
    const db = createPrismaClient(databaseUrl),
      id = randomUUID(),
      handle = `collector-${id}`,
      slug = `collection-${randomUUID()}`;
    try {
      await db.user.create({
        data: {
          id,
          name: "Never expose login name",
          email: `${id}@example.invalid`,
          profile: {
            create: {
              handle,
              displayName: locale === "de" ? "Lenas Münzkabinett" : "Lena's coin cabinet",
              bio:
                locale === "de"
                  ? "Kleine Fundstücke mit großer Geschichte."
                  : "Small discoveries with a rich history.",
            },
          },
        },
      });
      const collection = await db.collection.create({
        data: {
          id: slug.slice(11),
          ownerId: id,
          name: locale === "de" ? "Münzen am Meer" : "Coins by the sea",
          visibility: "PUBLIC",
        },
      });
      await db.collection.create({
        data: { ownerId: id, name: "Never expose private collection", visibility: "PRIVATE" },
      });
      const items = createItemService(db, id);
      const item = await items.createItem({
        collectionId: collection.id,
        title: locale === "de" ? "Silbermünze mit Segelschiff" : "Silver coin with a sailing ship",
        publicDescription:
          locale === "de"
            ? "Ein sorgfältig bewahrtes Erinnerungsstück einer langen Reise."
            : "A carefully preserved keepsake of a long journey.",
        privateNotes: "Never expose private notes",
        visibility: "PUBLIC",
      });
      await items.createItem({
        collectionId: collection.id,
        title: "Never expose unlisted item",
        visibility: "UNLISTED",
      });
      const node = await db.collectionNode.create({
        data: { collectionId: collection.id, name: "Private ancestor", visibility: "PRIVATE" },
      });
      const hidden = await items.createItem({
        collectionId: collection.id,
        nodeId: node.id,
        title: "Never expose nested item",
        visibility: "PUBLIC",
      });
      const home = `/${locale}/@${handle}`,
        base = `${home}/${slug}`;
      const reports =
        "../../.superpowers/sdd/2026-09-19-10-community-moderation-notifications/reports";
      await mkdir(reports, { recursive: true });
      await page.goto(home);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        locale === "de" ? "Lenas Münzkabinett" : "Lena's coin cabinet",
      );
      await expect(page.locator("body")).not.toContainText("Never expose");
      expect(await page.locator("h1").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `${reports}/task-8-profile-${locale}-${info.project.name}.png`,
        fullPage: true,
      });
      await page.getByRole("link", { name: collection.name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${slug}$`));
      await expect(page.locator("body")).not.toContainText("Never expose");
      expect(await page.locator("h1").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true,
      );
      await expect(page.getByRole("link", { name: item.title, exact: true })).toBeVisible();
      await page.screenshot({
        path: `${reports}/task-8-collection-${locale}-${info.project.name}.png`,
        fullPage: true,
      });
      await page.getByRole("link", { name: item.title, exact: true }).click();
      await expect(page).toHaveURL(`${base}/items/${item.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(item.title);
      await expect(page.locator("body")).not.toContainText("Never expose");
      expect(await page.locator("h1").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `${reports}/task-8-item-${locale}-${info.project.name}.png`,
        fullPage: true,
      });
      await db.collection.update({
        where: { id: collection.id },
        data: { name: "Renamed public collection" },
      });
      await page.goto(base);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Renamed public collection");
      expect((await page.goto(`${base}/items/${hidden.id}`))?.status()).toBe(404);
      await db.collection.update({ where: { id: collection.id }, data: { visibility: "PRIVATE" } });
      expect((await page.goto(`${base}/items/${item.id}`))?.status()).toBe(404);
      expect((await page.goto(base))?.status()).toBe(404);
    } finally {
      await db.user.deleteMany({ where: { id } });
      await db.$disconnect();
    }
  });
