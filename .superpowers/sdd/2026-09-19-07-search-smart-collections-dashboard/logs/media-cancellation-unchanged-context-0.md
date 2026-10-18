# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-documents.spec.ts >> item media and private documents >> public item can have a purchase receipt that remains private (de)
- Location: e2e/media-documents.spec.ts:143:5

# Error details

```
Error: route.fulfill: Route is already handled!
```

# Test source

```ts
  156 |           collectionId: collection.id,
  157 |           title: "Sammlerstück",
  158 |           visibility: "PUBLIC",
  159 |           privateNotes: "SECRET NOTE",
  160 |           purchaseAmountMinor: 12345,
  161 |           purchaseCurrency: "EUR",
  162 |         },
  163 |       });
  164 |       const base = `/api/v1/items/${item.id}`;
  165 |       const foreign = await browser.newContext();
  166 |       try {
  167 |         expect(
  168 |           (
  169 |             await page.request.post("/api/auth/sign-in/email", {
  170 |               data: { email: owner.email, password: owner.password },
  171 |               headers: { origin },
  172 |             })
  173 |           ).status(),
  174 |         ).toBe(200);
  175 |         await page.goto(`/${locale}/items/${item.id}`);
  176 |         const upload = page.getByLabel(t.upload, { exact: true });
  177 |         await expect(upload).toBeVisible();
  178 |         await expect(upload).toBeEnabled();
  179 |         await upload.setInputFiles({ name: "spoof.png", mimeType: "image/png", buffer: pdf });
  180 |         await expect(page.locator(".item-media p[role=alert]")).toContainText(t.typeError);
  181 |         await expect(upload).toBeEnabled();
  182 |         await upload.setInputFiles({
  183 |           name: "oversize.png",
  184 |           mimeType: "image/png",
  185 |           buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  186 |         });
  187 |         await expect(page.locator(".item-media p[role=alert]")).toContainText(t.tooLarge);
  188 |         await page.route("**/api/v1/media/images", (route) => route.abort("failed"));
  189 |         await expect(upload).toBeEnabled();
  190 |         await upload.setInputFiles({ name: "network.png", mimeType: "image/png", buffer: png });
  191 |         await expect(page.locator(".item-media p[role=alert]")).toContainText(t.error);
  192 |         await page.unroute("**/api/v1/media/images");
  193 |         for (const name of ["first.png", "second.png"]) {
  194 |           await expect(upload).toBeEnabled();
  195 |           await upload.setInputFiles({ name, mimeType: "image/png", buffer: png });
  196 |           await expect(page.getByRole("img", { name, exact: true })).toBeVisible({
  197 |             timeout: 50_000,
  198 |           });
  199 |         }
  200 |         let listed = await (await page.request.get(`${base}/media`)).json();
  201 |         expect(listed.images).toHaveLength(2);
  202 |         const firstId = listed.images[0].id;
  203 |         const secondId = listed.images[1].id;
  204 |         const imageId = listed.images[0].asset.id;
  205 |         expect(await db.mediaVariant.count({ where: { assetId: imageId } })).toBe(3);
  206 |         expect(
  207 |           (await page.request.get(`/api/v1/media/${imageId}/medium`)).headers()["content-type"],
  208 |         ).toContain("image/webp");
  209 |         const gallery = page.locator(".media-grid");
  210 |         await gallery
  211 |           .locator("li")
  212 |           .nth(1)
  213 |           .getByRole("button", { name: t.title, exact: true })
  214 |           .click();
  215 |         await expect(gallery.locator("li").first()).toContainText("second.png");
  216 |         if (info.project.name === "desktop") {
  217 |           await gallery.locator("li").first().dragTo(gallery.locator("li").nth(1));
  218 |         } else {
  219 |           const down = page.getByRole("button", { name: `${t.down}: second.png`, exact: true });
  220 |           await down.focus();
  221 |           await page.keyboard.press("Enter");
  222 |         }
  223 |         await expect(gallery.locator("li").first()).toContainText("first.png");
  224 |         await page.getByRole("button", { name: `${t.up}: second.png`, exact: true }).click();
  225 |         await expect(gallery.locator("li").first()).toContainText("second.png");
  226 |         await page.reload();
  227 |         await expect(gallery.locator("li").first()).toContainText("second.png");
  228 |         listed = await (await page.request.get(`${base}/media`)).json();
  229 |         expect(listed.images.map((link: { id: string }) => link.id)).toEqual([secondId, firstId]);
  230 |         expect(JSON.stringify(listed)).not.toMatch(/storageKey|originals\/|ownerId|checksumSha256/);
  231 |         // Exercise cancellation while the link response and while the subsequent refresh are in flight.
  232 |         for (const cancelStage of ["link", "reload"]) {
  233 |           let releaseRequest = () => {};
  234 |           let reachedStage = () => {};
  235 |           let didLink = false;
  236 |           const atStage = new Promise<void>((resolve) => {
  237 |             reachedStage = resolve;
  238 |           });
  239 |           const release = new Promise<void>((resolve) => {
  240 |             releaseRequest = resolve;
  241 |           });
  242 |           await page.route(`**${base}/media`, async (route) => {
  243 |             const method = route.request().method();
  244 |             if (method === "POST") {
  245 |               const response = await route.fetch();
  246 |               didLink = true;
  247 |               if (cancelStage === "link") {
  248 |                 reachedStage();
  249 |                 await release;
  250 |               }
  251 |               await route.fulfill({ response });
  252 |             } else if (method === "GET" && didLink && cancelStage === "reload") {
  253 |               const response = await route.fetch();
  254 |               reachedStage();
  255 |               await release;
> 256 |               await route.fulfill({ response });
      |                           ^ Error: route.fulfill: Route is already handled!
  257 |             } else await route.continue();
  258 |           });
  259 |           await expect(upload).toBeEnabled();
  260 |           const name = `cancel-${cancelStage}.png`;
  261 |           await upload.setInputFiles({ name, mimeType: "image/png", buffer: png });
  262 |           await atStage;
  263 |           await page.getByRole("button", { name: t.cancel, exact: true }).click();
  264 |           releaseRequest();
  265 |           await expect(page.getByText(t.canceled, { exact: true })).toBeVisible();
  266 |           await expect(page.getByText(t.uploaded, { exact: true })).toHaveCount(0);
  267 |           await expect.poll(() => db.mediaLink.count({ where: { itemId: item.id } })).toBe(2);
  268 |           await page.unroute(`**${base}/media`);
  269 |           const canceledAsset = await db.mediaAsset.findFirst({
  270 |             where: { ownerId: owner.id, originalFileName: name },
  271 |           });
  272 |           expect(canceledAsset).not.toBeNull();
  273 |           expect(canceledAsset?.orphanedAt).not.toBeNull();
  274 |         }
  275 |         const receiptInput = page.getByLabel(t.doc, { exact: true });
  276 |         await expect(page.getByLabel(t.visibility, { exact: true })).toHaveValue("PRIVATE");
  277 |         await receiptInput.setInputFiles({
  278 |           name: "receipt.pdf",
  279 |           mimeType: "application/pdf",
  280 |           buffer: pdf,
  281 |         });
  282 |         await expect(
  283 |           page.getByRole("link", {
  284 |             name: locale === "de" ? "Dokument herunterladen" : "Download document",
  285 |           }),
  286 |         ).toBeVisible();
  287 |         listed = await (await page.request.get(`${base}/media`)).json();
  288 |         const receipt = listed.documents[0];
  289 |         expect(receipt).toMatchObject({ category: "PURCHASE_RECEIPT", visibility: "PRIVATE" });
  290 |         const receiptUrl = `/api/v1/media/${receipt.asset.id}/original`;
  291 |         await expect(receiptInput).toBeEnabled();
  292 |         await receiptInput.setInputFiles({
  293 |           name: "temporary.pdf",
  294 |           mimeType: "application/pdf",
  295 |           buffer: pdf,
  296 |         });
  297 |         const temporary = page.locator(".media-documents li").filter({ hasText: "temporary.pdf" });
  298 |         await expect(temporary).toBeVisible();
  299 |         await temporary
  300 |           .getByRole("button", {
  301 |             name: locale === "de" ? "Verknüpfung entfernen" : "Remove link",
  302 |             exact: true,
  303 |           })
  304 |           .click();
  305 |         await expect(temporary).toHaveCount(0);
  306 |         const receiptOwner = await page.request.get(receiptUrl);
  307 |         expect(receiptOwner.status()).toBe(200);
  308 |         expect(receiptOwner.headers()["cache-control"]).toContain("no-store");
  309 |         await page
  310 |           .getByLabel(`${t.category}: receipt.pdf`, { exact: true })
  311 |           .selectOption("INVOICE");
  312 |         await expect
  313 |           .poll(
  314 |             async () =>
  315 |               (await (await page.request.get(`${base}/media`)).json()).documents[0].category,
  316 |           )
  317 |           .toBe("INVOICE");
  318 |         await page
  319 |           .getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })
  320 |           .selectOption("PUBLIC");
  321 |         await expect
  322 |           .poll(
  323 |             async () =>
  324 |               (await (await page.request.get(`${base}/media`)).json()).documents[0].visibility,
  325 |           )
  326 |           .toBe("PUBLIC");
  327 |         expect((await foreign.request.get(origin + receiptUrl)).status()).toBe(200);
  328 |         await page
  329 |           .getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })
  330 |           .selectOption("PRIVATE");
  331 |         await expect
  332 |           .poll(
  333 |             async () =>
  334 |               (await (await page.request.get(`${base}/media`)).json()).documents[0].visibility,
  335 |           )
  336 |           .toBe("PRIVATE");
  337 |         await page.reload();
  338 |         await expect(page.getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })).toHaveValue(
  339 |           "PRIVATE",
  340 |         );
  341 |         expect(
  342 |           (
  343 |             await page.request.put(`${base}/media`, {
  344 |               data: { linkIds: [firstId, secondId] },
  345 |               headers: { origin: "https://evil.invalid" },
  346 |             })
  347 |           ).status(),
  348 |         ).toBe(403);
  349 |         expect(
  350 |           (
  351 |             await page.request.patch(`${base}/documents/${receipt.id}`, {
  352 |               data: { category: "INVOICE", visibility: "PUBLIC" },
  353 |               headers: { origin: "https://evil.invalid" },
  354 |             })
  355 |           ).status(),
  356 |         ).toBe(403);
```