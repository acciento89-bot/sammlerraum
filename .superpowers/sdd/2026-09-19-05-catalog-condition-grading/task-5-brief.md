### Task 5: Add grading records

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/domain/src/grading/grading-service.ts`
- Create: `packages/domain/src/grading/grading-service.test.ts`

**Interfaces:**
- Produces: `addGrading`, `updateGrading`, `removeGrading`.

- [ ] **Step 1: Write failing provider-scope test**

```ts
it("allows equal certificate numbers across different providers", async () => {
  await service.addGrading(itemA, { provider: "PSA", certificateNo: "123", grade: "10" });
  await expect(service.addGrading(itemB, { provider: "CGC", certificateNo: "123", grade: "10" }))
    .resolves.toBeDefined();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/domain/src/grading/grading-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement grading model**

Store provider, grade as normalized string plus optional numeric comparable value, certificate number, graded date, verification URL, and provenance/source.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/domain/src/grading`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/domain/src/grading
git commit -m "feat: add external grading records"
```

---

