# AI-Assisted Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-abstracted photo analysis that proposes structured item metadata, catalog matches, and visible identifiers while requiring user confirmation before personal records change.

**Architecture:** AI analysis is an asynchronous job over authorized media assets. Providers return one canonical internal suggestion schema. Suggestions persist separately from items until explicitly accepted field-by-field.

**Tech Stack:** TypeScript, Zod, official OpenAI SDK as the first provider adapter, pg-boss, Prisma 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- AI output is advisory.
- AI never auto-confirms authenticity, market value, rarity, grading, provenance, condition, or ambiguous variant identity.
- Only assets needed for the user-requested analysis are sent to the provider.
- Provider-specific response shapes do not leak into item/domain models.
- Usage is measurable for later premium quotas.

## Review Focus

1. Malformed/partial provider JSON must fail validation without mutating an item.
2. A user cannot analyze another user's private media without authorization.
3. Retried analysis job must not create duplicate suggestion sets.
4. Sensitive document assets are never sent when the request asked to analyze an item photo.
5. Rejecting a suggestion must leave existing item data untouched.

---

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

### Task 2: Implement the first OpenAI provider adapter

**Files:**
- Create: `packages/ai/src/openai-provider.ts`
- Create: `packages/ai/src/openai-provider.test.ts`
- Modify: `packages/config/src/server.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `AI_OPENAI_API_KEY`, `AI_OPENAI_MODEL`.
- Produces: `OpenAICollectibleProvider` implementing `AIProvider`.

- [ ] **Step 1: Write failing schema-validation test**

```ts
it("rejects provider output that does not satisfy the canonical schema", async () => {
  fakeClient.responses.create.mockResolvedValue(invalidProviderResponse);
  await expect(provider.analyzeCollectible(input))
    .rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/ai/src/openai-provider.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement adapter**

Use the official SDK response API with a system instruction that explicitly forbids asserting authenticity/value/grading/provenance as facts and requires structured JSON conforming to `CollectibleAnalysisSchema`. Convert only authorized image bytes to provider input. Parse and validate the final output through Zod before returning it.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/ai/src/openai-provider.test.ts`  
Expected: PASS using a fake SDK client; no real API request in CI.

- [ ] **Step 5: Commit**

```bash
git add packages/ai packages/config .env.example
git commit -m "feat: add initial AI vision provider"
```

---

### Task 3: Add AI analysis worker with authorization snapshot and idempotency

**Files:**
- Create: `apps/worker/src/jobs/analyze-item.ts`
- Create: `apps/worker/src/jobs/analyze-item.test.ts`
- Modify: `apps/worker/src/main.ts`

**Interfaces:**
- Consumes: `ai.analyze-item { analysisJobId }`.
- Produces: validated persisted suggestion set + usage metrics.

- [ ] **Step 1: Write failing retry/private-media tests**

```ts
it("does not create a second suggestion set on retry", async () => {
  await handler({ analysisJobId });
  await handler({ analysisJobId });
  expect(await suggestionRepo.countByJob(analysisJobId)).toBe(1);
});

it("fails if a referenced asset is no longer authorized for the requesting user", async () => {
  revokeAssetAccess();
  await expect(handler({ analysisJobId }))
    .rejects.toMatchObject({ code: "AI_SOURCE_NOT_AUTHORIZED" });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/analyze-item.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement handler**

Re-check current media policy before provider call. Accept image-purpose assets only; never follow arbitrary document links. Record provider/model/input image count and provider-reported usage if available.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/worker/src/jobs/analyze-item.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/jobs/analyze-item* apps/worker/src/main.ts
git commit -m "feat: process AI item analysis jobs"
```

---

### Task 4: Add field-by-field suggestion confirmation

**Files:**
- Create: `packages/domain/src/ai/suggestion-apply-service.ts`
- Create: `packages/domain/src/ai/suggestion-apply-service.test.ts`
- Create: `apps/web/src/app/api/v1/ai/analyses/[analysisId]/apply/route.ts`

**Interfaces:**
- Produces: `applySuggestions(actor, analysisId, selections)`.

- [ ] **Step 1: Write failing rejection/partial-acceptance test**

```ts
it("applies selected title but leaves rejected manufacturer untouched", async () => {
  await service.applySuggestions(actor, analysisId, {
    title: true,
    manufacturer: false
  });
  const item = await itemRepo.get(itemId);
  expect(item.title).toBe(aiTitle);
  expect(item.manufacturer).toBe(originalManufacturer);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/ai/suggestion-apply-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement explicit selections**

Only whitelisted fields can be applied. Catalog candidate linking requires a separate explicit candidate selection. Condition/grading/value/authenticity/provenance remain outside automatic apply.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/ai`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ai apps/web/src/app/api/v1/ai
git commit -m "feat: require confirmation for AI suggestions"
```

---

### Task 5: Add AI capture UI and usage hooks

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/items/[itemId]/ai/page.tsx`
- Create: `apps/web/src/components/ai/analysis-review.tsx`
- Create: `apps/web/e2e/ai-capture.spec.ts`
- Modify: `apps/web/messages/de.json`
- Modify: `apps/web/messages/en.json`
- Create: `packages/domain/src/ai/usage-service.ts`

**Interfaces:**
- Produces: photo selection → queued analysis → progress → review → apply flow; `getAIUsage(userId, period)`.

- [ ] **Step 1: Write failing E2E confirmation test**

```ts
test("AI suggestions do not change the item until the user confirms them", async ({ page }) => {
  await startSeededAnalysis(page);
  await expect(page.getByLabel("Titel")).toHaveValue(originalTitle);
  await reviewSuggestion(page, "Titel", suggestedTitle);
  await expect(page.getByLabel("Titel")).toHaveValue(suggestedTitle);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm --filter @sammlerraum/web exec playwright test e2e/ai-capture.spec.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement UI**

Show warnings prominently, confidence only as provider evidence aid, never as authenticity score. Poll job status with bounded backoff. Display usage count through usage service so billing plan can enforce quotas later.

- [ ] **Step 4: Run E2E/build**

Run:
```bash
pnpm --filter @sammlerraum/web exec playwright test e2e/ai-capture.spec.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/domain/src/ai/usage-service.ts
git commit -m "feat: add AI-assisted item capture flow"
```
