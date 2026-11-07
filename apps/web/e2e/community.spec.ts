import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createCommentService } from "@sammlerraum/domain/community/comment-service";
import { createNotificationService } from "@sammlerraum/domain/notifications/notification-service";
import { hashPassword } from "better-auth/crypto";
import { credentialRateLimitFixture } from "./support/credential-rate-limit-fixture";
const enabled = process.env.RUN_AUTH_E2E === "1",
  databaseUrl = process.env.DATABASE_URL ?? "",
  origin = "http://localhost:3000";
if (enabled && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw Error("Owned community UI database required");
for (const locale of ["de", "en"] as const)
  test(`${locale}: complete community, private wishes, notifications and moderator journey`, async ({
    page,
  }, testInfo) => {
    test.skip(!enabled, "Owned native credentials only");
    test.setTimeout(120000);
    const db = createPrismaClient(databaseUrl),
      ids = [randomUUID(), randomUUID()],
      password = "own-community-ui-fixture-password",
      prefix = randomUUID().slice(0, 8);
    let address: Awaited<ReturnType<typeof credentialRateLimitFixture>> | undefined;
    const extraIds: string[] = [];
    const labels =
      locale === "de"
        ? {
            heading: "Gemeinsam mehr entdecken.",
            follow: "Folgen",
            following: "Folge ich",
            favorite: "Favorit",
            favored: "Gemerkt",
            comments: "Kommentare",
            send: "Kommentar senden",
            commentBody: "Dein Kommentar",
            reply: "Antworten",
            report: "Kommentar melden",
            reason: "Begründung",
            submitReport: "Meldung senden",
            block: "Nutzer blockieren",
            blocks: "Blockierte Nutzer",
            unblock: "Blockierung aufheben",
            wishNav: "Wunschliste",
            wishTitle: "Ein Wunsch für deine Sammlung.",
            wishName: "Was suchst du?",
            budget: "Wunschpreis",
            notes: "Private Notizen",
            createWish: "Wunsch speichern",
            fulfill: "Als erfüllt markieren",
            fulfilled: "Erfüllt",
            dupes: "Dubletten vergleichen",
            markDupe: "Als Dublette markieren",
            unmarkDupe: "Verknüpfung entfernen",
            noticeNav: "Mitteilungen",
            noticeTitle: "Alles Wichtige an einem Ort.",
            readAll: "Alle als gelesen markieren",
            savePrefs: "Einstellungen speichern",
            moderationTitle: "Mit Sorgfalt moderieren.",
            review: "Beitrag prüfen",
            hide: "Plattformweit ausblenden",
            resolve: "Prüfung abschließen",
            itemPolicy: "Für dieses Objekt",
          }
        : {
            heading: "Discover more together.",
            follow: "Follow",
            following: "Following",
            favorite: "Favorite",
            favored: "Saved",
            comments: "Comments",
            send: "Send comment",
            commentBody: "Your comment",
            reply: "Reply",
            report: "Report comment",
            reason: "Reason",
            submitReport: "Send report",
            block: "Block user",
            blocks: "Blocked users",
            unblock: "Unblock",
            wishNav: "Wishlist",
            wishTitle: "A wish for your collection.",
            wishName: "What are you looking for?",
            budget: "Target price",
            notes: "Private notes",
            createWish: "Save wish",
            fulfill: "Mark fulfilled",
            fulfilled: "Fulfilled",
            dupes: "Compare duplicates",
            markDupe: "Mark as duplicate",
            unmarkDupe: "Remove link",
            noticeNav: "Notifications",
            noticeTitle: "Everything important, in one place.",
            readAll: "Mark all read",
            savePrefs: "Save preferences",
            moderationTitle: "Moderate with care.",
            review: "Review comment",
            hide: "Hide across the platform",
            resolve: "Complete review",
            itemPolicy: "For this item",
          };
    try {
      for (const id of ids)
        await db.user.create({
          data: {
            id,
            name: "Own community UI fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
            profile: {
              create: {
                handle: `u_${id.replaceAll("-", "").slice(0, 20)}`,
                displayName: id === ids[0] ? "Mira Collector" : "Theo Collector",
              },
            },
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
      const viewer = ids[0]!,
        owner = ids[1]!,
        foreignCollection = await db.collection.create({
          data: { ownerId: owner, name: `Public shelf ${prefix}`, visibility: "PUBLIC" },
        }),
        ownedCollection = await db.collection.create({
          data: { ownerId: viewer, name: `Private shelf ${prefix}` },
        }),
        publicOwned = await db.collection.create({
          data: { ownerId: viewer, name: `My public shelf ${prefix}`, visibility: "PUBLIC" },
        });
      const foreignItem = await createItemService(db, owner).createItem({
        collectionId: foreignCollection.id,
        title: `Atlas ${prefix}`,
        visibility: "PUBLIC",
        tradeStatus: "OPEN_TO_TRADE",
        privateNotes: "never-community-ui-private",
      });
      const ownedItem = await createItemService(db, viewer).createItem({
        collectionId: publicOwned.id,
        title: `My book ${prefix}`,
        visibility: "PUBLIC",
      });
      const copies = [];
      for (let i = 0; i < 2; i++)
        copies.push(
          await createItemService(db, viewer).createItem({
            collectionId: ownedCollection.id,
            title: `First edition ${prefix}`,
            quantity: 1,
          }),
        );
      const reportedComment = await createCommentService(db).createComment(
        { userId: owner },
        { target: { type: "ITEM", id: foreignItem.id }, body: `Public collector note ${prefix}` },
      );
      await createNotificationService(db).createNotificationOnce({
        recipientId: viewer,
        actorId: owner,
        eventKey: `comment:${reportedComment.id}`,
        type: "COMMENT_RECEIVED",
        target: { type: "ITEM", id: ownedItem.id },
      });
      await createNotificationService(db).createNotificationOnce({
        recipientId: viewer,
        eventKey: `security:${randomUUID()}`,
        type: "SECURITY_ALERT",
        target: { type: "ACCOUNT", id: viewer },
      });
      address = await credentialRateLimitFixture(db);
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            headers: { origin, "x-forwarded-for": address.ip },
            data: { email: `${viewer}@example.invalid`, password },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`/${locale}/community`);
      await expect(page.getByRole("heading", { name: labels.heading, exact: true })).toBeVisible({
        timeout: 3000,
      });
      const skip = page.locator(".skip-link");
      await skip.focus();
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Tab");
      await expect(skip).not.toBeInViewport();
      const card = page.getByTestId(`feed-${foreignItem.id}`);
      await expect(card).toBeVisible();
      await expect(page.locator("body")).not.toContainText("never-community-ui-private");
      await card.getByRole("button", { name: labels.follow, exact: true }).click();
      await expect(card.getByRole("button", { name: labels.following, exact: true })).toBeVisible();
      await card.getByRole("button", { name: labels.favorite, exact: true }).click();
      await expect(card.getByRole("button", { name: labels.favored, exact: true })).toBeVisible();
      await page
        .getByRole("button", {
          name: locale === "de" ? "Gemerkte Objekte" : "Saved items",
          exact: true,
        })
        .click();
      await expect(card).toBeVisible();
      await page
        .getByRole("button", { name: locale === "de" ? "Entdecken" : "Discover", exact: true })
        .click();
      await card.getByRole("button", { name: labels.comments, exact: true }).click();
      await card
        .getByLabel(labels.commentBody, { exact: true })
        .fill(`Own public comment ${prefix}`);
      await card.getByRole("button", { name: labels.send, exact: true }).click();
      await expect(card.getByText(`Own public comment ${prefix}`, { exact: true })).toBeVisible();
      const seeded = card.getByTestId(`comment-${reportedComment.id}`);
      await seeded.getByRole("button", { name: labels.reply, exact: true }).click();
      await card.getByLabel(labels.commentBody, { exact: true }).fill(`Own reply ${prefix}`);
      await card.getByRole("button", { name: labels.send, exact: true }).click();
      await expect(card.getByText(`Own reply ${prefix}`, { exact: true })).toBeVisible();
      await seeded.getByRole("button", { name: labels.report, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(labels.reason, { exact: true }).fill(`Own careful review ${prefix}`);
      await dialog.getByRole("button", { name: labels.submitReport, exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const mine = page.getByTestId(`feed-${ownedItem.id}`);
      await mine.getByRole("button", { name: labels.comments, exact: true }).click();
      await mine.getByLabel(labels.commentBody, { exact: true }).fill("Owned policy draft");
      await expect(mine.getByRole("button", { name: labels.send, exact: true })).toBeEnabled();
      await mine.getByLabel(labels.itemPolicy, { exact: true }).uncheck();
      await expect(mine.getByLabel(labels.itemPolicy, { exact: true })).toBeEnabled();
      await expect(mine.getByRole("button", { name: labels.send, exact: true })).toBeDisabled();
      await mine.getByLabel(labels.itemPolicy, { exact: true }).check();
      await expect(mine.getByLabel(labels.itemPolicy, { exact: true })).toBeEnabled();
      await expect(mine.getByRole("button", { name: labels.send, exact: true })).toBeEnabled();
      await mine.getByLabel(labels.commentBody, { exact: true }).fill("");
      const reportDir =
        "../../.superpowers/sdd/2026-09-19-10-community-moderation-notifications/reports";
      await mkdir(reportDir, { recursive: true });
      await page.screenshot({
        path: `${reportDir}/task-7-community-${locale}-${testInfo.project.name}.png`,
        fullPage: true,
      });
      await card.getByRole("button", { name: labels.block, exact: true }).click();
      await expect(card).not.toBeVisible();
      extraIds.push(...Array.from({ length: 21 }, () => randomUUID()));
      await db.user.createMany({
        data: extraIds.map((id) => ({
          id,
          name: "Own blocked fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
        })),
      });
      await db.userBlock.createMany({
        data: extraIds.map((id) => ({ blockerId: viewer, blockedId: id })),
      });
      await page.getByRole("button", { name: labels.blocks, exact: true }).click();
      await page
        .getByRole("button", { name: locale === "de" ? "Mehr laden" : "Load more", exact: true })
        .click();
      await expect(page.locator('[data-testid^="blocked-"]')).toHaveCount(22);
      await page
        .getByTestId(`blocked-${owner}`)
        .getByRole("button", { name: labels.unblock, exact: true })
        .click();
      await expect(page.getByTestId(`feed-${foreignItem.id}`)).toBeVisible();
      await page
        .getByRole("navigation", { name: "Community" })
        .getByRole("link", { name: labels.wishNav, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: labels.wishTitle, exact: true }),
      ).toBeVisible();
      await page.getByLabel(labels.wishName, { exact: true }).fill(`Missing volume ${prefix}`);
      await page.getByLabel(labels.budget, { exact: true }).fill("19.95");
      await page.getByLabel(labels.notes, { exact: true }).fill("Private collecting wish");
      await page.getByRole("button", { name: labels.createWish, exact: true }).click();
      const wish = page.getByTestId("wishlist-entry").filter({
        has: page.getByRole("heading", { name: `Missing volume ${prefix}`, exact: true }),
      });
      await expect(wish).toBeVisible();
      await expect(wish).toContainText(locale === "de" ? "19,95" : "19.95");
      await wish.getByRole("button", { name: labels.fulfill, exact: true }).click();
      await expect(wish).toContainText(labels.fulfilled);
      await page.screenshot({
        path: `${reportDir}/task-7-wishlist-${locale}-${testInfo.project.name}.png`,
        fullPage: true,
      });
      await page.goto(`/${locale}/items/${copies[0]!.id}`);
      await page.getByRole("link", { name: labels.dupes, exact: true }).click();
      const duplicate = page.getByTestId(`duplicate-${copies[1]!.id}`);
      await duplicate.getByRole("button", { name: labels.markDupe, exact: true }).click();
      await expect(
        duplicate.getByRole("button", { name: labels.unmarkDupe, exact: true }),
      ).toBeVisible();
      expect(await db.duplicateRelation.count({ where: { ownerId: viewer } })).toBe(1);
      expect(
        await db.collectibleItem.findMany({
          where: { id: { in: copies.map((i) => i.id) } },
          select: { quantity: true },
        }),
      ).toEqual([{ quantity: 1 }, { quantity: 1 }]);
      await page
        .getByRole("navigation", { name: "Community" })
        .getByRole("link", { name: labels.noticeNav, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: labels.noticeTitle, exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: labels.readAll, exact: true }).click();
      await expect(page.getByRole("button", { name: labels.readAll, exact: true })).toBeDisabled();
      await page.getByRole("button", { name: labels.savePrefs, exact: true }).click();
      await page.screenshot({
        path: `${reportDir}/task-7-notifications-${locale}-${testInfo.project.name}.png`,
        fullPage: true,
      });
      expect((await page.request.get("/api/v1/moderation/reports")).status()).toBe(403);
      await db.applicationRoleGrant.create({
        data: {
          userId: viewer,
          role: "MODERATOR",
          grantedBy: "owned-community-ui-test",
          reason: "Synthetic moderation fixture",
        },
      });
      await page.goto(`/${locale}/community/moderation`);
      await expect(
        page.getByRole("heading", { name: labels.moderationTitle, exact: true }),
      ).toBeVisible();
      const report = page
        .getByTestId("moderation-report")
        .filter({ hasText: `Own careful review ${prefix}` });
      await report.getByRole("button", { name: labels.review, exact: true }).click();
      await expect(page.getByTestId("moderation-review")).toContainText(
        `Public collector note ${prefix}`,
      );
      await page
        .getByTestId("moderation-review")
        .getByLabel(labels.reason, { exact: true })
        .fill("Own reasoned decision");
      await page.getByRole("button", { name: labels.hide, exact: true }).click();
      await page.getByRole("button", { name: labels.resolve, exact: true }).click();
      await expect(report).not.toBeVisible();
      await page.screenshot({
        path: `${reportDir}/task-7-moderation-${locale}-${testInfo.project.name}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    } finally {
      await db.applicationRoleGrant.deleteMany({ where: { userId: { in: ids } } });
      await db.communityReport.deleteMany({ where: { reporterId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: [...ids, ...extraIds] } } });
      await address?.cleanup();
      await db.$disconnect();
    }
  });
