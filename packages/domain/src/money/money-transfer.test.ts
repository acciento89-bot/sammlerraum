import { expect, it } from "vitest";
import { MoneyExportRowSchema } from "@sammlerraum/contracts/money-transfer";
import { LEGACY_MONEY_PROFILE_ID } from "@sammlerraum/contracts/legacy-money";
import { validateMoneyImportRow, buildMoneyExportSnapshot } from "./money-transfer";
import { encodeMoneyFactToken } from "./legacy-money-tokens";
const id = "00000000-0000-4000-8000-000000000001",
  event = "00000000-0000-4000-8000-000000000002";
const row = {
  schemaVersion: 1,
  rowKey: "sheet:1",
  profileId: LEGACY_MONEY_PROFILE_ID,
  sourceKind: "DECIMAL",
  authoring: { kind: "DECIMAL", profileId: LEGACY_MONEY_PROFILE_ID, currency: "AFN", decimal: "1" },
  intent: "NEW",
};
const subject = { family: "PURCHASE" as const, itemId: id };
const raw = { amountMinor: "0", currency: "ZZZ" };
const view = {
  schemaVersion: 1 as const,
  subject,
  raw,
  factToken: encodeMoneyFactToken({
    v: 1,
    subject,
    generation: event,
    sequence: "1",
    raw,
    effectiveEventId: event,
    originId: null,
    originEvidenceErasedAt: null,
    revocationId: null,
  }),
  interpretation: { kind: "UNKNOWN" as const, reason: "RAW_WRITER" as const },
};
const metadata = {
  asOf: "2026-11-06T18:00:00.000Z",
  items: [{ itemId: id, title: "Synthetic item", quantity: "2" }],
  requestedPaths: ['{"family":"PURCHASE"}'],
  options: { measure: "PURCHASE" as const, mode: "RAW" as const },
  totals: null,
};
it("pins a canonical preview and refuses changed amount, profile or row identity at commit", () => {
  const preview = validateMoneyImportRow(row);
  expect(preview).toMatchObject({
    kind: "CANONICAL",
    receipt: { raw: { amountMinor: "100", currency: "AFN" }, exponent: 2 },
  });
  expect(Object.isFrozen(preview)).toBe(true);
  expect(validateMoneyImportRow(row, preview)).toEqual(preview);
  for (const changed of [
    { ...row, rowKey: "sheet:2" },
    { ...row, authoring: { ...row.authoring, decimal: "2" } },
    { ...row, profileId: "unreviewed-profile" },
  ])
    expect(() => validateMoneyImportRow(changed, preview)).toThrow("MONEY_TRANSFER_CONFLICT");
});
it("requires the canonical RAW source contract and keeps explicit legacy UNKNOWN imports unpromoted", () => {
  const canonical = {
    ...row,
    sourceKind: "RAW",
    authoring: {
      kind: "RAW",
      profileId: LEGACY_MONEY_PROFILE_ID,
      currency: "AFN",
      amountMinor: "100",
      exponent: 2,
      unitKey: "iso4217-2026-09-17:AFN",
    },
  };
  expect(() => validateMoneyImportRow(canonical)).toThrow("MONEY_TRANSFER_INVALID");
  expect(
    validateMoneyImportRow({ ...canonical, sourceContract: "CANONICAL_MINOR_UNITS_V1" }),
  ).toMatchObject({ kind: "CANONICAL", receipt: { raw: { amountMinor: "100" } } });
  const legacy = validateMoneyImportRow({
    schemaVersion: 1,
    rowKey: "sheet:3",
    profileId: null,
    sourceKind: "RAW",
    sourceContract: "LEGACY_UNKNOWN_RAW_V1",
    authoring: raw,
    intent: "NEW",
  });
  expect(legacy).toMatchObject({ kind: "LEGACY_UNKNOWN", raw });
  expect(legacy).not.toHaveProperty("receipt");
  expect(legacy).not.toHaveProperty("exponent");
});
it.each(["", "bad row", "x".repeat(129), "row/1"])(
  "rejects nonopaque row identity %s",
  (rowKey) => {
    expect(() => validateMoneyImportRow({ ...row, rowKey })).toThrow("MONEY_TRANSFER_INVALID");
  },
);
it("captures RAW unknown amounts without decimal/total/private evidence", () => {
  const snapshot = buildMoneyExportSnapshot(
    metadata,
    [{ itemId: id, requestedPath: metadata.requestedPaths[0]!, view }],
    () => {},
  );
  expect(snapshot).toMatchObject({
    schemaVersion: 1,
    mode: "RAW",
    totals: null,
    coverage: { selectedItems: 1, unknownPaths: 1 },
    rows: [
      {
        quantity: "2",
        raw,
        interpretation: { kind: "UNKNOWN" },
        fact: { generation: event, effectiveEventId: event, originId: null },
      },
    ],
  });
  expect(snapshot.rows[0]?.interpretation).not.toHaveProperty("decimal");
  expect(Object.isFrozen(snapshot.rows)).toBe(true);
});
it("refuses incomplete interpreted exports and never returns a truncated artifact on timeout", () => {
  expect(() =>
    buildMoneyExportSnapshot(
      {
        ...metadata,
        options: { measure: "PURCHASE", mode: "INTERPRETED", completeness: "REQUIRE_COMPLETE" },
      },
      [{ itemId: id, requestedPath: metadata.requestedPaths[0]!, view }],
      () => {},
    ),
  ).toThrow("MONEY_EXPORT_INCOMPLETE");
  expect(() =>
    buildMoneyExportSnapshot(
      metadata,
      [{ itemId: id, requestedPath: metadata.requestedPaths[0]!, view }],
      () => {
        throw Error("MONEY_UNAVAILABLE");
      },
    ),
  ).toThrow("MONEY_UNAVAILABLE");
});
it("rejects mixed source kinds, unexpected fields, stale replacement preconditions and preview tampering", () => {
  for (const invalid of [
    { ...row, sourceKind: "RAW" },
    { ...row, privateNotes: "leak" },
    { ...row, intent: "REPLACE" },
    { ...row, sourceContract: "LEGACY_UNKNOWN_RAW_V1" },
  ])
    expect(() => validateMoneyImportRow(invalid)).toThrow("MONEY_TRANSFER_INVALID");
  const preview = validateMoneyImportRow(row);
  expect(() => validateMoneyImportRow(row, { ...preview, sourceDigest: "0".repeat(64) })).toThrow(
    "MONEY_TRANSFER_CONFLICT",
  );
  if (preview.kind !== "CANONICAL") throw Error("fixture");
  expect(() =>
    validateMoneyImportRow(row, { ...preview, receipt: { ...preview.receipt, exponent: 1 } }),
  ).toThrow("MONEY_TRANSFER_CONFLICT");
  const replacement = { ...row, intent: "REPLACE", expectedFactToken: view.factToken };
  const pinned = validateMoneyImportRow(replacement);
  expect(() =>
    validateMoneyImportRow(
      {
        ...replacement,
        expectedFactToken: encodeMoneyFactToken({
          ...JSON.parse(Buffer.from(view.factToken, "base64url").toString()),
          sequence: "2",
        }),
      },
      pinned,
    ),
  ).toThrow("MONEY_TRANSFER_CONFLICT");
});
it("accepts 1000 items but refuses 1001 before touching the fact iterator", () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({
    itemId: `00000000-0000-4000-8000-${(i + 1).toString().padStart(12, "0")}`,
    title: "Synthetic",
    quantity: "1",
  }));
  const facts = items.map((item) => {
    const subject = { family: "PURCHASE" as const, itemId: item.itemId };
    return {
      itemId: item.itemId,
      requestedPath: metadata.requestedPaths[0]!,
      view: {
        ...view,
        subject,
        factToken: encodeMoneyFactToken({
          v: 1,
          subject,
          generation: event,
          sequence: "1",
          raw,
          effectiveEventId: event,
          originId: null,
          originEvidenceErasedAt: null,
          revocationId: null,
        }),
      },
    };
  });
  expect(buildMoneyExportSnapshot({ ...metadata, items }, facts, () => {}).rows).toHaveLength(1000);
  let read = false;
  const iterable = {
    *[Symbol.iterator]() {
      read = true;
      yield facts[0]!;
    },
  };
  expect(() =>
    buildMoneyExportSnapshot(
      {
        ...metadata,
        items: [...items, { ...items[0]!, itemId: "00000000-0000-4000-8000-999999999999" }],
      },
      iterable,
      () => {},
    ),
  ).toThrow("MONEY_EXPORT_LIMIT_EXCEEDED");
  expect(read).toBe(false);
});
it("includes unresolved interpreted rows without decimal fields or totals", () => {
  const snapshot = buildMoneyExportSnapshot(
    {
      ...metadata,
      options: { measure: "PURCHASE", mode: "INTERPRETED", completeness: "INCLUDE_UNRESOLVED" },
    },
    [{ itemId: id, requestedPath: metadata.requestedPaths[0]!, view }],
    () => {},
  );
  expect(snapshot.totals).toBeNull();
  expect(snapshot.rows[0]?.interpretation).toEqual({ kind: "UNKNOWN" });
});
it("counts actual UTF-8 envelope and multiple paths: exactly 8 MiB succeeds, one byte more fails", () => {
  const max = 8_388_608;
  const collectionId = "00000000-0000-4000-8000-000000000003";
  const paths = Array.from({ length: 20 }, (_, i) =>
    JSON.stringify({
      family: "CUSTOM",
      collectionId,
      definitionId: `00000000-0000-4000-8000-${(i + 10000).toString().padStart(12, "0")}`,
    }),
  );
  function make(n: number, extraTitle = "", digits: ReadonlyMap<number, number> = new Map()) {
    const items = Array.from({ length: n }, (_, i) => ({
      itemId: `00000000-0000-4000-8000-${(i + 1).toString().padStart(12, "0")}`,
      title: `🦊${i === 0 ? extraTitle : ""}`,
      quantity: "1",
    }));
    const facts = items.flatMap((item, i) =>
      paths.map((requestedPath, j) => {
        const subject = {
          family: "CUSTOM" as const,
          itemId: item.itemId,
          fieldDefinitionId: JSON.parse(requestedPath).definitionId as string,
        };
        const raw = { amountMinor: "1" + "0".repeat(digits.get(i * 20 + j) ?? 0), currency: "ZZZ" };
        return {
          itemId: item.itemId,
          requestedPath,
          view: {
            schemaVersion: 1 as const,
            subject,
            raw,
            factToken: encodeMoneyFactToken({
              v: 1,
              subject,
              generation: event,
              sequence: "1",
              raw,
              effectiveEventId: event,
              originId: null,
              originEvidenceErasedAt: null,
              revocationId: null,
            }),
            interpretation: { kind: "UNKNOWN" as const, reason: "RAW_WRITER" as const },
          },
        };
      }),
    );
    return {
      metadata: {
        ...metadata,
        items,
        requestedPaths: paths,
        options: { measure: "CUSTOM" as const, mode: "RAW" as const },
      },
      facts,
    };
  }
  const sample = make(1),
    single = buildMoneyExportSnapshot(sample.metadata, sample.facts, () => {});
  const baseRow = Buffer.byteLength(JSON.stringify(single.rows[0]));
  let n = 1,
    size = 0;
  for (let count = 1; count <= 1000; count++) {
    const rows = count * 20;
    const envelope = {
      ...single,
      coverage: {
        selectedItems: count,
        selectedPaths: rows,
        missingPaths: 0,
        presentPaths: rows,
        eligiblePaths: 0,
        unknownPaths: rows,
        ineligiblePaths: 0,
      },
      rows: [],
    };
    let varyingDigits = 0;
    for (let r = 1; r <= rows; r++) varyingDigits += r.toString().length - 1;
    const bytes =
      Buffer.byteLength(JSON.stringify(envelope)) + baseRow * rows + varyingDigits + rows - 1;
    if (bytes > max) break;
    n = count;
    size = bytes;
  }
  const gap = max - size,
    perTitle = Math.floor(gap / 20),
    remainder = gap % 20;
  // Four-byte Unicode makes the independent byte oracle distinguish character counts.
  const extraTitle = "🦊".repeat(Math.floor(perTitle / 4)) + "x".repeat(perTitle % 4);
  expect([...extraTitle].length + 1).toBeLessThanOrEqual(200);
  const digits = new Map([
    [20, Math.min(remainder, 15)],
    [21, Math.max(0, remainder - 15)],
  ]);
  const exact = make(n, extraTitle, digits),
    snapshot = buildMoneyExportSnapshot(exact.metadata, exact.facts, () => {});
  expect(Buffer.byteLength(JSON.stringify(snapshot), "utf8")).toBe(max);
  digits.set(22, 1);
  const over = make(n, extraTitle, digits);
  expect(() => buildMoneyExportSnapshot(over.metadata, over.facts, () => {})).toThrow(
    "MONEY_EXPORT_LIMIT_EXCEEDED",
  );
}, 15000);

it("closes invalid selectors, quantities, duplicate facts and foreign subjects without partial output", () => {
  const fact = { itemId: id, requestedPath: metadata.requestedPaths[0]!, view };
  for (const invalid of [
    { ...metadata, requestedPaths: ["not-json"] },
    { ...metadata, items: [{ ...metadata.items[0]!, quantity: "0" }] },
    { ...metadata, requestedPaths: [...metadata.requestedPaths, ...metadata.requestedPaths] },
  ])
    expect(() => buildMoneyExportSnapshot(invalid, [fact], () => {})).toThrow(
      "MONEY_TRANSFER_INVALID",
    );
  expect(() => buildMoneyExportSnapshot(metadata, [fact, fact], () => {})).toThrow(
    "MONEY_TRANSFER_INVALID",
  );
  const foreignSubject = { family: "PURCHASE" as const, itemId: event };
  expect(() =>
    buildMoneyExportSnapshot(
      metadata,
      [{ ...fact, view: { ...view, subject: foreignSubject } }],
      () => {},
    ),
  ).toThrow("MONEY_TRANSFER_INVALID");
});

it("returns schema failure rather than throwing while validating dirty stored exponents", () => {
  const row = {
    rowNumber: "1",
    itemId: id,
    title: "Synthetic",
    quantity: "1",
    requestedPath: metadata.requestedPaths[0]!,
    subject,
    raw: { amountMinor: "100", currency: "AFN" },
    fact: {
      generation: event,
      sequence: "1",
      effectiveEventId: event,
      originId: event,
      originEvidenceErasedAt: null,
      revocationId: null,
    },
    interpretation: {
      kind: "INTERPRETED",
      exponent: 2,
      unitKey: "iso4217-2026-09-17:AFN",
      eligibility: "ELIGIBLE",
      decimal: "1.00",
    },
  };
  for (const exponent of [-1, 10, 1.5, NaN, Infinity])
    expect(
      MoneyExportRowSchema.safeParse({
        ...row,
        interpretation: { ...row.interpretation, exponent },
      }).success,
    ).toBe(false);
});
it("keeps an optional undefined mapping property stable after JSON preview persistence", () => {
  const preview = validateMoneyImportRow({ ...row, sourceContract: undefined });
  const persisted: unknown = JSON.parse(JSON.stringify(preview));
  expect(() => validateMoneyImportRow(row, persisted)).not.toThrow();
  expect(validateMoneyImportRow(row).sourceDigest).toBe(preview.sourceDigest);
});
