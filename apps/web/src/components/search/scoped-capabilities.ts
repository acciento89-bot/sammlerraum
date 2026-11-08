import type { ItemFilter, ItemFilterLeaf, ItemFilterNode } from "@sammlerraum/contracts/search";
import type { ScopedSearchCapabilities } from "@sammlerraum/contracts/scoped-search";
import { available, newLeaf } from "./filter-draft";
export function scopedLeafAvailable(leaf: ItemFilterLeaf, caps: ScopedSearchCapabilities): boolean {
  if (!caps.families.includes(leaf.kind) || !available(leaf, caps.canonicalMoneyEnabled))
    return false;
  if (leaf.kind === "media") {
    if (!caps.mediaKinds.includes(leaf.mediaKind)) return false;
    if (
      !caps.receiptCategories &&
      (leaf.documentCategory === "PURCHASE_RECEIPT" || leaf.documentCategory === "INVOICE")
    )
      return false;
  }
  if (leaf.kind === "collection" && caps.scope !== "OWNER_COLLECTION") {
    if (caps.reference.kind !== "MEMBER_COLLECTION") return false;
    const id = caps.reference.collectionId;
    return (leaf.test.op === "eq" ? [leaf.test.value] : leaf.test.values).every(
      (value) => value === id,
    );
  }
  return true;
}
export function scopedFilterAvailable(
  filter: ItemFilter | null,
  caps: ScopedSearchCapabilities,
): boolean {
  const walk = (node: ItemFilterNode): boolean =>
    "children" in node
      ? node.children.every(walk)
      : node.kind === "not"
        ? walk(node.child)
        : scopedLeafAvailable(node, caps);
  return !filter || walk(filter.root);
}

export function newScopedLeaf(kind: ItemFilterLeaf["kind"], caps: ScopedSearchCapabilities) {
  const leaf = newLeaf(kind);
  if (kind === "collection" && caps.reference.kind === "MEMBER_COLLECTION")
    leaf.value.test = { op: "eq", value: caps.reference.collectionId };
  if (kind === "media" && caps.mediaKinds.length) leaf.value.mediaKind = caps.mediaKinds[0]!;
  return leaf;
}
