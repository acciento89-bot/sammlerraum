### Task 4: Add protected media read API and policy rules

**Files:**
- Create: `apps/web/src/app/api/v1/media/[assetId]/[variant]/route.ts`
- Create: `apps/web/src/app/api/v1/media/media-read.test.ts`
- Modify: `packages/domain/src/authz/policy.ts`

**Interfaces:**
- Consumes: media ownership/link facts.
- Produces: authorized byte streaming.

- [ ] **Step 1: Write failing guessed-ID tests**

```ts
it("returns 404 for an unauthorized private document UUID", async () => {
  const response = await readMediaAs(otherUser, privateDocumentAssetId, "original");
  expect(response.status).toBe(404);
});

it("allows an anonymous read only for explicitly public image links", async () => {
  const response = await readMediaAs(null, publicItemImageAssetId, "medium");
  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/web/src/app/api/v1/media/media-read.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement route**

Resolve asset link/purpose first, load visibility ancestors, call policy engine, then stream bytes with content type, immutable ETag from checksum, and appropriate private/public cache headers.

Documents default to private even when linked to a public item unless `DocumentLink.visibility` explicitly permits the viewer.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/web/src/app/api/v1/media packages/domain/src/authz`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/media packages/domain/src/authz
git commit -m "feat: protect media and document reads"
```

---
