### Task 1: Add AI provider contract, job, and suggestion schema

**Files:**
- Create: `packages/ai/package.json`
- Create: `packages/ai/src/types.ts`
- Create: `packages/contracts/src/ai.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/ai/ai-analysis-service.ts`
- Create: `packages/domain/src/ai/ai-analysis-service.test.ts`

**Interfaces:**
- Produces:
  - `AIProvider.analyzeCollectible(input): Promise<CollectibleAnalysis>`
  - `requestItemAnalysis(actor, itemId, assetIds): Promise<AIAnalysisJob>`.

- [ ] **Step 1: Write failing no-auto-mutation test**

```ts
it("stores suggestions without changing the item", async () => {
  const before = await itemRepo.get(itemId);
  await service.storeAnalysisResult(jobId, validAnalysis);
  const after = await itemRepo.get(itemId);
  expect(after).toEqual(before);
  expect(await suggestionRepo.forJob(jobId)).not.toHaveLength(0);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/ai/ai-analysis-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement canonical analysis schema**

```ts
export const CollectibleAnalysisSchema = z.object({
  categoryKey: z.string().nullable(),
  title: z.string().nullable(),
  manufacturer: z.string().nullable(),
  seriesOrSet: z.string().nullable(),
  year: z.number().int().min(1).max(3000).nullable(),
  identifiers: z.array(z.object({ type: z.string(), value: z.string() })),
  catalogCandidates: z.array(z.object({
    catalogEntryId: z.string().uuid(),
    catalogVariantId: z.string().uuid().nullable(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string())
  })),
  warnings: z.array(z.string())
});
```

Persist `AIAnalysisJob`, usage metadata, status, provider/model, and immutable suggestion payload.

- [ ] **Step 4: Migrate and test**

Run:
```bash
pnpm --filter @sammlerraum/db prisma migrate dev --name ai_analysis
pnpm vitest run packages/domain/src/ai
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai packages/contracts/src/ai.ts packages/db packages/domain/src/ai
git commit -m "feat: add provider-neutral AI analysis model"
```

---

