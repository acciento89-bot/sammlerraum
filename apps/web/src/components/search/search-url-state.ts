import { clearSavedAcknowledgements } from "./saved-acknowledgements";
import {
  parseItemSearchQuery,
  type NormalizedItemSearchQuery,
} from "@sammlerraum/contracts/item-search";
const storageKey = "sammlerraum.search.v1";
const tokenPattern = /^[a-f0-9]{32}$/u;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
export class QueryStore {
  private entries = new Map<string, NormalizedItemSearchQuery>();
  constructor(
    readonly actor: string,
    private storage?: StorageLike,
  ) {
    try {
      const raw = storage?.getItem(storageKey);
      if (!raw) return;
      if (new TextEncoder().encode(raw).length > 512 * 1024) throw Error();
      const saved = JSON.parse(raw);
      if (saved.actor !== actor) {
        storage?.removeItem(storageKey);
        return;
      }
      if (saved.version !== 1 || !Array.isArray(saved.entries) || saved.entries.length > 20)
        throw Error();
      for (const [token, input] of saved.entries) {
        if (typeof token !== "string" || !tokenPattern.test(token) || bytes(input) > 32 * 1024)
          throw Error();
        this.entries.set(token, parseItemSearchQuery(input));
      }
    } catch {
      this.clear();
    }
  }
  get(token: string) {
    const query = this.entries.get(token);
    if (!query) return null;
    this.entries.delete(token);
    this.entries.set(token, query);
    this.persist();
    return structuredClone(query);
  }
  put(input: NormalizedItemSearchQuery) {
    const query = parseItemSearchQuery(input);
    if (bytes(query) > 32 * 1024) throw Error("SEARCH_INVALID");
    const random = crypto.getRandomValues(new Uint8Array(16));
    const token = Array.from(random, (n) => n.toString(16).padStart(2, "0")).join("");
    this.entries.set(token, query);
    while (this.entries.size > 20 || bytes(this.envelope()) > 512 * 1024)
      this.entries.delete(this.entries.keys().next().value!);
    this.persist();
    return token;
  }
  clear() {
    this.entries.clear();
    try {
      this.storage?.removeItem(storageKey);
    } catch {
      /* Memory remains usable when storage is blocked. */
    }
  }
  private envelope() {
    return { version: 1, actor: this.actor, entries: [...this.entries] };
  }
  private persist() {
    try {
      this.storage?.setItem(storageKey, JSON.stringify(this.envelope()));
    } catch {
      /* Current tab retains bounded memory state. */
    }
  }
}
let currentStore: QueryStore | undefined;
export function tabQueryStore(actor: string) {
  if (currentStore?.actor !== actor) {
    currentStore?.clear();
    let storage: StorageLike | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      /* blocked */
    }
    currentStore = new QueryStore(actor, storage);
  }
  return currentStore;
}
export function clearSearchSession() {
  clearSavedAcknowledgements();
  currentStore?.clear();
  currentStore = undefined;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    /* blocked */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("sammlerraum:search-cleared"));
}
export function parseSearchLocation(
  search: string,
  hash: string,
): { kind: "initial" } | { kind: "invalid" } | { kind: "token"; token: string } {
  if (hash) return { kind: "invalid" };
  if (!search) return { kind: "initial" };
  const match = /^\?q=([a-f0-9]{32})$/u.exec(search);
  return match ? { kind: "token", token: match[1]! } : { kind: "invalid" };
}
export function writeSearchHistory(
  history: Pick<History, "state" | "pushState" | "replaceState">,
  path: string,
  token: string,
  mode: "push" | "replace",
) {
  if (!tokenPattern.test(token) || !/^\/(de|en)\/search$/u.test(path))
    throw Error("SEARCH_INVALID");
  history[mode === "push" ? "pushState" : "replaceState"](
    {
      ...history.state,
      sammlerraumSearch: token,
      sammlerraumSearchIndex:
        (Number.isSafeInteger(history.state?.sammlerraumSearchIndex)
          ? history.state.sammlerraumSearchIndex
          : 0) + (mode === "push" ? 1 : 0),
    },
    "",
    `${path}?q=${token}`,
  );
}
