import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";

import { expect, test, type Browser, type Page } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";

import { startAuthApiServer, type AuthApiServer } from "./support/auth-api-server";

const runAuthE2E = process.env.RUN_AUTH_E2E === "1";
const mailboxPath = "/tmp/sammlerraum-auth-e2e-mailbox.json";

type Mailbox = Record<string, { subject: string; url: string }>;

async function verificationUrlFor(email: string): Promise<string> {
  await expect
    .poll(
      async () => {
        try {
          const mailbox = JSON.parse(await readFile(mailboxPath, "utf8")) as Mailbox;
          return mailbox[email]?.url;
        } catch {
          return undefined;
        }
      },
      { message: `waiting for verification mail for ${email}` },
    )
    .toBeTruthy();
  const mailbox = JSON.parse(await readFile(mailboxPath, "utf8")) as Mailbox;
  return mailbox[email]!.url;
}

async function registerWithPassword(page: Page, locale: "de" | "en") {
  const email = `auth-browser-${randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";

  await page.goto(`/${locale}/register`);
  await page.getByLabel(locale === "de" ? "Name" : "Name").fill("Sammler");
  await page.getByLabel(locale === "de" ? "E-Mail-Adresse" : "Email address").fill(email);
  await page.getByLabel(locale === "de" ? "Passwort" : "Password").fill(password);
  await page.getByRole("button", { name: locale === "de" ? "Registrieren" : "Register" }).click();
  await expect(
    page.getByText(
      locale === "de" ? "Prüfe jetzt dein E-Mail-Postfach." : "Check your email inbox now.",
    ),
  ).toBeVisible();

  await rm(mailboxPath, { force: true });
  await page
    .getByRole("button", {
      name: locale === "de" ? "Bestätigungs-E-Mail erneut senden" : "Resend verification email",
    })
    .click();
  await page.goto(await verificationUrlFor(email));
  await page.goto(`/${locale}/login`);
  await page.getByLabel(locale === "de" ? "E-Mail-Adresse" : "Email address").fill(email);
  await page.getByLabel(locale === "de" ? "Passwort" : "Password").fill(password);
  await page
    .getByRole("button", { name: locale === "de" ? "Anmelden" : "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account/profile$`));

  return { email, password };
}

async function signInAnotherSession(
  browser: Browser,
  credentials: { email: string; password: string },
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/de/login");
  await page.getByLabel("E-Mail-Adresse").fill(credentials.email);
  await page.getByLabel("Passwort").fill(credentials.password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/de\/account\/profile$/);
  return context;
}

async function makeSessionsStale(email: string) {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? "");
  await prisma.$connect();
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("password authentication API", () => {
  test.skip(!runAuthE2E, "requires the migrated PostgreSQL integration database");

  let server: AuthApiServer;

  test.beforeAll(async () => {
    server = await startAuthApiServer(process.env.DATABASE_URL ?? "");
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("registers, verifies, signs in, and lists the authenticated session", async ({
    request,
  }) => {
    const email = `auth-smoke-${randomUUID()}@example.test`;
    const password = "correct-horse-battery-staple";

    try {
      const registration = await request.post(`${server.origin}/api/auth/sign-up/email`, {
        data: { name: "Sammler", email, password },
      });
      expect(registration.ok()).toBe(true);

      const verificationUrl = server.verificationUrlFor(email);
      expect(verificationUrl).toMatch(
        new RegExp(
          `^${server.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/auth/verify-email\\?`,
        ),
      );

      const unverifiedLogin = await request.post(`${server.origin}/api/auth/sign-in/email`, {
        data: { email, password },
      });
      expect(unverifiedLogin.status()).toBe(403);

      const verification = await request.get(verificationUrl, { maxRedirects: 0 });
      expect([200, 302]).toContain(verification.status());

      const login = await request.post(`${server.origin}/api/auth/sign-in/email`, {
        data: { email, password },
      });
      expect(login.ok()).toBe(true);

      const sessions = await request.get(`${server.origin}/api/v1/account/sessions`, {
        headers: { "x-request-id": "auth-e2e-sessions" },
      });
      expect(sessions.status()).toBe(200);
      expect(sessions.headers()["cache-control"]).toBe("no-store");
      expect(sessions.headers()["x-request-id"]).toBe("auth-e2e-sessions");

      const body = (await sessions.json()) as {
        sessions: Array<Record<string, unknown>>;
      };
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0]).toMatchObject({ current: true });
      expect(Object.keys(body.sessions[0] ?? {}).sort()).toEqual([
        "createdAt",
        "current",
        "id",
        "lastSeenAt",
        "userAgent",
      ]);
      expect(JSON.stringify(body)).not.toContain(email);
      expect(JSON.stringify(body)).not.toContain("token");
    } finally {
      await server.removeUser(email);
    }
  });
});

test.describe("localized authentication and account UI", () => {
  test.skip(!runAuthE2E, "requires the migrated PostgreSQL integration database and Chromium");

  test.beforeEach(async () => {
    await rm(mailboxPath, { force: true });
  });

  test("offers localized password and social authentication", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible();

    const googleRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/auth/sign-in/social") &&
        request.postDataJSON().provider === "google",
    );
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await googleRequest;

    await page.goto("/de/login");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    const appleRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/auth/sign-in/social") &&
        request.postDataJSON().provider === "apple",
    );
    await page.getByRole("button", { name: "Mit Apple fortfahren" }).click();
    await appleRequest;
  });

  test("user can reset a password through the emailed recovery link", async ({ page }) => {
    const credentials = await registerWithPassword(page, "de");
    await page.getByRole("button", { name: "Abmelden" }).click();
    await page.getByRole("button", { name: "Passwort vergessen?" }).click();
    await rm(mailboxPath, { force: true });
    await page.getByLabel("E-Mail-Adresse für Passwort-Reset").fill(credentials.email);
    await page.getByRole("button", { name: "Reset-Link senden" }).click();
    await expect(
      page.getByText("Wenn das Konto existiert, wurde ein Reset-Link gesendet."),
    ).toBeVisible();

    await page.goto(await verificationUrlFor(credentials.email));
    const newPassword = "new-correct-horse-battery-staple";
    await page.getByLabel("Neues Passwort").fill(newPassword);
    await page.getByRole("button", { name: "Passwort speichern" }).click();
    await expect(page.getByText("Passwort wurde geändert.")).toBeVisible();
    await expect(page).toHaveURL(/\/de\/login$/);
    await page.getByLabel("E-Mail-Adresse").fill(credentials.email);
    await page.getByLabel("Passwort", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await expect(page).toHaveURL(/\/de\/account\/profile$/);
  });

  test("user can register, verify, sign in, edit profile, add and use a passkey, and revoke another session", async ({
    browser,
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    const credentials = await registerWithPassword(page, "de");
    await page.getByLabel("Öffentlicher Handle").fill(`sammler-${randomUUID()}`);
    await page.getByLabel("Anzeigename").fill("Sammler");
    await page.getByLabel("Biografie").fill("Bewahrt Geschichten.");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Profil gespeichert.")).toBeVisible();

    await page.goto("/de/account/security");
    await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Login-Methoden" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aktive Sitzungen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Google verbinden" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apple verbinden" })).toBeVisible();
    await page.route("https://accounts.google.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>OAuth provider handoff</h1>",
      });
    });
    const linkResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/link-social") &&
        response.request().postDataJSON().provider === "google",
    );
    const providerHandoff = page.waitForURL((url) => url.hostname === "accounts.google.com");
    await page.getByRole("button", { name: "Google verbinden" }).click();
    expect((await linkResponse).ok()).toBe(true);
    await providerHandoff;
    await expect(page.getByRole("heading", { name: "OAuth provider handoff" })).toBeVisible();
    await page.goto("/de/account/security");
    await page.getByLabel("Passkey-Name").fill("Testgerät");
    await page.getByRole("button", { name: "Passkey hinzufügen" }).click();
    await expect(page.getByText("Testgerät", { exact: true })).toBeVisible();

    await makeSessionsStale(credentials.email);
    await page.getByRole("button", { name: "Testgerät entfernen", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sicherheitsaktion bestätigen" })).toBeVisible();
    await page.getByLabel("Aktuelles Passwort").fill(credentials.password);
    await page.getByRole("button", { name: "Erneut anmelden" }).click();
    const refreshedSessions = page.getByTestId("account-session");
    await expect(refreshedSessions).toHaveCount(2);
    await expect(refreshedSessions.filter({ hasText: "Diese Sitzung" })).toHaveCount(1);
    const firstRevocationResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/account/sessions") &&
        response.request().method() === "DELETE",
    );
    await refreshedSessions
      .filter({ hasNotText: "Diese Sitzung" })
      .getByRole("button", { name: "Sitzung widerrufen" })
      .click();
    expect((await firstRevocationResponse).status()).toBe(204);
    await expect(refreshedSessions).toHaveCount(1);

    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/de\/login$/);
    await page.getByRole("button", { name: "Mit Passkey anmelden" }).click();
    await expect(page).toHaveURL(/\/de\/account\/profile$/);

    const otherContext = await signInAnotherSession(browser, credentials);
    try {
      await page.goto("/de/account/security");
      const sessions = page.getByTestId("account-session");
      await expect(sessions).toHaveCount(2);
      await sessions
        .filter({ hasNotText: "Diese Sitzung" })
        .getByRole("button", { name: "Sitzung widerrufen" })
        .click();
      await expect(sessions).toHaveCount(1);
      await page.getByRole("button", { name: "Testgerät entfernen", exact: true }).click();
      await expect(page.getByText("Testgerät", { exact: true })).not.toBeVisible();
    } finally {
      await otherContext.close();
    }
  });
});
