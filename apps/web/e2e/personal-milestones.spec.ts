import { expect, test } from "@playwright/test";
import { enabled, db } from "./support/search-fixture";
import {
  personalMilestoneFixture,
  cleanupPersonalMilestoneFixture,
} from "./support/personal-milestone-fixture";
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const) {
  test(`${locale}: actual authored milestones are discoverable independently in the collector dashboard`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page, [
      { title: "A real private milestone", milestoneDate: "0001-01-01" },
    ]);
    try {
      await page.goto(`/${locale}/dashboard`);
      await expect(page.getByTestId("dashboard-selection-rows")).toHaveText("1");
      await expect(
        page.getByRole("heading", {
          name: locale === "de" ? "Deine Meilensteine" : "Your milestones",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText("A real private milestone", { exact: true })).toBeVisible();
      await expect(page.getByText("0001-01-01", { exact: true })).toBeVisible();
    } finally {
      await cleanupPersonalMilestoneFixture(f);
    }
  });
}

import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { origin } from "./support/search-fixture";
import { PersonalMilestoneDtoSchema } from "@sammlerraum/contracts/personal-milestones";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
const copies = { de: de.Milestones, en: en.Milestones };
type Locale = "de" | "en";
const base = "/api/v1/dashboard/milestones";
const path = (url: string) => new URL(url).pathname;
const rows = (page: Page) => page.getByTestId("milestone-row");
const row = (page: Page, title: string) =>
  rows(page).filter({ has: page.getByRole("heading", { name: title, exact: true }) });
async function manager(page: Page, locale: Locale) {
  await page.goto(`/${locale}/milestones`);
  await expect(
    page.getByRole("heading", { name: copies[locale].title, exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("milestone-total")).toBeVisible();
}
async function fields(page: Page, locale: Locale, title: string, date: string) {
  await page.getByLabel(copies[locale].name, { exact: true }).fill(title);
  await page.getByLabel(copies[locale].enteredDate, { exact: true }).fill(date);
}
async function save(page: Page, locale: Locale, method = "POST") {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === method &&
      (method === "POST" ? path(r.url()) === base : path(r.url()).startsWith(base + "/")),
  );
  await page.getByRole("button", { name: copies[locale].save, exact: true }).click();
  const actual = await response;
  expect(actual.status()).toBe(method === "POST" ? 201 : 200);
  const saved = PersonalMilestoneDtoSchema.parse(await actual.json());
  await expect(page.getByTestId("milestone-ack")).toBeVisible();
  return saved;
}
async function shot(page: Page, locale: Locale, project: string, state: string) {
  await page.screenshot({
    path: resolve(
      `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-h3-${locale}-${project}-${state}.png`,
    ),
    fullPage: true,
  });
}
for (const locale of ["de", "en"] as const) {
  const c = copies[locale];
  test(`${locale}: preview is bounded and inventory filters do not filter personal milestones`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(
      page,
      Array.from({ length: 6 }, (_, n) => ({
        title: `Independent ${n}`,
        milestoneDate: `2026-11-0${n + 1}`,
      })),
    );
    let reads = 0;
    page.on("request", (req) => {
      if (path(req.url()) === base + "/query") reads++;
    });
    try {
      await page.goto(`/${locale}/dashboard`);
      await expect(page.getByTestId("milestone-total")).toContainText("6");
      await expect(rows(page)).toHaveCount(5);
      expect(reads).toBe(1);
      const s = (locale === "de" ? de : en).Search;
      if (await page.evaluate(() => matchMedia("(max-width:44rem)").matches)) {
        await expect(page.getByRole("button", { name: s.openFilters, exact: true })).toBeVisible();
        await page.getByRole("button", { name: s.openFilters, exact: true }).click();
      }
      await page.getByLabel(s.text, { exact: true }).fill("no-inventory-personal-filter");
      await page.getByRole("button", { name: s.apply, exact: true }).click();
      await expect(page.getByTestId("dashboard-selection-rows")).toHaveText("0");
      await expect(page.getByTestId("milestone-total")).toContainText("6");
      await expect(rows(page)).toHaveCount(5);
      expect(reads).toBe(1);
      expect(page.url()).not.toContain("no-inventory");
    } finally {
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: real create, same-value edit, date replacement and confirmed deletion keep plain text`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page);
    try {
      await manager(page, locale);
      await expect(page.getByText(c.empty, { exact: true })).toBeVisible();
      await shot(page, locale, info.project.name, "empty");
      await page.getByRole("button", { name: c.new, exact: true }).click();
      const title = "Personal <b>date</b> Cafe\u0301";
      await fields(page, locale, title, "0001-01-01");
      const created = await save(page, locale);
      await expect(row(page, created.title)).toBeVisible();
      await expect(rows(page).locator("b,img,script")).toHaveCount(0);
      expect(created.title).toBe("Personal <b>date</b> Café");
      await row(page, created.title)
        .getByRole("button", { name: c.editNamed.replace("{title}", created.title), exact: true })
        .click();
      const equal = await save(page, locale, "PATCH");
      expect(equal.revision).toBe(2);
      expect(equal.createdAt).toBe(created.createdAt);
      await row(page, created.title)
        .getByRole("button", { name: c.editNamed.replace("{title}", created.title), exact: true })
        .click();
      await fields(page, locale, "Changed milestone", "9999-12-31");
      const changed = await save(page, locale, "PATCH");
      expect(changed.revision).toBe(3);
      await expect(row(page, changed.title)).toContainText("9999-12-31");
      await shot(page, locale, info.project.name, "success");
      await row(page, changed.title)
        .getByRole("button", { name: c.deleteNamed.replace("{title}", changed.title), exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: c.deleteTitle, exact: true });
      await dialog.getByRole("button", { name: c.cancel, exact: true }).click();
      expect(await db!.personalMilestone.count({ where: { ownerId: f.ownerId } })).toBe(1);
      await row(page, changed.title)
        .getByRole("button", { name: c.deleteNamed.replace("{title}", changed.title), exact: true })
        .click();
      const deleted = page.waitForResponse(
        (r) => r.request().method() === "DELETE" && path(r.url()) === base + "/" + changed.id,
      );
      await dialog.getByRole("button", { name: c.delete, exact: true }).click();
      expect((await deleted).status()).toBe(200);
      await expect(rows(page)).toHaveCount(0);
      await expect(page.getByText(c.empty, { exact: true })).toBeVisible();
      expect(
        (await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).quantity,
      ).toBe(3);
    } finally {
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: real pagination, locale and browser Back keep the independent manager reachable`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(
      page,
      Array.from({ length: 27 }, (_, n) => ({
        title: `Paged milestone ${n + 1}`,
        milestoneDate: `2026-11-${String(n + 1).padStart(2, "0")}`,
      })),
    );
    try {
      await page.goto(`/${locale}/dashboard`);
      await expect(rows(page)).toHaveCount(5);
      const dashboard = page.url();
      await page.getByRole("link", { name: c.manage, exact: true }).click();
      await expect(rows(page)).toHaveCount(20);
      await expect(page.getByTestId("milestone-total")).toContainText("27");
      await page.getByRole("button", { name: c.next, exact: true }).click();
      await expect(rows(page)).toHaveCount(7);
      await expect(row(page, "Paged milestone 1")).toBeVisible();
      await page.getByRole("button", { name: c.first, exact: true }).click();
      await expect(rows(page)).toHaveCount(20);
      const other = locale === "de" ? "en" : "de";
      await page
        .getByRole("link", { name: locale === "de" ? "English" : "Deutsch", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${other}/milestones$`));
      await expect(
        page.getByRole("heading", { name: copies[other].title, exact: true, level: 1 }),
      ).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/${locale}/milestones$`));
      await page.goBack();
      await expect(page).toHaveURL(dashboard);
      await expect(page.getByTestId("milestone-total")).toContainText("27");
    } finally {
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: two actual writers preserve a conflicted draft until explicit fresh-state adoption`, async ({
    page,
    context,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page, [
        { title: "Original milestone", milestoneDate: "0001-01-01" },
      ]),
      other = await context.newPage();
    try {
      await manager(page, locale);
      await manager(other, locale);
      for (const target of [page, other])
        await row(target, "Original milestone")
          .getByRole("button", {
            name: c.editNamed.replace("{title}", "Original milestone"),
            exact: true,
          })
          .click();
      await page.getByLabel(c.name, { exact: true }).fill("First actual writer");
      await other.getByLabel(c.name, { exact: true }).fill("Second private draft");
      await save(page, locale, "PATCH");
      const conflict = other.waitForResponse((r) => r.request().method() === "PATCH");
      await other.getByRole("button", { name: c.save, exact: true }).click();
      expect((await conflict).status()).toBe(409);
      await expect(
        other.getByText(c.errors.conflict, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect(other.getByLabel(c.name, { exact: true })).toHaveValue("Second private draft");
      await expect(other.getByRole("button", { name: c.save, exact: true })).toBeDisabled();
      await other.getByRole("button", { name: c.inspect, exact: true }).click();
      await expect(other.getByRole("region", { name: c.latestTitle, exact: true })).toContainText(
        "First actual writer",
      );
      await other.getByRole("button", { name: c.adopt, exact: true }).click();
      await other
        .getByRole("dialog", { name: c.discardTitle, exact: true })
        .getByRole("button", { name: c.cancel, exact: true })
        .click();
      await expect(other.getByLabel(c.name, { exact: true })).toHaveValue("Second private draft");
      await other.getByRole("button", { name: c.adopt, exact: true }).click();
      await other
        .getByRole("dialog", { name: c.discardTitle, exact: true })
        .getByRole("button", { name: c.discard, exact: true })
        .click();
      await expect(other.getByLabel(c.name, { exact: true })).toHaveValue("First actual writer");
      await other.getByLabel(c.name, { exact: true }).fill("Deliberate new edit");
      expect((await save(other, locale, "PATCH")).revision).toBe(3);
    } finally {
      await other.close();
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  for (const operation of ["create", "update", "delete"] as const) {
    test(`${locale}: committed ${operation} response loss is retained without automatic replay`, async ({
      page,
    }, info) => {
      test.skip(!enabled, "Requires guarded auth database");
      const f = await personalMilestoneFixture(
        page,
        operation === "create"
          ? []
          : [{ title: "Original for uncertainty", milestoneDate: "0001-01-01" }],
      );
      let writes = 0;
      try {
        await manager(page, locale);
        const method =
          operation === "create" ? "POST" : operation === "update" ? "PATCH" : "DELETE";
        await page.route("**/api/v1/dashboard/milestones{,/**}", async (route) => {
          const request = route.request();
          if (request.method() !== method || path(request.url()) == base + "/query") {
            await route.continue();
            return;
          }
          writes++;
          const response = await route.fetch();
          expect(response.status()).toBe(operation === "create" ? 201 : 200);
          await route.abort("failed");
        });
        if (operation === "delete") {
          await row(page, "Original for uncertainty")
            .getByRole("button", {
              name: c.deleteNamed.replace("{title}", "Original for uncertainty"),
              exact: true,
            })
            .click();
          const dialog = page.getByRole("dialog", { name: c.deleteTitle, exact: true });
          await dialog.getByRole("button", { name: c.delete, exact: true }).click();
          await expect(dialog.getByText(c.unknown.delete, { exact: true })).toBeVisible();
          await dialog.getByRole("button", { name: c.cancel, exact: true }).click();
        } else {
          if (operation === "create")
            await page.getByRole("button", { name: c.new, exact: true }).click();
          else
            await row(page, "Original for uncertainty")
              .getByRole("button", {
                name: c.editNamed.replace("{title}", "Original for uncertainty"),
                exact: true,
              })
              .click();
          await fields(page, locale, "Submitted uncertain milestone", "0001-01-01");
          await page.getByRole("button", { name: c.save, exact: true }).click();
        }
        await expect(page.getByTestId("milestone-unknown")).toContainText(c.unknown[operation]);
        await expect(page.getByTestId("milestone-ack")).toHaveCount(0);
        await expect(page.getByText(c.stale, { exact: true })).toBeVisible();
        expect(writes).toBe(1);
        if (operation !== "create") {
          await expect(
            row(page, "Original for uncertainty").getByRole("button", {
              name: c.editNamed.replace("{title}", "Original for uncertainty"),
              exact: true,
            }),
          ).toBeDisabled();
          await expect(
            row(page, "Original for uncertainty").getByRole("button", {
              name: c.deleteNamed.replace("{title}", "Original for uncertainty"),
              exact: true,
            }),
          ).toBeDisabled();
        }
        await shot(page, locale, info.project.name, `unknown-${operation}`);
        await page.getByRole("button", { name: c.inspect, exact: true }).click();
        await expect(rows(page)).toHaveCount(operation === "delete" ? 0 : 1);
        expect(writes).toBe(1);
        await expect(page.getByTestId("milestone-unknown")).toBeVisible();
        if (operation !== "delete") {
          await expect(page.getByLabel(c.name, { exact: true })).toHaveValue(
            "Submitted uncertain milestone",
          );
          await expect(page.getByRole("button", { name: c.save, exact: true })).toBeDisabled();
          await page.getByRole("button", { name: c.cancel, exact: true }).click();
          await page
            .getByRole("dialog", { name: c.discardTitle, exact: true })
            .getByRole("button", { name: c.cancel, exact: true })
            .click();
          await expect(page.getByLabel(c.name, { exact: true })).toHaveValue(
            "Submitted uncertain milestone",
          );
        }
        expect(await db!.personalMilestone.count({ where: { ownerId: f.ownerId } })).toBe(
          operation === "delete" ? 0 : 1,
        );
      } finally {
        await cleanupPersonalMilestoneFixture(f);
      }
    });
  }
  test(`${locale}: known acknowledgement survives subsequent list failure and real retry`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page);
    let fail = false,
      writes = 0;
    try {
      await manager(page, locale);
      await page.route("**/api/v1/dashboard/milestones{,/**}", async (route) => {
        if (path(route.request().url()) === base && route.request().method() === "POST") {
          writes++;
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          fail = true;
          await route.fulfill({ response });
          return;
        }
        if (fail && path(route.request().url()) === base + "/query") {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"error":{"code":"SEARCH_UNAVAILABLE"}}',
          });
          return;
        }
        await route.continue();
      });
      await page.getByRole("button", { name: c.new, exact: true }).click();
      await fields(page, locale, "Known saved milestone", "0001-01-01");
      await save(page, locale);
      await expect(page.getByText(c.loadFailed, { exact: true })).toBeVisible();
      await expect(page.getByTestId("milestone-ack")).toContainText(c.ack.create);
      await expect(page.getByText(c.empty, { exact: true })).toHaveCount(0);
      await shot(page, locale, info.project.name, "ack-read-error");
      fail = false;
      await page.getByRole("button", { name: c.retry, exact: true }).click();
      await expect(row(page, "Known saved milestone")).toBeVisible();
      expect(writes).toBe(1);
    } finally {
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: actual revoked session clears private input and rejects a late buffered list`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page, [
      { title: "Private before expiry", milestoneDate: "0001-01-01" },
    ]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const incoming = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    try {
      await manager(page, locale);
      await row(page, "Private before expiry")
        .getByRole("button", {
          name: c.editNamed.replace("{title}", "Private before expiry"),
          exact: true,
        })
        .click();
      await page.getByLabel(c.name, { exact: true }).fill("Sensitive private draft");
      let delay = true;
      await page.route("**/api/v1/dashboard/milestones/query", async (route) => {
        if (!delay) {
          await route.continue();
          return;
        }
        delay = false;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        arrived();
        await gate;
        try {
          await route.fulfill({ response });
        } catch {
          /* Expired scope cancelled this real buffered response. */
        }
      });
      await page.getByRole("button", { name: c.refresh, exact: true }).click();
      await incoming;
      await db!.session.deleteMany({ where: { userId: f.ownerId } });
      const rejected = page.waitForResponse((r) => r.request().method() === "PATCH");
      await page.getByRole("button", { name: c.save, exact: true }).click();
      expect((await rejected).status()).toBe(401);
      await expect(page.getByText(c.session, { exact: true })).toBeVisible();
      release();
      await expect(rows(page)).toHaveCount(0);
      await expect(page.getByLabel(c.name, { exact: true })).toHaveCount(0);
      await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
      await expect(page.getByText("Sensitive private draft", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Private before expiry", { exact: true })).toHaveCount(0);
      expect(
        (await db!.personalMilestone.findUniqueOrThrow({ where: { id: f.milestones[0]!.id } }))
          .revision,
      ).toBe(1);
    } finally {
      release();
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: keyboard, dirty locale navigation, 320px and zoom keep one protected editor`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const long = "🐉".repeat(120),
      f = await personalMilestoneFixture(page, [{ title: long, milestoneDate: "0001-01-01" }]);
    try {
      await page.goto(`/${locale}/dashboard`);
      await expect(rows(page)).toHaveCount(1);
      const dashboard = page.url();
      await page.getByRole("link", { name: c.manage, exact: true }).click();
      await expect(rows(page)).toHaveCount(1);
      await row(page, long)
        .getByRole("button", { name: c.editNamed.replace("{title}", long), exact: true })
        .click();
      await page.getByLabel(c.name, { exact: true }).fill("Unapplied private input");
      await page.getByRole("button", { name: c.cancel, exact: true }).focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: c.discardTitle, exact: true });
      await expect(dialog).toBeVisible();
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      for (let n = 0; n < 10; n++) {
        await page.keyboard.press("Tab");
        expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(page.getByLabel(c.name, { exact: true })).toHaveValue("Unapplied private input");
      const language = page.getByRole("link", {
        name: locale === "de" ? "English" : "Deutsch",
        exact: true,
      });
      await language.click();
      await dialog.getByRole("button", { name: c.cancel, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/milestones$`));
      await expect(page.getByLabel(c.name, { exact: true })).toHaveValue("Unapplied private input");
      await page.setViewportSize({ width: 320, height: 900 });
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        width: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width && (rect.right > innerWidth + 1 || rect.left < -1);
          })
          .slice(0, 12)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            width: el.getBoundingClientRect().width,
            text: el.textContent?.slice(0, 45),
          })),
      }));
      expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
      await shot(page, locale, info.project.name, "320");
      await page.setViewportSize({ width: 720, height: 500 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = "2";
      });
      const zoomOverflow = await page.evaluate(() => ({
        viewport: innerWidth,
        width: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width && (rect.right > innerWidth + 1 || rect.left < -1);
          })
          .slice(0, 12)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            width: el.getBoundingClientRect().width,
            text: el.textContent?.slice(0, 45),
          })),
      }));
      expect(zoomOverflow.width, JSON.stringify(zoomOverflow)).toBeLessThanOrEqual(
        zoomOverflow.viewport,
      );
      await shot(page, locale, info.project.name, "zoom");
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
      await language.focus();
      await page.keyboard.press("Enter");
      await dialog.getByRole("button", { name: c.discard, exact: true }).click();
      const other = locale === "de" ? "en" : "de";
      await expect(page).toHaveURL(new RegExp(`/${other}/milestones$`));
      await expect(page.getByLabel(copies[other].name, { exact: true })).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/${locale}/milestones$`));
      await page.goBack();
      await expect(page).toHaveURL(dashboard);
    } finally {
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: pending unchanged edit resists fast Back and removes its guard after acknowledgement`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page, [
      { title: "Unchanged pending edit", milestoneDate: "0001-01-01" },
    ]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const incoming = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    try {
      await page.goto(`/${locale}/dashboard`);
      await expect(rows(page)).toHaveCount(1);
      const dashboard = page.url();
      await page.getByRole("link", { name: c.manage, exact: true }).click();
      await expect(rows(page)).toHaveCount(1);
      await row(page, "Unchanged pending edit")
        .getByRole("button", {
          name: c.editNamed.replace("{title}", "Unchanged pending edit"),
          exact: true,
        })
        .click();
      await page.route("**/api/v1/dashboard/milestones/*", async (route) => {
        if (route.request().method() !== "PATCH") {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        arrived();
        await gate;
        await route.fulfill({ response });
      });
      await page.getByRole("button", { name: c.save, exact: true }).click();
      await incoming;
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/${locale}/milestones$`));
      await expect(page.getByRole("button", { name: c.saving, exact: true })).toBeDisabled();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await shot(page, locale, info.project.name, "pending");
      release();
      await expect(page.getByTestId("milestone-ack")).toContainText(c.ack.update);
      await page.goBack();
      await expect(page).toHaveURL(dashboard);
    } finally {
      release();
      await cleanupPersonalMilestoneFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  const c = copies[locale];
  test(`${locale}: a moved conflicted record is not called deleted when absent from the current page`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page, [
      ...Array.from({ length: 20 }, (_, n) => ({
        title: `Page member ${n}`,
        milestoneDate: "2026-11-05",
      })),
      { title: "Moved milestone", milestoneDate: "9999-12-31" },
    ]);
    const original = f.milestones[20]!;
    try {
      await manager(page, locale);
      await row(page, original.title)
        .getByRole("button", { name: c.editNamed.replace("{title}", original.title), exact: true })
        .click();
      await page.getByLabel(c.name, { exact: true }).fill("Retained old-page input");
      const changed = await page.request.patch(`${base}/${original.id}`, {
        headers: { origin },
        data: { title: "Moved actual state", milestoneDate: "0001-01-01", expectedRevision: 1 },
      });
      expect(changed.status()).toBe(200);
      const response = page.waitForResponse((r) => r.request().method() === "PATCH");
      await page.getByRole("button", { name: c.save, exact: true }).click();
      expect((await response).status()).toBe(409);
      await page.getByRole("button", { name: c.inspect, exact: true }).click();
      await expect(page.getByText(c.notOnPage, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: c.adopt, exact: true })).toHaveCount(0);
      await expect(page.getByLabel(c.name, { exact: true })).toHaveValue("Retained old-page input");
      await page.getByRole("button", { name: c.next, exact: true }).click();
      await expect(row(page, "Moved actual state")).toBeVisible();
      await row(page, "Moved actual state")
        .getByRole("button", {
          name: c.editNamed.replace("{title}", "Moved actual state"),
          exact: true,
        })
        .click();
      await page
        .getByRole("dialog", { name: c.discardTitle, exact: true })
        .getByRole("button", { name: c.discard, exact: true })
        .click();
      await expect(page.getByLabel(c.name, { exact: true })).toHaveValue("Moved actual state");
      await expect(page.getByRole("button", { name: c.save, exact: true })).toBeEnabled();
      expect(
        (await db!.personalMilestone.findUniqueOrThrow({ where: { id: original.id } })).revision,
      ).toBe(2);
    } finally {
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: mismatched committed acknowledgement and late pre-write read cannot clear uncertainty`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page, [
      { title: "Before actual write", milestoneDate: "0001-01-01" },
    ]);
    const original = f.milestones[0]!;
    let release!: () => void, arrived!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      incoming = new Promise<void>((r) => {
        arrived = r;
      });
    let delayed = false,
      writes = 0;
    try {
      await manager(page, locale);
      await row(page, original.title)
        .getByRole("button", { name: c.editNamed.replace("{title}", original.title), exact: true })
        .click();
      await page.getByLabel(c.name, { exact: true }).fill("Actually committed replacement");
      await page.route("**/api/v1/dashboard/milestones/query", async (route) => {
        if (delayed) {
          await route.continue();
          return;
        }
        delayed = true;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        arrived();
        await gate;
        try {
          await route.fulfill({ response });
        } catch {
          /* Cancelled older read may not publish. */
        }
      });
      await page.route(`**/api/v1/dashboard/milestones/${original.id}`, async (route) => {
        if (route.request().method() !== "PATCH") {
          await route.continue();
          return;
        }
        writes++;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        // Actual mutation succeeds; transport sends the old, schema-valid identity/revision instead.
        await route.fulfill({ response, json: original });
      });
      await page.getByRole("button", { name: c.refresh, exact: true }).click();
      await incoming;
      await page.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByTestId("milestone-unknown")).toContainText(c.unknown.update);
      release();
      await expect(page.getByText(c.stale, { exact: true })).toBeVisible();
      await expect(page.getByTestId("milestone-ack")).toHaveCount(0);
      await expect(
        row(page, original.title).getByRole("button", {
          name: c.editNamed.replace("{title}", original.title),
          exact: true,
        }),
      ).toBeDisabled();
      await page.getByRole("button", { name: c.inspect, exact: true }).click();
      await expect(row(page, "Actually committed replacement")).toBeVisible();
      await expect(page.getByTestId("milestone-unknown")).toBeVisible();
      expect(writes).toBe(1);
      expect(
        (await db!.personalMilestone.findUniqueOrThrow({ where: { id: original.id } })).revision,
      ).toBe(2);
    } finally {
      release();
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: fresh authenticated actor replacement removes the prior private editor`, async ({
    page,
    context,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page, [
      { title: "First actor private row", milestoneDate: "0001-01-01" },
    ]);
    let second: Awaited<ReturnType<typeof personalMilestoneFixture>> | undefined;
    const other = await context.newPage();
    try {
      await manager(page, locale);
      await row(page, "First actor private row")
        .getByRole("button", {
          name: c.editNamed.replace("{title}", "First actor private row"),
          exact: true,
        })
        .click();
      await page.getByLabel(c.name, { exact: true }).fill("First actor unsaved private text");
      second = await personalMilestoneFixture(other, [
        { title: "Second actor private row", milestoneDate: "9999-12-31" },
      ]);
      // A normal fresh SSR load uses the newly authenticated cookie, not the old actor prop.
      page.on("dialog", (dialog) => void dialog.accept());
      await page.reload();
      await expect(row(page, "Second actor private row")).toBeVisible();
      await expect(page.getByLabel(c.name, { exact: true })).toHaveCount(0);
      await expect(page.getByText("First actor private row", { exact: true })).toHaveCount(0);
      await expect(page.getByText("First actor unsaved private text", { exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByTestId("milestone-unknown")).toHaveCount(0);
      await expect(page.getByTestId("milestone-ack")).toHaveCount(0);
      const foreign = await page.request.patch(`${base}/${f.milestones[0]!.id}`, {
        headers: { origin },
        data: {
          title: "Denied cross-owner edit",
          milestoneDate: "0001-01-01",
          expectedRevision: 1,
        },
      });
      expect(foreign.status()).toBe(404);
    } finally {
      await other.close();
      if (second) await cleanupPersonalMilestoneFixture(second);
      await cleanupPersonalMilestoneFixture(f);
    }
  });
  test(`${locale}: failed preview never invents an empty collection and retries its own list`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await personalMilestoneFixture(page, [
      { title: "Independent preview record", milestoneDate: "0001-01-01" },
    ]);
    let fail = true;
    try {
      await page.route("**/api/v1/dashboard/milestones/query", async (route) => {
        if (fail)
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"error":{"code":"SEARCH_UNAVAILABLE"}}',
          });
        else await route.continue();
      });
      await page.goto(`/${locale}/dashboard`);
      const preview = page.getByTestId("milestone-preview");
      await expect(preview.getByText(c.loadFailed, { exact: true })).toBeVisible();
      await expect(page.getByTestId("dashboard-selection-rows")).toHaveText("1");
      await expect(preview.getByTestId("milestone-total")).toHaveCount(0);
      await expect(preview.getByText(c.empty, { exact: true })).toHaveCount(0);
      await shot(page, locale, info.project.name, "preview-error");
      fail = false;
      await preview.getByRole("button", { name: c.retry, exact: true }).click();
      await expect(row(page, "Independent preview record")).toBeVisible();
      fail = true;
      await preview.getByRole("button", { name: c.refresh, exact: true }).click();
      await expect(preview.getByText(c.stale, { exact: true })).toBeVisible();
      await expect(row(page, "Independent preview record")).toBeVisible();
    } finally {
      await cleanupPersonalMilestoneFixture(f);
    }
  });
}
