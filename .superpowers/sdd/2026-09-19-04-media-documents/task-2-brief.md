### Task 2: Add media/document models and upload validation

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/media/media-service.ts`
- Create: `packages/domain/src/media/media-service.test.ts`
- Create: `packages/contracts/src/media.ts`

**Interfaces:**
- Consumes: `StorageProvider`, Prisma, queue.
- Produces: `createImageUpload`, `createDocumentUpload`, `linkAsset`.

- [ ] **Step 1: Write failing spoofed MIME and size tests**

```ts
it("rejects a PDF renamed to .jpg", async () => {
  await expect(service.createImageUpload(actor, fakePdfBytes, {
    fileName: "photo.jpg",
    claimedMime: "image/jpeg"
  })).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE" });
});

it("rejects a source over the configured byte limit", async () => {
  await expect(service.createImageUpload(actor, oversizedBytes, meta))
    .rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/media/media-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement models and validation**

Add `MediaAsset`, `MediaVariant`, `MediaLink`, `DocumentLink`, processing status, size, checksum, MIME, width/height, original filename metadata.

Use `file-type` and Sharp decode for images. Enforce explicit byte and megapixel limits from config. Document allowlist starts with PDF and common image types; unsupported active formats are rejected.

- [ ] **Step 4: Run migration and tests**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name media_documents
pnpm vitest run packages/domain/src/media
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/media packages/contracts/src/media.ts
git commit -m "feat: add validated media and document uploads"
```

---

