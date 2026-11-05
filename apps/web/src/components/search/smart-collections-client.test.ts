import { afterEach, expect, it, vi } from "vitest";
import {
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  resolveSavedItems,
  SavedMutationUnknownError,
} from "./smart-collections-client";
const id = "00000000-0000-4000-8000-000000000001";
const query = { text: "private-query", filter: null, lifecycle: "ACTIVE" as const, limit: 20 };
const detail = {
  id,
  name: "Saved",
  revision: 3,
  createdAt: "2026-11-05T12:00:00.000Z",
  updatedAt: "2026-11-05T12:00:00.000Z",
  definition: { version: 1, text: query.text, filter: null, lifecycle: "ACTIVE" },
};
afterEach(() => vi.unstubAllGlobals());
it("creates a complete normalized definition in a private POST, without result IDs or cursor", async () => {
  const fetcher = vi.fn(async () => Response.json(detail, { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await createSavedSearch(
      " Saved ",
      { ...query, cursor: "private-cursor" },
      new AbortController().signal,
    ),
  ).toEqual(detail);
  const [url, request] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
  expect(url).toBe("/api/v1/smart-collections");
  expect(request.method).toBe("POST");
  expect(JSON.parse(String(request.body))).toEqual({
    name: "Saved",
    text: query.text,
    f: null,
    lifecycle: "ACTIVE",
  });
  expect(request.cache).toBe("no-store");
});
it("sends the fetched revision on full replacement and delete, never a newer guessed revision", async () => {
  const fetcher = vi.fn(async (_url: string, request: RequestInit) =>
    Response.json(request.method === "DELETE" ? { id, revision: 4 } : detail),
  );
  vi.stubGlobal("fetch", fetcher);
  await updateSavedSearch(id, 2, "Saved", detail.definition, new AbortController().signal);
  expect(JSON.parse(String(fetcher.mock.calls[0]![1].body)).expectedRevision).toBe(2);
  expect(fetcher.mock.calls[0]![1].method).toBe("PATCH");
  await deleteSavedSearch(id, 3, new AbortController().signal);
  expect(fetcher.mock.calls[1]![1].method).toBe("DELETE");
  expect(JSON.parse(String(fetcher.mock.calls[1]![1].body))).toEqual({ expectedRevision: 3 });
});
it("keeps conflict rejection distinct from a lost acknowledgement without automatic retries", async () => {
  const conflict = vi.fn(async () =>
    Response.json({ error: { code: "SMART_COLLECTION_CONFLICT" } }, { status: 409 }),
  );
  vi.stubGlobal("fetch", conflict);
  await expect(
    updateSavedSearch(id, 2, "Saved", detail.definition, new AbortController().signal),
  ).rejects.toMatchObject({ status: 409, code: "SMART_COLLECTION_CONFLICT" });
  expect(conflict).toHaveBeenCalledTimes(1);
  const lost = vi.fn(async () => {
    throw new TypeError("network lost");
  });
  vi.stubGlobal("fetch", lost);
  await expect(
    createSavedSearch("Saved", query, new AbortController().signal),
  ).rejects.toBeInstanceOf(SavedMutationUnknownError);
  expect(lost).toHaveBeenCalledTimes(1);
});
it("treats a malformed success acknowledgement as unknown rather than retrying a write", async () => {
  const fetcher = vi.fn(async () => Response.json({ id }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    createSavedSearch("Saved", query, new AbortController().signal),
  ).rejects.toBeInstanceOf(SavedMutationUnknownError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects invalid IDs, revisions and oversize input before making requests", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(deleteSavedSearch("not-an-id", 2, new AbortController().signal)).rejects.toThrow();
  await expect(deleteSavedSearch(id, 0, new AbortController().signal)).rejects.toThrow();
  await expect(
    createSavedSearch("x".repeat(101), query, new AbortController().signal),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("resolves saved membership with only server-saved ID, page size and cursor", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      items: [],
      total: 0,
      nextCursor: null,
      scope: "OWNED",
      lifecycle: "ACTIVE",
      readAt: "2026-11-05T12:00:00.000Z",
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await resolveSavedItems(id, new AbortController().signal, { limit: 20, cursor: "opaque" });
  const [url] = fetcher.mock.calls[0]! as unknown as [string];
  expect(url).toBe(`/api/v1/smart-collections/${id}/items?limit=20&cursor=opaque`);
  expect(url).not.toContain(query.text);
});

it("binds member reads to the displayed monotonic revision instead of mixing concurrent definitions", async () => {
  const { resolveSavedSearchPage, SavedRevisionChangedError } = await import(
    "./smart-collections-client"
  );
  const page = {
    items: [],
    total: 0,
    nextCursor: null,
    scope: "OWNED",
    lifecycle: "ACTIVE",
    readAt: "2026-11-05T12:00:00.000Z",
  };
  const fetcher = vi.fn(async (url: string) =>
    Response.json(url.includes("/items?") ? page : detail),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(resolveSavedSearchPage(id, 2, new AbortController().signal)).rejects.toBeInstanceOf(
    SavedRevisionChangedError,
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(resolveSavedSearchPage(id, 3, new AbortController().signal)).resolves.toEqual(page);
});
it("does not publish members when the post-read revision check fails or returns an older revision", async () => {
  const { resolveSavedSearchPage } = await import("./smart-collections-client");
  const page = {
    items: [],
    total: 0,
    nextCursor: null,
    scope: "OWNED",
    lifecycle: "ACTIVE",
    readAt: "2026-11-05T12:00:00.000Z",
  };
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("/items?")) return Response.json(page);
    throw new TypeError("verification connection lost");
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(resolveSavedSearchPage(id, 3, new AbortController().signal)).rejects.toThrow(
    "verification connection lost",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(url.includes("/items?") ? page : { ...detail, revision: 2 }),
    ),
  );
  await expect(resolveSavedSearchPage(id, 3, new AbortController().signal)).rejects.toMatchObject({
    status: 500,
  });
});
it("detects a new definition behind a rejected revision-bound cursor without retrying the item read", async () => {
  const { resolveSavedSearchPage, SavedRevisionChangedError } = await import(
    "./smart-collections-client"
  );
  const fetcher = vi.fn(async (url: string) =>
    url.includes("/items?")
      ? Response.json({ error: { code: "SEARCH_INVALID" } }, { status: 400 })
      : Response.json(detail),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    resolveSavedSearchPage(id, 2, new AbortController().signal, { cursor: "old-cursor" }),
  ).rejects.toBeInstanceOf(SavedRevisionChangedError);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not make a revision check after an aborted read or an authorization rejection", async () => {
  const { resolveSavedSearchPage } = await import("./smart-collections-client");
  const controller = new AbortController(),
    page = {
      items: [],
      total: 0,
      nextCursor: null,
      scope: "OWNED",
      lifecycle: "ACTIVE",
      readAt: "2026-11-05T12:00:00.000Z",
    };
  const fetcher = vi.fn(async () => {
    controller.abort();
    return Response.json(page);
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(resolveSavedSearchPage(id, 3, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const forbidden = vi.fn(async () =>
    Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
  );
  vi.stubGlobal("fetch", forbidden);
  await expect(resolveSavedSearchPage(id, 3, new AbortController().signal)).rejects.toMatchObject({
    status: 403,
  });
  expect(forbidden).toHaveBeenCalledTimes(1);
});
