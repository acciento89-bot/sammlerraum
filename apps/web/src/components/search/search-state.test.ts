import { describe, expect, it } from "vitest";
import { parseItemFilter, type ItemFilterNode } from "@sammlerraum/contracts/search";
import { multiLeafReferenceDraft } from "../../../../../packages/contracts/src/search-references.fixture";
import { toDraft, fromDraft, available, operators, newLeaf } from "./filter-draft";
import { MetadataCache, RequestChannel } from "./search-state";
import { QueryStore, parseSearchLocation, writeSearchHistory } from "./search-url-state";
const query = {
  text: "private-certificate",
  filter: null,
  lifecycle: "ACTIVE" as const,
  limit: 20,
};
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
};
describe("typed search drafts", () => {
  it("keeps 100 selected IDs across label eviction without making 50 leaves a 50-ID cap", () => {
    const filter = parseItemFilter(multiLeafReferenceDraft);
    const draft = toDraft(filter);
    const cache = new MetadataCache();
    for (let n = 0; n < 200; n++) cache.set(`label-${n}`, "x".repeat(2000));
    expect(cache.size).toBeLessThanOrEqual(150);
    expect(cache.bytes).toBeLessThanOrEqual(256 * 1024);
    expect(fromDraft(draft)).toEqual(filter);
    expect(JSON.stringify(fromDraft(draft))).not.toContain('"key"');
  });
  it("roundtrips supported nested NOT, OR and duplicate false/zero operands", () => {
    const root: ItemFilterNode = {
      kind: "not",
      child: {
        kind: "or",
        children: [
          { kind: "duplicate", value: false },
          {
            kind: "manualMoney",
            test: { op: "range", unit: { currency: "EUR", minorUnitExponent: 2 }, minMinor: "0" },
          },
        ],
      },
    };
    const filter = parseItemFilter({ version: 1, root });
    expect(fromDraft(toDraft(filter))).toEqual(filter);
    expect(available(root)).toBe(true);
    expect(available({ kind: "purchaseMoney", test: { op: "missing" } })).toBe(true);
  });
  it("keeps an authorable market subtree intact for live authorization without losing false or zero", () => {
    const root: ItemFilterNode = {
      kind: "not",
      child: {
        kind: "or",
        children: [
          { kind: "duplicate", value: false },
          {
            kind: "marketMoney",
            selector: {
              mode: "CURRENT_ITEM_MAPPING",
              providerId: "fixture",
              identifierNamespace: "fixture",
              identifierType: "product",
              kind: "LAST_SOLD",
              sourceMetric: "market",
              qualifiers: { graded: false },
              currency: "EUR",
              minorUnitExponent: 2,
            },
            test: { op: "range", minMinor: "0", maxMinor: "0" },
          },
        ],
      },
    };
    const filter = parseItemFilter({ version: 1, root });
    expect(fromDraft(toDraft(filter))).toEqual(filter);
    expect(available(root)).toBe(true);
  });
  it("uses the actual parser for depth 5/6 and leaves 50/51", () => {
    const leaf: ItemFilterNode = { kind: "tags", test: { op: "present" } };
    let root: ItemFilterNode = leaf;
    for (let n = 0; n < 5; n++) root = { kind: "not", child: root };
    expect(fromDraft(toDraft({ version: 1, root }))).toEqual({ version: 1, root });
    root = { kind: "not", child: root };
    expect(() => fromDraft(toDraft({ version: 1, root }))).toThrow();
    expect(
      fromDraft(toDraft({ version: 1, root: { kind: "and", children: Array(50).fill(leaf) } })),
    ).toBeTruthy();
    expect(() =>
      fromDraft(toDraft({ version: 1, root: { kind: "and", children: Array(51).fill(leaf) } })),
    ).toThrow();
  });
  it("offers every supported type operator and explicit unavailable families", () => {
    expect(operators("DECIMAL")).toEqual([
      "eq",
      "in",
      "lt",
      "lte",
      "gt",
      "gte",
      "between",
      "present",
      "missing",
    ]);
    expect(operators("MULTI_SELECT")).toEqual(["hasAny", "hasAll", "present", "missing"]);
    expect(operators("BOOLEAN")).toEqual(["eq", "present", "missing"]);
    expect(operators("MONEY")).toEqual(["present", "missing"]);
    expect(newLeaf("tags").value).toEqual({ kind: "tags", test: { op: "hasAll", values: [] } });
  });
});
describe("bounded tab query identity", () => {
  it("uses fresh opaque 128-bit tokens and restores only same actor validated query data", () => {
    const disk = storage();
    const first = new QueryStore("owner", disk);
    const a = first.put(query),
      b = first.put(query);
    expect(a).toMatch(/^[a-f0-9]{32}$/);
    expect(a).not.toBe(b);
    expect(new QueryStore("owner", disk).get(a)).toEqual(query);
    expect(new QueryStore("other", disk).get(a)).toBeNull();
    expect(new QueryStore("owner", disk).get(a)).toBeNull();
  });
  it("evicts oldest after 20 and works with blocked storage; clearing removes private entries", () => {
    const broken = {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
      removeItem() {
        throw Error();
      },
    };
    const store = new QueryStore("owner", broken);
    const old = store.put(query);
    for (let n = 0; n < 20; n++) store.put({ ...query, text: String(n) });
    expect(store.get(old)).toBeNull();
    const current = store.put(query);
    expect(store.get(current)).toEqual(query);
    store.clear();
    expect(store.get(current)).toBeNull();
  });
  it.each([
    "?text=private",
    "?f=%7B%7D",
    "?q=x",
    "?q=" + "a".repeat(32) + "&q=" + "b".repeat(32),
    "?%71=" + "a".repeat(32),
    "?q=%ZZ",
    "?q=" + "a".repeat(32) + "&unknown=x",
  ])("rejects unsafe URL %s", (search) => {
    expect(parseSearchLocation(search, "").kind).toBe("invalid");
  });
  it("rejects fragments and merges framework history keys", () => {
    expect(parseSearchLocation("", "#private").kind).toBe("invalid");
    let state: unknown;
    let url: unknown;
    const history = {
      state: { __NA: true, tree: { next: 1 } },
      pushState: (s: unknown, _: string, u: unknown) => {
        state = s;
        url = u;
      },
      replaceState: (s: unknown, _: string, u: unknown) => {
        state = s;
        url = u;
      },
    };
    writeSearchHistory(history, "/de/search", "a".repeat(32), "push");
    expect(state).toMatchObject({
      __NA: true,
      tree: { next: 1 },
      sammlerraumSearch: "a".repeat(32),
    });
    expect(url).toBe("/de/search?q=" + "a".repeat(32));
  });
});
it("rejects stale callbacks independently of abort and disposal", async () => {
  const channel = new RequestChannel();
  const first = channel.begin();
  const second = channel.begin();
  expect(first.signal.aborted).toBe(true);
  expect(channel.current(first.id)).toBe(false);
  expect(channel.current(second.id)).toBe(true);
  channel.cancel();
  expect(channel.current(second.id)).toBe(false);
});
it("bounds concurrent metadata expansion to two and skips aborted queued work", async () => {
  const cache = new MetadataCache();
  const signal = new AbortController();
  let running = 0,
    max = 0;
  const releases: Array<() => void> = [];
  const task = () =>
    new Promise<void>((resolve) => {
      running++;
      max = Math.max(max, running);
      releases.push(() => {
        running--;
        resolve();
      });
    });
  const first = cache.expand(signal.signal, task),
    second = cache.expand(signal.signal, task);
  const aborted = new AbortController();
  let called = false;
  const third = cache.expand(aborted.signal, async () => {
    called = true;
  });
  aborted.abort();
  releases.shift()!();
  releases.shift()!();
  await Promise.all([first, second]);
  await expect(third).rejects.toMatchObject({ name: "AbortError" });
  expect(max).toBe(2);
  expect(called).toBe(false);
});
it("permanently closes expired-session requests while ordinary cancellation remains reusable", () => {
  const channel = new RequestChannel();
  const first = channel.begin();
  channel.cancel();
  expect(first.signal.aborted).toBe(true);
  const next = channel.begin();
  expect(channel.current(next.id)).toBe(true);
  channel.close();
  expect(channel.closed).toBe(true);
  expect(next.signal.aborted).toBe(true);
  expect(channel.current(next.id)).toBe(false);
  expect(() => channel.begin()).toThrow();
});
it("writes dashboard query identity privately while preserving framework state and rejecting other paths", () => {
  let state: Record<string, unknown> = {
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: { preserved: true },
    },
    url = "";
  const history = {
    get state() {
      return state;
    },
    pushState: (next: unknown, _unused: string, nextUrl?: string | URL | null) => {
      state = next as Record<string, unknown>;
      url = String(nextUrl);
    },
    replaceState: (next: unknown, _unused: string, nextUrl?: string | URL | null) => {
      state = next as Record<string, unknown>;
      url = String(nextUrl);
    },
  };
  writeSearchHistory(history, "/en/dashboard", "b".repeat(32), "replace");
  expect(url).toBe("/en/dashboard?q=" + "b".repeat(32));
  expect(state.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual({ preserved: true });
  for (const path of ["/en/account", "/de/dashboard/other", "https://evil.invalid/de/dashboard"])
    expect(() => writeSearchHistory(history, path, "b".repeat(32), "push")).toThrow();
});
