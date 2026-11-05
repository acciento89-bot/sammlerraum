import {
  parseItemFilter,
  type ItemFilter,
  type ItemFilterNode,
  type ItemFilterLeaf,
} from "@sammlerraum/contracts/search";
export type TestDraft = {
  op: string;
  value?: string | number | boolean | TestDraft;
  values?: (string | number)[];
  min?: string | number;
  max?: string | number;
  provider?: string;
  grade?: string;
  certificateNo?: string;
  scale?: string;
  unit?: { currency: string; minorUnitExponent: number; unitKey?: string };
  minMinor?: string;
  maxMinor?: string;
};
export type LeafValue = {
  kind: ItemFilterLeaf["kind"];
  test?: TestDraft;
  value?: boolean;
  categoryTemplateId?: string;
  mediaKind?: "IMAGE" | "DOCUMENT";
  documentCategory?: string;
  selector?: Record<string, unknown>;
  predicate?: { valueType: string; test: TestDraft };
};
export type DraftNode =
  | { key: string; kind: "leaf"; value: LeafValue }
  | { key: string; kind: "and" | "or"; children: DraftNode[] }
  | { key: string; kind: "not"; child: DraftNode };
let nextKey = 0;
export const draftKey = () => `filter-${++nextKey}`;
export function toNodeDraft(node: ItemFilterNode): DraftNode {
  const key = draftKey();
  if (node.kind === "and" || node.kind === "or")
    return { key, kind: node.kind, children: node.children.map(toNodeDraft) };
  if (node.kind === "not") return { key, kind: "not", child: toNodeDraft(node.child) };
  return { key, kind: "leaf", value: structuredClone(node) as LeafValue };
}
export function toDraft(filter: ItemFilter | null): DraftNode | null {
  return filter ? toNodeDraft(filter.root) : null;
}
export function rawNode(node: DraftNode): unknown {
  if (node.kind === "leaf") return node.value;
  if (node.kind === "not") return { kind: "not", child: rawNode(node.child) };
  return { kind: node.kind, children: node.children.map(rawNode) };
}
export function fromDraft(draft: DraftNode | null): ItemFilter | null {
  return draft ? parseItemFilter({ version: 1, root: rawNode(draft) }) : null;
}
export function available(node: ItemFilterNode): boolean {
  if (node.kind === "and" || node.kind === "or") return node.children.every(available);
  if (node.kind === "not") return available(node.child);
  if (node.kind === "marketMoney" || node.kind === "duplicate") return false;
  if (node.kind === "purchaseMoney") return node.test.op !== "range";
  if (node.kind === "customField" || node.kind === "catalogAttribute")
    return node.predicate.test.op !== "range";
  return true;
}
export const families = [
  "collection",
  "category",
  "condition",
  "grading",
  "purchaseMoney",
  "manualMoney",
  "tags",
  "tradeStatus",
  "visibility",
  "media",
  "createdAt",
  "updatedAt",
  "acquisitionDate",
  "customField",
  "catalogAttribute",
  "marketMoney",
  "duplicate",
] as const;
export const orderedOperators = ["eq", "in", "lt", "lte", "gt", "gte", "between"];
export function operators(type: string): string[] {
  const presence = ["present", "missing"];
  if (type === "BOOLEAN") return ["eq", ...presence];
  if (type === "SHORT_TEXT" || type === "LONG_TEXT")
    return ["eq", "in", "contains", "startsWith", ...presence];
  if (type === "INTEGER" || type === "DECIMAL" || type === "DATE")
    return [...orderedOperators, ...presence];
  if (type === "MULTI_SELECT") return ["hasAny", "hasAll", ...presence];
  if (type === "MONEY") return presence;
  return ["eq", "in", ...presence];
}
export function defaultTest(op: string, type = "TEXT"): TestDraft {
  if (op === "present" || op === "missing") return { op };
  if (op === "in" || op === "hasAny" || op === "hasAll") return { op, values: [] };
  if (op === "between") return { op, min: "", max: "" };
  if (op === "authored") return { op, provider: "" };
  if (op === "comparable") return { op, provider: "", scale: "", value: { op: "eq", value: "" } };
  if (op === "range") return { op, unit: { currency: "EUR", minorUnitExponent: 2 } };
  return { op, value: type === "BOOLEAN" ? false : "" };
}
export function newLeaf(
  kind: ItemFilterLeaf["kind"] = "tags",
): Extract<DraftNode, { kind: "leaf" }> {
  let value: LeafValue = { kind, test: defaultTest("present") };
  if (kind === "tags") value.test = defaultTest("hasAll");
  if (
    kind === "collection" ||
    kind === "tradeStatus" ||
    kind === "visibility" ||
    kind === "createdAt" ||
    kind === "updatedAt"
  )
    value.test = defaultTest("eq");
  if (kind === "condition") value.categoryTemplateId = "";
  if (kind === "media") value.mediaKind = "IMAGE";
  if (kind === "customField" || kind === "catalogAttribute")
    value = {
      kind,
      selector:
        kind === "customField"
          ? { source: "CUSTOM", collectionId: "", definitionId: "" }
          : { source: "CATALOG", categoryTemplateId: "", definitionId: "", target: "ENTRY" },
      predicate: { valueType: "SHORT_TEXT", test: { op: "present" } },
    };
  if (kind === "duplicate") value = { kind, value: false };
  return { key: draftKey(), kind: "leaf", value };
}
export function replaceNode(
  root: DraftNode,
  key: string,
  replacement: DraftNode | null,
): DraftNode | null {
  if (root.key === key) return replacement;
  if (root.kind === "leaf") return root;
  if (root.kind === "not") {
    const child = replaceNode(root.child, key, replacement);
    return child ? { ...root, child } : null;
  }
  return {
    ...root,
    children: root.children.flatMap((child) => {
      const result = replaceNode(child, key, replacement);
      return result ? [result] : [];
    }),
  };
}
