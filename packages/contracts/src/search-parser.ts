/** Browser-safe guards shared by every public filter parse path. */
export const FILTER_MAX_BYTES = 16 * 1024;
export type FilterErrorCode =
  | "FILTER_INVALID"
  | "FILTER_TOO_COMPLEX"
  | "FILTER_VERSION_UNSUPPORTED"
  | "FILTER_REFERENCE_INVALID"
  | "FILTER_UNAVAILABLE";
export type FilterUnavailableReason =
  | "SHARED_SCOPE_NOT_IMPLEMENTED"
  | "DUPLICATE_NOT_IMPLEMENTED"
  | "LEGACY_MONEY_INTERPRETATION_UNAVAILABLE"
  | "LEGACY_UNIT_UNSUPPORTED"
  | "MARKET_FILTER_SEAM_UNAVAILABLE"
  | "MARKET_DISPLAY_DISABLED"
  | "MARKET_MAPPING_AMBIGUOUS"
  | "CAPABILITY_SNAPSHOT_LIMIT";
export class FilterValidationError extends Error {
  constructor(
    readonly code: FilterErrorCode,
    readonly reason?: FilterUnavailableReason,
  ) {
    super(code);
    this.name = "FilterValidationError";
  }
}
export function filterInvalid(): never {
  throw new FilterValidationError("FILTER_INVALID");
}
export function filterTooComplex(): never {
  throw new FilterValidationError("FILTER_TOO_COMPLEX");
}
export const utf8Length = (value: string): number => new TextEncoder().encode(value).length;
export function validUnicode(value: string): boolean {
  return !/[\uD800-\uDFFF\0]/u.test(value);
}

/** Bounds and snapshots own JSON data iteratively; never invokes accessors/toJSON. */
export function copyBoundedFilterInput(input: unknown): unknown {
  let output: unknown;
  const pending: Array<{ value: unknown; depth: number; assign: (value: unknown) => void }> = [
    {
      value: input,
      depth: 0,
      assign: (value) => {
        output = value;
      },
    },
  ];
  const containers = new Set<object>();
  let visited = 0;
  while (pending.length) {
    const { value, depth, assign } = pending.pop()!;
    if (++visited > 512) filterTooComplex();
    if (value === null || typeof value === "boolean") {
      assign(value);
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) filterInvalid();
      assign(value);
      continue;
    }
    if (typeof value === "string") {
      if (!validUnicode(value)) filterInvalid();
      if (value.length > 10_000 || utf8Length(value) > 40_000) filterTooComplex();
      assign(value);
      continue;
    }
    if (typeof value !== "object") filterInvalid();
    if (depth >= 32) filterTooComplex();
    if (containers.has(value)) filterInvalid();
    containers.add(value);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) filterInvalid();
    if (array && prototype !== Array.prototype) filterInvalid();
    const keys = Reflect.ownKeys(value);
    if (array ? value.length > 50 : keys.length > 32) filterTooComplex();
    if (array && keys.length !== value.length + 1) filterInvalid();
    const copy: unknown[] | Record<string, unknown> = array ? [] : Object.create(null);
    assign(copy);
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i]!;
      if (array && key === "length") continue;
      if (typeof key !== "string" || !validUnicode(key)) filterInvalid();
      if (utf8Length(key) > 128) filterTooComplex();
      if (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))
        filterInvalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable)
        filterInvalid();
      pending.push({
        value: descriptor.value,
        depth: depth + 1,
        assign: (child) => {
          Object.defineProperty(copy, key, {
            value: child,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        },
      });
    }
  }
  if (utf8Length(JSON.stringify(output)) > FILTER_MAX_BYTES) filterTooComplex();
  return output;
}

/** Size/nesting/duplicate-key precheck. JSON.parse still owns the JSON grammar. */
export function scanFilterJson(raw: string): void {
  if (typeof raw !== "string" || !validUnicode(raw)) filterInvalid();
  if (utf8Length(raw) > FILTER_MAX_BYTES) filterTooComplex();
  const stack: Array<{ kind: "{" | "["; keys: Set<string>; keyExpected: boolean }> = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === '"') {
      const start = i++;
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === "\\") i++;
        i++;
      }
      if (i >= raw.length) filterInvalid();
      const frame = stack.at(-1);
      if (frame?.kind === "{" && frame.keyExpected) {
        let key: unknown;
        try {
          key = JSON.parse(raw.slice(start, i + 1));
        } catch {
          return filterInvalid();
        }
        if (typeof key !== "string" || !validUnicode(key)) filterInvalid();
        if (frame.keys.has(key)) filterInvalid();
        frame.keys.add(key);
        if (frame.keys.size > 32) filterTooComplex();
        frame.keyExpected = false;
      }
    } else if (c === "{" || c === "[") {
      stack.push({ kind: c, keys: new Set(), keyExpected: c === "{" });
      if (stack.length > 32) filterTooComplex();
    } else if (c === "}" || c === "]") {
      const frame = stack.pop();
      if (!frame || (c === "}" ? frame.kind !== "{" : frame.kind !== "[")) filterInvalid();
    } else if (c === ",") {
      const frame = stack.at(-1);
      if (frame?.kind === "{") frame.keyExpected = true;
    }
  }
  if (stack.length) filterInvalid();
}

/** JSON structure has already been bounded; logical levels count only AST ancestors. */
export function guardLogicalComplexity(root: unknown): void {
  const pending = [{ node: root, depth: 0 }];
  let leaves = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (!node || typeof node !== "object" || Array.isArray(node)) filterInvalid();
    const n = node as Record<string, unknown>;
    if (n.kind === "and" || n.kind === "or") {
      if (depth >= 5) filterTooComplex();
      if (!Array.isArray(n.children) || !n.children.length) filterInvalid();
      for (const child of n.children) pending.push({ node: child, depth: depth + 1 });
    } else if (n.kind === "not") {
      if (depth >= 5) filterTooComplex();
      pending.push({ node: n.child, depth: depth + 1 });
    } else if (++leaves > 50) filterTooComplex();
  }
}
