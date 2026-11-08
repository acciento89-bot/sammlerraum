### Task 6: Add email provider abstraction and delivery worker

**Files:**
- Create: `packages/email/package.json`
- Create: `packages/email/src/types.ts`
- Create: `packages/email/src/smtp-provider.ts`
- Create: `apps/worker/src/jobs/send-email.ts`
- Create: `apps/worker/src/jobs/send-email.test.ts`
- Modify: `packages/config/src/server.ts`

**Interfaces:**
- Produces: `EmailProvider.send(message)`, job `notification.send-email`.

- [ ] **Step 1: Write failing retry-dedupe test**

```ts
it("does not send the same delivery record twice after successful retry acknowledgement", async () => {
  await handler({ deliveryId });
  await handler({ deliveryId });
  expect(fakeProvider.sent).toHaveLength(1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/worker/src/jobs/send-email.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement SMTP adapter and delivery records**

Use required production SMTP env config. Persist delivery status and provider message ID. Render DE/EN templates from stable notification type data; never embed sensitive private content in generic community email subjects.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/email apps/worker/src/jobs/send-email.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/email apps/worker/src/jobs/send-email* packages/config
git commit -m "feat: deliver localized notification emails"
```

---

