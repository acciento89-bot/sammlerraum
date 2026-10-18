# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: media-documents.spec.ts >> item media and private documents >> public item can have a purchase receipt that remains private (de)
- Location: e2e/media-documents.spec.ts:164:5

# Error details

```
Error: post-link listing must not start polling

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Array [
    "READY",
    "READY",
-   "READY",
+   "PENDING",
  ]
```

# Test source

```ts
  274 |           const releaseStage = gate(`${cancelStage} stage was not released`);
  275 |           const atCleanup = gate("post-delete cleanup GET was not reached");
  276 |           const releaseCleanup = gate("post-delete cleanup GET was not released");
  277 |           const failures: unknown[] = [];
  278 |           const events: string[] = [];
  279 |           let linkId: string | undefined;
  280 |           let linkReleased = false;
  281 |           let stageCaptured = false;
  282 |           let cleanupCaptured = false;
  283 |           let reloadListingStates: string[] = [];
  284 |           let compensated = false;
  285 |           const name = `cancel-${cancelStage}.png`;
  286 |           const targetAsset = page
  287 |             .waitForResponse(
  288 |               (response) =>
  289 |                 response.url() === origin + "/api/v1/media/images" &&
  290 |                 response.request().method() === "POST",
  291 |               { timeout: 10_000 },
  292 |             )
  293 |             .then(async (response) => {
  294 |               expect(response.status()).toBe(201);
  295 |               return (await response.json()).asset as { id: string };
  296 |             });
  297 |           const onResponse = (response: Response) => {
  298 |             if (
  299 |               linkId &&
  300 |               response.url() === origin + `${base}/media/${linkId}` &&
  301 |               response.request().method() === "DELETE"
  302 |             ) {
  303 |               expect(response.ok()).toBe(true);
  304 |               compensated = true;
  305 |               events.push("compensating DELETE response");
  306 |             }
  307 |           };
  308 |           const handle = async (route: Route) => {
  309 |             const method = route.request().method();
  310 |             if (
  311 |               method === "POST" &&
  312 |               route.request().postDataJSON().assetId === (await targetAsset).id
  313 |             ) {
  314 |               const response = await route.fetch({ timeout: 10_000 });
  315 |               expect(response.status()).toBe(201);
  316 |               linkId = (await response.json()).link.id;
  317 |               events.push("target link response fetched");
  318 |               if (cancelStage === "link") {
  319 |                 stageCaptured = true;
  320 |                 atStage.release();
  321 |                 await releaseStage.wait();
  322 |               }
  323 |               linkReleased = true;
  324 |               await route.fulfill({ response });
  325 |               events.push("target link response fulfilled");
  326 |             } else if (
  327 |               method === "GET" &&
  328 |               linkReleased &&
  329 |               cancelStage === "reload" &&
  330 |               !stageCaptured
  331 |             ) {
  332 |               // Reserve exactly one request before any await; later GETs cannot satisfy atStage.
  333 |               stageCaptured = true;
  334 |               const response = await route.fetch({ timeout: 10_000 });
  335 |               const listing = await response.json();
  336 |               expect(listing.images.some((link: { id: string }) => link.id === linkId)).toBe(true);
  337 |               reloadListingStates = [...listing.images, ...listing.documents].map(
  338 |                 (link: { asset: { status: string } }) => link.asset.status,
  339 |               );
  340 |               events.push("actual onChange GET held");
  341 |               atStage.release();
  342 |               await releaseStage.wait();
  343 |               await route.fulfill({ response });
  344 |               events.push("actual onChange GET fulfilled");
  345 |             } else if (
  346 |               method === "GET" &&
  347 |               compensated &&
  348 |               cancelStage === "reload" &&
  349 |               !cleanupCaptured
  350 |             ) {
  351 |               // Keep the demonstrated late-cleanup schedule in the regression: canceled UI
  352 |               // appears while this real refresh is held, and removal must wait for its fulfill.
  353 |               cleanupCaptured = true;
  354 |               const response = await route.fetch({ timeout: 10_000 });
  355 |               const listing = await response.json();
  356 |               expect(listing.images).toHaveLength(2);
  357 |               expect(listing.images.some((link: { id: string }) => link.id === linkId)).toBe(false);
  358 |               events.push("post-delete cleanup GET held");
  359 |               atCleanup.release();
  360 |               await releaseCleanup.wait();
  361 |               await route.fulfill({ response });
  362 |               events.push("post-delete cleanup GET fulfilled");
  363 |             } else await route.continue();
  364 |           };
  365 |           page.on("response", onResponse);
  366 |           await page.route(`**${base}/media`, handle);
  367 |           try {
  368 |             await Promise.all([
  369 |               targetAsset,
  370 |               upload.setInputFiles({ name, mimeType: "image/png", buffer: png }),
  371 |             ]);
  372 |             await atStage.wait();
  373 |             if (cancelStage === "reload") {
> 374 |               expect(reloadListingStates, "post-link listing must not start polling").toEqual(["READY", "READY", "READY"]);
      |                                                                                       ^ Error: post-link listing must not start polling
  375 |             }
  376 |             await page.getByRole("button", { name: t.cancel, exact: true }).click();
  377 |             events.push("cancel clicked");
  378 |             releaseStage.release();
  379 |             await expect(page.getByText(t.canceled, { exact: true })).toBeVisible();
  380 |             events.push("canceled visible");
  381 |             await expect(page.getByText(t.uploaded, { exact: true })).toHaveCount(0);
  382 |             await expect.poll(() => db.mediaLink.count({ where: { itemId: item.id } })).toBe(2);
  383 |             if (cancelStage === "reload") {
  384 |               await atCleanup.wait();
  385 |               // A polling GET cannot stand in for the awaited catch refresh: holding it
  386 |               // would let the upload finish and this assertion would fail.
  387 |               await expect(upload).toBeDisabled();
  388 |               events.push("cleanup held while upload remains busy");
  389 |             }
  390 |             const canceledAsset = await db.mediaAsset.findUnique({
  391 |               where: { id: (await targetAsset).id },
  392 |             });
  393 |             expect(canceledAsset?.originalFileName).toBe(name);
  394 |             expect(canceledAsset?.orphanedAt).not.toBeNull();
  395 |           } catch (error) {
  396 |             failures.push(error);
  397 |           } finally {
  398 |             releaseStage.release();
  399 |             releaseCleanup.release();
  400 |             // All page routes here belong to this stage (the network-error route was removed).
  401 |             // wait drains callbacks before Playwright removes/auto-continues server interceptors.
  402 |             try {
  403 |               await bounded(page.unrouteAll({ behavior: "wait" }), "route callbacks did not drain");
  404 |               events.push("callbacks drained before unroute completed");
  405 |               await expect(upload).toBeEnabled({ timeout: 10_000 });
  406 |               events.push("upload finished including catch refresh");
  407 |             } catch (error) {
  408 |               failures.push(error);
  409 |             }
  410 |             page.off("response", onResponse);
  411 |             console.log("MEDIA_CANCELLATION", JSON.stringify({ cancelStage, events }));
  412 |           }
  413 |           if (failures.length === 1) throw failures[0];
  414 |           if (failures.length > 1)
  415 |             throw new AggregateError(failures, "Cancellation and route cleanup failed");
  416 |         }
  417 |         const receiptInput = page.getByLabel(t.doc, { exact: true });
  418 |         await expect(page.getByLabel(t.visibility, { exact: true })).toHaveValue("PRIVATE");
  419 |         await receiptInput.setInputFiles({
  420 |           name: "receipt.pdf",
  421 |           mimeType: "application/pdf",
  422 |           buffer: pdf,
  423 |         });
  424 |         await expect(
  425 |           page.getByRole("link", {
  426 |             name: locale === "de" ? "Dokument herunterladen" : "Download document",
  427 |           }),
  428 |         ).toBeVisible();
  429 |         listed = await (await page.request.get(`${base}/media`)).json();
  430 |         const receipt = listed.documents[0];
  431 |         expect(receipt).toMatchObject({ category: "PURCHASE_RECEIPT", visibility: "PRIVATE" });
  432 |         const receiptUrl = `/api/v1/media/${receipt.asset.id}/original`;
  433 |         await expect(receiptInput).toBeEnabled();
  434 |         await receiptInput.setInputFiles({
  435 |           name: "temporary.pdf",
  436 |           mimeType: "application/pdf",
  437 |           buffer: pdf,
  438 |         });
  439 |         const temporary = page.locator(".media-documents li").filter({ hasText: "temporary.pdf" });
  440 |         await expect(temporary).toBeVisible();
  441 |         await temporary
  442 |           .getByRole("button", {
  443 |             name: locale === "de" ? "Verknüpfung entfernen" : "Remove link",
  444 |             exact: true,
  445 |           })
  446 |           .click();
  447 |         await expect(temporary).toHaveCount(0);
  448 |         const receiptOwner = await page.request.get(receiptUrl);
  449 |         expect(receiptOwner.status()).toBe(200);
  450 |         expect(receiptOwner.headers()["cache-control"]).toContain("no-store");
  451 |         await page
  452 |           .getByLabel(`${t.category}: receipt.pdf`, { exact: true })
  453 |           .selectOption("INVOICE");
  454 |         await expect
  455 |           .poll(
  456 |             async () =>
  457 |               (await (await page.request.get(`${base}/media`)).json()).documents[0].category,
  458 |           )
  459 |           .toBe("INVOICE");
  460 |         await page
  461 |           .getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })
  462 |           .selectOption("PUBLIC");
  463 |         await expect
  464 |           .poll(
  465 |             async () =>
  466 |               (await (await page.request.get(`${base}/media`)).json()).documents[0].visibility,
  467 |           )
  468 |           .toBe("PUBLIC");
  469 |         expect((await foreign.request.get(origin + receiptUrl)).status()).toBe(200);
  470 |         await page
  471 |           .getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })
  472 |           .selectOption("PRIVATE");
  473 |         await expect
  474 |           .poll(
```