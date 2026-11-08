/** Task 5C fixture: label-cache capacity must never truncate this complete draft. */
export const multiLeafReferenceDraft = {
  version: 1,
  root: {
    kind: "and",
    children: ["collection", "category"].map((kind, leaf) => ({
      kind,
      test: {
        op: "in",
        values: Array.from(
          { length: 50 },
          (_, n) => `00000000-0000-4000-8000-${String(leaf * 50 + n + 1).padStart(12, "0")}`,
        ),
      },
    })),
  },
} as const;
