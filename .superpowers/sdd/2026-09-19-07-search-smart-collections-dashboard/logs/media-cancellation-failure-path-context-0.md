# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-documents.spec.ts >> item media and private documents >> public item can have a purchase receipt that remains private (de)
- Location: e2e/media-documents.spec.ts:164:5

# Error details

```
Error: INTENTIONAL_MEDIA_STAGE_FAILURE
```

# Test source

```ts
  269 |           ).toBe(true);
  270 |           await expect(gallery.getByRole("img")).toHaveCount(2);
  271 |           await expect(upload).toBeEnabled();
  272 | 
  273 |           const atStage = gate(`${cancelStage} stage was not reached`);
  274 |           const releaseStage = gate(`${cancelStage} stage was not released`);
  275 |           const atCleanup = gate("post-delete cleanup GET was not reached");
  276 |           const releaseCleanup = gate("post-delete cleanup GET was not released");
  277 |           const failures: unknown[] = [];
  278 |           const events: string[] = [];
  279 |           let linkId: string | undefined;
  280 |           let linkReleased = false;
  281 |           let stageCaptured = false;
  282 |           let cleanupCaptured = false;
  283 |           let compensated = false;
  284 |           const name = `cancel-${cancelStage}.png`;
  285 |           const targetAsset = page
  286 |             .waitForResponse(
  287 |               (response) =>
  288 |                 response.url() === origin + "/api/v1/media/images" &&
  289 |                 response.request().method() === "POST",
  290 |               { timeout: 10_000 },
  291 |             )
  292 |             .then(async (response) => {
  293 |               expect(response.status()).toBe(201);
  294 |               return (await response.json()).asset as { id: string };
  295 |             });
  296 |           const onResponse = (response: Response) => {
  297 |             if (
  298 |               linkId &&
  299 |               response.url() === origin + `${base}/media/${linkId}` &&
  300 |               response.request().method() === "DELETE"
  301 |             ) {
  302 |               expect(response.ok()).toBe(true);
  303 |               compensated = true;
  304 |               events.push("compensating DELETE response");
  305 |             }
  306 |           };
  307 |           const handle = async (route: Route) => {
  308 |             const method = route.request().method();
  309 |             if (
  310 |               method === "POST" &&
  311 |               route.request().postDataJSON().assetId === (await targetAsset).id
  312 |             ) {
  313 |               const response = await route.fetch({ timeout: 10_000 });
  314 |               expect(response.status()).toBe(201);
  315 |               linkId = (await response.json()).link.id;
  316 |               events.push("target link response fetched");
  317 |               if (cancelStage === "link") {
  318 |                 stageCaptured = true;
  319 |                 atStage.release();
  320 |                 await releaseStage.wait();
  321 |               }
  322 |               linkReleased = true;
  323 |               await route.fulfill({ response });
  324 |               events.push("target link response fulfilled");
  325 |             } else if (
  326 |               method === "GET" &&
  327 |               linkReleased &&
  328 |               cancelStage === "reload" &&
  329 |               !stageCaptured
  330 |             ) {
  331 |               // Reserve exactly one request before any await; later GETs cannot satisfy atStage.
  332 |               stageCaptured = true;
  333 |               const response = await route.fetch({ timeout: 10_000 });
  334 |               const listing = await response.json();
  335 |               expect(listing.images.some((link: { id: string }) => link.id === linkId)).toBe(true);
  336 |               events.push("actual onChange GET held");
  337 |               atStage.release();
  338 |               await releaseStage.wait();
  339 |               await route.fulfill({ response });
  340 |               events.push("actual onChange GET fulfilled");
  341 |             } else if (
  342 |               method === "GET" &&
  343 |               compensated &&
  344 |               cancelStage === "reload" &&
  345 |               !cleanupCaptured
  346 |             ) {
  347 |               // Keep the demonstrated late-cleanup schedule in the regression: canceled UI
  348 |               // appears while this real refresh is held, and removal must wait for its fulfill.
  349 |               cleanupCaptured = true;
  350 |               const response = await route.fetch({ timeout: 10_000 });
  351 |               const listing = await response.json();
  352 |               expect(listing.images).toHaveLength(2);
  353 |               expect(listing.images.some((link: { id: string }) => link.id === linkId)).toBe(false);
  354 |               events.push("post-delete cleanup GET held");
  355 |               atCleanup.release();
  356 |               await releaseCleanup.wait();
  357 |               await route.fulfill({ response });
  358 |               events.push("post-delete cleanup GET fulfilled");
  359 |             } else await route.continue();
  360 |           };
  361 |           page.on("response", onResponse);
  362 |           await page.route(`**${base}/media`, handle);
  363 |           try {
  364 |             await Promise.all([
  365 |               targetAsset,
  366 |               upload.setInputFiles({ name, mimeType: "image/png", buffer: png }),
  367 |             ]);
  368 |             await atStage.wait();
> 369 |             if (cancelStage === "reload") throw new Error("INTENTIONAL_MEDIA_STAGE_FAILURE");
      |                                                 ^ Error: INTENTIONAL_MEDIA_STAGE_FAILURE
  370 |             await page.getByRole("button", { name: t.cancel, exact: true }).click();
  371 |             events.push("cancel clicked");
  372 |             releaseStage.release();
  373 |             await expect(page.getByText(t.canceled, { exact: true })).toBeVisible();
  374 |             events.push("canceled visible");
  375 |             await expect(page.getByText(t.uploaded, { exact: true })).toHaveCount(0);
  376 |             await expect.poll(() => db.mediaLink.count({ where: { itemId: item.id } })).toBe(2);
  377 |             if (cancelStage === "reload") {
  378 |               await atCleanup.wait();
  379 |               // A polling GET cannot stand in for the awaited catch refresh: holding it
  380 |               // would let the upload finish and this assertion would fail.
  381 |               await expect(upload).toBeDisabled();
  382 |               events.push("cleanup held while upload remains busy");
  383 |             }
  384 |             const canceledAsset = await db.mediaAsset.findUnique({
  385 |               where: { id: (await targetAsset).id },
  386 |             });
  387 |             expect(canceledAsset?.originalFileName).toBe(name);
  388 |             expect(canceledAsset?.orphanedAt).not.toBeNull();
  389 |           } catch (error) {
  390 |             failures.push(error);
  391 |           } finally {
  392 |             releaseStage.release();
  393 |             releaseCleanup.release();
  394 |             // All page routes here belong to this stage (the network-error route was removed).
  395 |             // wait drains callbacks before Playwright removes/auto-continues server interceptors.
  396 |             try {
  397 |               await bounded(page.unrouteAll({ behavior: "wait" }), "route callbacks did not drain");
  398 |               events.push("callbacks drained before unroute completed");
  399 |               await expect(upload).toBeEnabled({ timeout: 10_000 });
  400 |               events.push("upload finished including catch refresh");
  401 |             } catch (error) {
  402 |               failures.push(error);
  403 |             }
  404 |             page.off("response", onResponse);
  405 |             console.log("MEDIA_CANCELLATION", JSON.stringify({ cancelStage, events }));
  406 |           }
  407 |           if (failures.length === 1) throw failures[0];
  408 |           if (failures.length > 1)
  409 |             throw new AggregateError(failures, "Cancellation and route cleanup failed");
  410 |         }
  411 |         const receiptInput = page.getByLabel(t.doc, { exact: true });
  412 |         await expect(page.getByLabel(t.visibility, { exact: true })).toHaveValue("PRIVATE");
  413 |         await receiptInput.setInputFiles({
  414 |           name: "receipt.pdf",
  415 |           mimeType: "application/pdf",
  416 |           buffer: pdf,
  417 |         });
  418 |         await expect(
  419 |           page.getByRole("link", {
  420 |             name: locale === "de" ? "Dokument herunterladen" : "Download document",
  421 |           }),
  422 |         ).toBeVisible();
  423 |         listed = await (await page.request.get(`${base}/media`)).json();
  424 |         const receipt = listed.documents[0];
  425 |         expect(receipt).toMatchObject({ category: "PURCHASE_RECEIPT", visibility: "PRIVATE" });
  426 |         const receiptUrl = `/api/v1/media/${receipt.asset.id}/original`;
  427 |         await expect(receiptInput).toBeEnabled();
  428 |         await receiptInput.setInputFiles({
  429 |           name: "temporary.pdf",
  430 |           mimeType: "application/pdf",
  431 |           buffer: pdf,
  432 |         });
  433 |         const temporary = page.locator(".media-documents li").filter({ hasText: "temporary.pdf" });
  434 |         await expect(temporary).toBeVisible();
  435 |         await temporary
  436 |           .getByRole("button", {
  437 |             name: locale === "de" ? "Verknüpfung entfernen" : "Remove link",
  438 |             exact: true,
  439 |           })
  440 |           .click();
  441 |         await expect(temporary).toHaveCount(0);
  442 |         const receiptOwner = await page.request.get(receiptUrl);
  443 |         expect(receiptOwner.status()).toBe(200);
  444 |         expect(receiptOwner.headers()["cache-control"]).toContain("no-store");
  445 |         await page
  446 |           .getByLabel(`${t.category}: receipt.pdf`, { exact: true })
  447 |           .selectOption("INVOICE");
  448 |         await expect
  449 |           .poll(
  450 |             async () =>
  451 |               (await (await page.request.get(`${base}/media`)).json()).documents[0].category,
  452 |           )
  453 |           .toBe("INVOICE");
  454 |         await page
  455 |           .getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })
  456 |           .selectOption("PUBLIC");
  457 |         await expect
  458 |           .poll(
  459 |             async () =>
  460 |               (await (await page.request.get(`${base}/media`)).json()).documents[0].visibility,
  461 |           )
  462 |           .toBe("PUBLIC");
  463 |         expect((await foreign.request.get(origin + receiptUrl)).status()).toBe(200);
  464 |         await page
  465 |           .getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })
  466 |           .selectOption("PRIVATE");
  467 |         await expect
  468 |           .poll(
  469 |             async () =>
```