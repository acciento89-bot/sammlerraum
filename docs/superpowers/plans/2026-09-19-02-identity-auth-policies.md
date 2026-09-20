# Identity, Authentication, and Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement accounts, profiles, email/password authentication, Google/Apple providers, passkeys, session management, recovery, API error contracts, and a reusable server-side policy engine.

**Architecture:** Better Auth is the authentication provider behind a local auth service. Domain authorization is separate from authentication and represented by explicit policy functions. API routes use shared Zod contracts and a uniform error envelope.

**Tech Stack:** Better Auth, Prisma 7, PostgreSQL 17, Zod, WebAuthn/passkey plugin, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- Login email is never automatically public.
- Account linking never merges accounts solely because email strings match.
- At least one verified recovery route is required.
- Authorization is server-side and independent from UI visibility.
- Social-provider secrets remain environment variables.

## Review Focus

1. Existing account + same-email social login must not silently merge without verified linking.
2. Revoked sessions must immediately lose authenticated API access.
3. Missing recovery method must block removing the last recovery factor.
4. Public profile reads must never include login email, provider IDs, passkey material, or session tokens.
5. Policy default is deny when an action/resource combination is unknown.

---

### Task 1: Add identity/profile schema and privacy-safe profile service

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/identity/profile-service.ts`
- Create: `packages/domain/src/identity/profile-service.test.ts`
- Create: `packages/contracts/src/profile.ts`

**Interfaces:**
- Consumes: Prisma.
- Produces: `getPublicProfile(handle): Promise<PublicProfile | null>`, `updateOwnProfile(userId, input)`.

- [x] **Step 1: Write failing privacy test**

```ts
it("never exposes login email in the public profile projection", async () => {
  const result = await service.getPublicProfile("sammler");
  expect(result).toEqual({
    handle: "sammler",
    displayName: "Sammler",
    bio: null,
    avatarAssetId: null
  });
  expect(result).not.toHaveProperty("email");
});
```

- [x] **Step 2: Run test and confirm failure**

Run: `pnpm vitest run packages/domain/src/identity/profile-service.test.ts`  
Expected: FAIL because profile service/schema do not exist.

- [x] **Step 3: Add models and service**

Add `UserProfile` with unique normalized `handle`, `displayName`, `bio`, `avatarAssetId`, timestamps. Keep login email in auth-owned user data, not profile output.

Public DTO:

```ts
export const PublicProfileSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarAssetId: z.string().uuid().nullable()
});
```

- [x] **Step 4: Run tests and migrate**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name identity_profile
pnpm vitest run packages/domain/src/identity/profile-service.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db packages/domain packages/contracts
git commit -m "feat: add privacy-safe user profiles"
```

---

### Task 2: Configure Better Auth with password, Google, Apple, and passkeys

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/app/api/auth/[...all]/route.ts`
- Create: `apps/web/src/lib/auth.test.ts`
- Modify: `packages/config/src/server.ts`
- Modify: `.env.example`
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: auth env vars, Prisma.
- Produces: `auth`, Better Auth route handler, passkey/social provider configuration.

- [x] **Step 1: Write failing auth configuration test**

```ts
it("enables required authentication methods", () => {
  const options = buildAuthOptions(testEnv);
  expect(options.emailAndPassword?.enabled).toBe(true);
  expect(Object.keys(options.socialProviders ?? {})).toEqual(
    expect.arrayContaining(["google", "apple"])
  );
  expect(options.plugins?.length).toBeGreaterThan(0);
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/web/src/lib/auth.test.ts`  
Expected: FAIL because `buildAuthOptions` does not exist.

- [x] **Step 3: Implement auth options**

Use the Better Auth Prisma adapter. Enable email/password, email verification, Google, Apple, and passkey plugin. Generate the Better Auth schema additions using the Better Auth CLI and commit the resulting explicit Prisma models/migration.

Add required env keys:

```text
BETTER_AUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
APPLE_CLIENT_ID
APPLE_CLIENT_SECRET
```

No secret values go into `.env.example`.

- [x] **Step 4: Run auth tests and Prisma validation**

Run:
```bash
pnpm vitest run apps/web/src/lib/auth.test.ts
pnpm --filter @sammlerraum/db prisma validate
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/web packages/config packages/db .env.example
git commit -m "feat: add password social and passkey authentication"
```

---

### Task 3: Add session/recovery management constraints

**Files:**
- Create: `packages/domain/src/identity/security-service.ts`
- Create: `packages/domain/src/identity/security-service.test.ts`
- Create: `apps/web/src/app/api/v1/account/sessions/route.ts`
- Create: `apps/web/src/app/api/v1/account/recovery-methods/route.ts`

**Interfaces:**
- Consumes: Better Auth session/passkey/account data.
- Produces: `listSessions`, `revokeSession`, `removeLoginMethod` with last-recovery protection.

- [x] **Step 1: Write failing last-recovery test**

```ts
it("refuses to remove the final verified recovery method", async () => {
  await expect(service.removeLoginMethod(userId, "password"))
    .rejects.toMatchObject({ code: "RECOVERY_METHOD_REQUIRED" });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/identity/security-service.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement security service**

Count verified login/recovery factors before removal. Revoke sessions by stable session ID owned by the user. Return sanitized session metadata: created time, last seen time, user agent label, current-session flag; never return token hashes.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/identity/security-service.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/domain apps/web/src/app/api/v1/account
git commit -m "feat: add account session and recovery controls"
```

---

### Task 4: Implement shared API errors and request validation

**Files:**
- Create: `packages/contracts/src/errors.ts`
- Create: `apps/web/src/lib/api/route-handler.ts`
- Create: `apps/web/src/lib/api/route-handler.test.ts`

**Interfaces:**
- Consumes: Zod, request ID utility.
- Produces: `apiRoute(handler)`, `ApiError`, exact error envelope.

- [x] **Step 1: Write failing error-envelope test**

```ts
it("maps domain errors to the public envelope without a stack", async () => {
  const response = await executeTestRoute(() => {
    throw new ApiError("FORBIDDEN", 403, "Not allowed");
  });
  expect(await response.json()).toEqual({
    error: {
      code: "FORBIDDEN",
      message: "Not allowed",
      requestId: expect.any(String)
    }
  });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/web/src/lib/api/route-handler.test.ts`  
Expected: FAIL.

- [x] **Step 3: Implement route wrapper**

Unknown exceptions return code `INTERNAL_ERROR`, HTTP 500, generic message, and request ID. Zod errors return `VALIDATION_ERROR`, HTTP 400, plus field issue metadata safe for clients.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run apps/web/src/lib/api/route-handler.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/contracts apps/web/src/lib/api
git commit -m "feat: standardize API validation and errors"
```

---

### Task 5: Build deny-by-default policy engine

**Files:**
- Create: `packages/domain/src/authz/policy.ts`
- Create: `packages/domain/src/authz/policy.test.ts`
- Create: `packages/domain/src/authz/types.ts`

**Interfaces:**
- Consumes: authenticated actor + resource facts.
- Produces:
  - `authorize(actor, action, resource): AuthorizationDecision`
  - `assertAuthorized(...): void`

- [ ] **Step 1: Write failing deny-by-default tests**

```ts
it("denies an unknown action by default", () => {
  expect(authorize(actor, "unknown.action" as never, resource)).toEqual({
    allowed: false,
    reason: "NO_POLICY"
  });
});

it("does not let public child visibility override a private ancestor", () => {
  expect(authorize(anonymousActor, "item.view", {
    ...publicItem,
    ancestorVisibility: ["PRIVATE"]
  })).toMatchObject({ allowed: false });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/authz/policy.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement initial policy core**

Define action union now for:
`profile.view`, `collection.view`, `collection.edit`, `item.view`, `item.edit`, `document.view`, `comment.create`, `members.manage`.

Unknown actions/resources deny. Later plans add resource-specific facts without bypassing the engine.

- [ ] **Step 4: Run policy tests**

Run: `pnpm vitest run packages/domain/src/authz/policy.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/authz
git commit -m "feat: add deny-by-default authorization policies"
```

---

### Task 6: Publish initial OpenAPI document and auth E2E smoke

**Files:**
- Create: `packages/contracts/src/openapi.ts`
- Create: `apps/web/src/app/api/openapi.json/route.ts`
- Create: `apps/web/e2e/auth.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Zod contracts.
- Produces: `GET /api/openapi.json`, Playwright login/session smoke.

- [ ] **Step 1: Write failing OpenAPI registration test**

```ts
it("contains the account session endpoint", () => {
  const document = buildOpenApiDocument();
  expect(document.paths["/api/v1/account/sessions"]).toBeDefined();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/contracts/src/openapi.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement OpenAPI generation and E2E**

Generate OpenAPI from registered Zod schemas. Add Playwright coverage for password registration/login and authenticated session listing. Social and passkey UI flows can use provider/browser mocks in CI; their server configuration remains integration-tested.

- [ ] **Step 4: Run the auth suite**

Run:
```bash
pnpm vitest run packages/contracts apps/web/src/lib/auth.test.ts packages/domain/src/identity
pnpm --filter @sammlerraum/web exec playwright test e2e/auth.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts apps/web/e2e apps/web/src/app/api/openapi.json .github/workflows/ci.yml
git commit -m "test: cover authentication and publish OpenAPI"
```

---

### Task 7: Add localized authentication, profile, and security UI

**Files:**
- Create: `apps/web/src/app/[locale]/login/page.tsx`
- Create: `apps/web/src/app/[locale]/register/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/account/profile/page.tsx`
- Create: `apps/web/src/app/[locale]/(app)/account/security/page.tsx`
- Create: `apps/web/src/components/auth/passkey-manager.tsx`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: Better Auth, profile service, session/recovery APIs.
- Produces: complete DE/EN registration, login, social login entry points, passkey management, profile editing, and session revocation UI.

- [ ] **Step 1: Extend the failing E2E test**

```ts
test("user can register, edit public profile, add a passkey, and revoke another session", async ({ page }) => {
  await registerWithPassword(page, "de");
  await page.goto("/de/account/profile");
  await page.getByLabel("Anzeigename").fill("Sammler");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.goto("/de/account/security");
  await expect(page.getByText("Passkeys")).toBeVisible();
  await expect(page.getByText("Aktive Sitzungen")).toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/auth.spec.ts`  
Expected: FAIL because the pages/components do not exist.

- [ ] **Step 3: Implement the UI**

Use only translation keys for visible copy. Password fields use browser password-manager semantics. Social buttons initiate Better Auth Google/Apple flows. Passkey controls expose add/remove only after re-authentication where required. Security page never renders raw tokens or provider secrets.

- [ ] **Step 4: Run E2E and build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/auth.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add account authentication and security UI"
```
