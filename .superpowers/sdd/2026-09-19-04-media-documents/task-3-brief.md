### Task 3: Add image variant worker

**Files:**
- Create: `apps/worker/src/jobs/process-image.ts`
- Create: `apps/worker/src/jobs/process-image.test.ts`
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: job `media.process-image { assetId }`.
- Produces: variants `THUMBNAIL`, `MEDIUM`, `LARGE`, processing status.

- [ ] **Step 1: Write failing EXIF/variant test**

```ts
it("creates required variants and strips metadata", async () => {
  await handler({ assetId });
  const variants = await repo.listVariants(assetId);
  expect(variants.map(v => v.kind).sort()).toEqual(["LARGE", "MEDIUM", "THUMBNAIL"]);
  for (const variant of variants) {
    const metadata = await sharp(await storage.read(variant.storageKey)).metadata();
    expect(metadata.exif).toBeUndefined();
  }
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/process-image.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement handler**

Decode source once per job. Generate max-edge sizes 256, 640, 1600 while preserving aspect ratio and never upscaling. Output WebP for derived variants. Mark failures with an error code and leave original intact.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/worker/src/jobs/process-image.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs apps/worker/src/main.ts
git commit -m "feat: process secure image variants"
```

---

