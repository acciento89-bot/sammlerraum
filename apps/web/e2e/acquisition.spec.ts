import { test, expect } from "@playwright/test";

test("email confirmation reports registration without another login", async ({ page }) => {
  const { randomUUID } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const { createTestDatabaseClient } = await import("@sammlerraum/db/test-database");
  const db = createTestDatabaseClient();
  const email = `confirmed-${randomUUID()}@example.org`;
  try {
    // Do not consume the separate authentication suite's shared loopback quota.
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.18.202.26" });
    // Keep synthetic activity outside Google's live conversion transport.
    await page.route("https://www.googletagmanager.com/gtag/js**", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.__measurementEvents=[];const process=(a)=>{if(a[0]==='event'&&a[1]==='conversion'){window.__measurementEvents.push({send_to:a[2].send_to,transaction_id:a[2].transaction_id});a[2].event_callback?.();}};for(const args of window.dataLayer||[])process(args);window.gtag=function(){process(arguments)};`,
      }),
    );
    await page.goto("/de/sammlung-verwalten?utm_campaign=sammlerraum-search-30-20261112");
    await page.getByRole("button", { name: "Werbemessung erlauben", exact: true }).click();
    await page.getByRole("link", { name: "Kostenlos starten", exact: true }).first().click();
    await page.getByLabel("Name", { exact: true }).fill("Synthetic confirmed collector");
    await page.getByLabel("E-Mail-Adresse", { exact: true }).fill(email);
    await page.getByLabel("Passwort", { exact: true }).fill("Synthetic-local-password-only-123");
    await page.getByRole("button", { name: "Registrieren", exact: true }).click();
    await expect(page.getByText("Prüfe jetzt dein E-Mail-Postfach.")).toBeVisible();
    expect(
      (await page.request.get("/api/v1/acquisition/status?started=" + Date.now())).status(),
    ).toBe(401);
    let link = "";
    await expect
      .poll(async () => {
        const mailbox = JSON.parse(
          await readFile("/tmp/sammlerraum-auth-e2e-mailbox.json", "utf8"),
        );
        link = mailbox[email]?.url ?? "";
        return Boolean(link);
      })
      .toBe(true);
    await page.goto(link);
    await expect(page).toHaveURL(/\/de\/account\/profile$/);
    await expect.poll(() => page.evaluate("window.__measurementEvents?.length??0")).toBe(1);
    const event = await page.evaluate<{ send_to: string; transaction_id: string }>(
      "window.__measurementEvents[0]",
    );
    expect(event.send_to).toBe("AW-18427442933/d7UmCMe20LYdEPXt8dJE");
    expect(event.transaction_id).toMatch(/^sr_[a-f0-9]{40}$/);
    const saved = await db.user.findUniqueOrThrow({ where: { email } });
    expect(saved.emailVerified).toBe(true);
    expect(JSON.stringify(event)).not.toContain(email);
    expect(JSON.stringify(event)).not.toContain(saved.id);
  } finally {
    await db.user.deleteMany({ where: { email } });
    await db.rateLimit.deleteMany({ where: { key: "198.18.202.26|/sign-up/email" } });
    await db.$disconnect();
  }
});
for (const locale of ["de", "en"])
  test(`${locale}: collector landing has focused signup and measurement is optional`, async ({
    page,
  }, info) => {
    const external: string[] = [];
    page.on("request", (r) => {
      if (/google(tagmanager|adservices|ads)|doubleclick/.test(r.url())) external.push(r.url());
    });
    await page.goto(
      `/${locale}/${locale === "de" ? "sammlung-verwalten" : "collection-manager"}?utm_campaign=sammlerraum-search-30-20261112`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "de"
        ? "Deine Sammlung. Endlich im Überblick."
        : "Your collection. Finally organised.",
    );
    await expect(
      page
        .getByRole("link", {
          name: locale === "de" ? "Kostenlos starten" : "Start for free",
          exact: true,
        })
        .first(),
    ).toBeVisible();
    expect(external).toEqual([]);
    await page
      .getByRole("button", {
        name: locale === "de" ? "Ohne Werbemessung" : "Without measurement",
        exact: true,
      })
      .click();
    expect(external).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: `../../.superpowers/sdd/2026-11-11-sammlerraum-search-test/${locale}-${info.project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", {
        name: locale === "de" ? "Kostenlos starten" : "Start for free",
        exact: true,
      })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/register`));
    expect(external).toEqual([]);
  });

test("ordinary pages do not prompt for campaign measurement; preferences remain available", async ({
  page,
}) => {
  for (const path of ["/de", "/en/register", "/de/sammlung-verwalten"]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", {
        name: /Werbemessung verwalten|Advertising measurement/,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", {
        name: /Optionale Werbemessung|Optional advertising measurement/,
        exact: true,
      }),
    ).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Werbemessung verwalten", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Optionale Werbemessung", exact: true }),
  ).toBeVisible();
});

test("public welcome artwork decodes with a smaller mobile transfer", async ({ page }) => {
  await page.goto("/de");
  const hero = page.locator(".hub-welcome > img");
  await expect
    .poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  const src = await hero.evaluate((img: HTMLImageElement) => img.currentSrc);
  const original = await page.request.get("/art/community-hero.webp");
  expect(original.status()).toBe(200);
  const delivered = await page.request.get(src, { headers: { accept: "image/webp" } });
  expect(delivered.status()).toBe(200);
  expect(delivered.headers()["content-type"]).toMatch(/^image\//);
  expect((await delivered.body()).length).toBeLessThan((await original.body()).length * 0.8);
});

test("real verified account and first item produce deduplicated events only after opt-in; withdrawal stops measurement", async ({
  page,
  context,
}) => {
  const { randomUUID } = await import("node:crypto");
  const { hashPassword } = await import("better-auth/crypto");
  const { createTestDatabaseClient } = await import("@sammlerraum/db/test-database");
  const db = createTestDatabaseClient(),
    id = randomUUID(),
    collectionId = randomUUID(),
    password = "Synthetic-" + randomUUID();
  const email = `acquisition-${id}@example.org`;
  const external: string[] = [];
  try {
    expect(
      (await page.request.get("/api/v1/acquisition/status?started=" + Date.now())).status(),
    ).toBe(401);
    await db.user.create({
      data: {
        id,
        name: "Synthetic acquisition fixture",
        email,
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
        await page.request.post("/api/auth/sign-in/email", {
          data: { email, password },
          headers: { origin: "http://localhost:3000", "x-forwarded-for": "198.18.202.25" },
        })
      ).status(),
    ).toBe(200);
    const started = Date.now();
    expect((await page.request.get("/api/v1/acquisition/status?started=invalid")).status()).toBe(
      400,
    );
    expect(
      (
        await page.request.get("/api/v1/acquisition/status?started=" + started, {
          headers: { origin: "https://foreign.example" },
        })
      ).status(),
    ).toBe(403);
    const before = await (
      await page.request.get("/api/v1/acquisition/status?started=" + started)
    ).json();
    expect(before.events.map((e: { kind: string }) => e.kind)).toEqual(["registration"]);
    expect(JSON.stringify(before)).not.toContain(email);
    expect(JSON.stringify(before)).not.toContain(id);
    // Isolate the real provider boundary: no synthetic conversion is ever sent to Google.
    await page.route("https://www.googletagmanager.com/gtag/js**", async (route) => {
      external.push(route.request().url());
      await route.fulfill({
        contentType: "application/javascript",
        body: `window.__measurementEvents=[];const process=(a)=>{if(a[0]==='event'&&a[1]==='conversion'){window.__measurementEvents.push({send_to:a[2].send_to,transaction_id:a[2].transaction_id});a[2].event_callback?.();}};for(const args of window.dataLayer||[])process(args);window.gtag=function(){process(arguments)};`,
      });
    });
    await context.addCookies([
      { name: "_gcl_aw", value: "synthetic-no-real-click", domain: "localhost", path: "/" },
    ]);
    await page.goto("/de/sammlung-verwalten?utm_campaign=sammlerraum-search-30-20261112");
    expect(external).toEqual([]);
    await page.getByRole("button", { name: "Werbemessung erlauben", exact: true }).click();
    await expect.poll(() => page.evaluate("window.__measurementEvents?.length??0")).toBe(1);
    expect(external).toHaveLength(1);
    await db.collection.create({
      data: { id: collectionId, ownerId: id, name: "Synthetic private collection" },
    });
    await db.collectibleItem.create({
      data: { collectionId, ownerId: id, title: "Synthetic private first item" },
    });
    await expect
      .poll(() => page.evaluate("window.__measurementEvents?.length??0"), { timeout: 20000 })
      .toBe(2);
    const firstAttempt = await page.evaluate("window.__measurementEvents");
    await page.reload();
    await expect.poll(() => page.evaluate("window.__measurementEvents?.length??0")).toBe(2);
    expect(await page.evaluate("window.__measurementEvents")).toEqual(firstAttempt);
    await page.getByRole("button", { name: "Werbemessung verwalten", exact: true }).click();
    await page.getByRole("button", { name: "Ohne Werbemessung", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Werbemessung erlauben", exact: true }),
    ).toHaveCount(0);
    const count = external.length;
    await page.reload();
    expect(external).toHaveLength(count);
    expect(await page.evaluate("localStorage.getItem('sr-measurement-visit-v1')")).toBeNull();
    expect((await context.cookies()).filter((c) => c.name.startsWith("_gcl"))).toEqual([]);
  } finally {
    await db.collectibleItem.deleteMany({ where: { ownerId: id } });
    await db.collection.deleteMany({ where: { ownerId: id } });
    await db.user.deleteMany({ where: { id } });
    await db.rateLimit.deleteMany({ where: { key: "198.18.202.25|/sign-in/email" } });
    await db.$disconnect();
  }
});

test("withdrawal in a second tab cancels delayed eligibility without sending a conversion", async ({
  page,
  context,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await context.route("https://www.googletagmanager.com/gtag/js**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__measurementEvents=[];window.gtag=function(){if(arguments[0]==='event')window.__measurementEvents.push(arguments[2]);};`,
    }),
  );
  await context.route("**/api/v1/acquisition/status?*", async (route) => {
    requested = true;
    await held;
    await route
      .fulfill({ json: { events: [{ kind: "registration", transactionId: "sr_synthetic_held" }] } })
      .catch(() => {});
  });
  await page.goto("/de/sammlung-verwalten?utm_campaign=sammlerraum-search-30-20261112");
  await page.getByRole("button", { name: "Werbemessung erlauben", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  const other = await context.newPage();
  await other.goto("/de/sammlung-verwalten");
  await other.getByRole("button", { name: "Werbemessung verwalten", exact: true }).click();
  await other.getByRole("button", { name: "Ohne Werbemessung", exact: true }).click();
  release();
  await expect
    .poll(() =>
      page.evaluate("JSON.parse(localStorage.getItem('sr-measurement-choice-v1')||'{}').choice"),
    )
    .toBe("declined");
  await page.waitForLoadState("load");
  expect(await page.evaluate("window.__measurementEvents?.length??0")).toBe(0);
  expect(await page.evaluate("localStorage.getItem('sr-measurement-sent-v1')")).toBeNull();
});
