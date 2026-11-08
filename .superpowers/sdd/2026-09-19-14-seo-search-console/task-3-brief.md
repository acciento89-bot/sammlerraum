### Task 3: Add search-engine indexing preference for public profiles

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/seo/indexability.ts`
- Create: `packages/domain/src/seo/indexability.test.ts`
- Modify: `packages/domain/src/identity/profile-service.ts`
- Create: `apps/web/src/components/profile/search-indexing-control.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/account/profile/page.tsx`

**Interfaces:**
- Adds `UserProfile.searchEngineIndexingEnabled Boolean @default(false)`.
- Produces `getPublicIndexability(resource, ancestors, profile): IndexabilityDecision`.

- [ ] **Step 1: Write failing ancestor/opt-in tests**

```ts
it("defaults a public profile to noindex until the owner opts in", () => {
  expect(getPublicIndexability(publicProfileFixture, [], {
    searchEngineIndexingEnabled: false,
  })).toEqual({ index: false, reason: "PROFILE_OPT_OUT" });
});

it("never indexes a public child below a private ancestor", () => {
  expect(getPublicIndexability(publicItemFixture, [{ visibility: "PRIVATE" }], {
    searchEngineIndexingEnabled: true,
  })).toEqual({ index: false, reason: "PRIVATE_ANCESTOR" });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run packages/domain/src/seo/indexability.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Add the schema field and migration**

Run after implementation:

```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name public_search_indexing_preference
```

Default every existing/new profile to false.

- [ ] **Step 4: Implement indexability decision**

Reasons include:
- `PROFILE_OPT_OUT`;
- `RESOURCE_NOT_PUBLIC`;
- `PRIVATE_ANCESTOR`;
- `MODERATION_HIDDEN`;
- `SOFT_DELETED`;
- `INDEXABLE`.

The decision is derived server-side and reused by page metadata and sitemap queries.

- [ ] **Step 5: Add explicit profile setting UI**

Copy must explain that public Sammlerraum visibility and Google/Bing indexing are separate. Turning indexing off does not make already-public content private.

- [ ] **Step 6: Run GREEN/build**

Run:

```bash
pnpm vitest run packages/domain/src/seo packages/domain/src/identity
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db packages/domain/src/seo packages/domain/src/identity apps/web/src/components/profile apps/web/src/app/[locale]/\(app\)/account/profile
git commit -m "feat: add public search-engine indexing preference"
```

---

