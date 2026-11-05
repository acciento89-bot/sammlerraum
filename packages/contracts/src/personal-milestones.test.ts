import { describe, expect, it } from "vitest";
import {
  parsePersonalMilestoneMutation,
  parsePersonalMilestoneUpdate,
  parsePersonalMilestoneDelete,
  parsePersonalMilestonePageInput,
  parsePersonalMilestoneId,
  PersonalMilestoneDtoSchema,
  PersonalMilestonePageSchema,
  PERSONAL_MILESTONE_MAX_RESPONSE_BYTES,
  PERSONAL_MILESTONE_MAX_REVISION,
} from "./personal-milestones";
const valid = { title: "A private date", milestoneDate: "2026-11-05" };
const dto = {
  id: "00000000-0000-4000-8000-000000000001",
  ...valid,
  revision: 1,
  dateBasis: "OWNER_ENTERED" as const,
  createdAt: "2026-11-05T12:13:14.001Z",
  updatedAt: "2026-11-05T12:13:14.001Z",
};
describe("authored milestone contract", () => {
  it("preserves a real owner-entered calendar date and normalizes the title in NFC", () => {
    expect(
      parsePersonalMilestoneMutation({ title: "  Cafe\u0301 🐉  ", milestoneDate: "0001-01-01" }),
    ).toEqual({ title: "Café 🐉", milestoneDate: "0001-01-01" });
    expect(parsePersonalMilestoneMutation({ ...valid, title: " Ａ  B " }).title).toBe("Ａ  B");
  });
  it("counts Unicode codepoints and bounds UTF8 without truncating a title", () => {
    expect(parsePersonalMilestoneMutation({ ...valid, title: "🐉".repeat(120) }).title).toBe(
      "🐉".repeat(120),
    );
    for (const title of [
      "",
      "   ",
      "x".repeat(121),
      "🐉".repeat(121),
      "\ud800",
      "x\udc00",
      "\nTitle",
      "Title\t",
      "\u0000",
      "\u007f",
      "\u0085",
    ])
      expect(() => parsePersonalMilestoneMutation({ ...valid, title })).toThrow(
        "MILESTONE_INVALID",
      );
  });
  for (const milestoneDate of [
    "0001-01-01",
    "0004-02-29",
    "0400-02-29",
    "2000-02-29",
    "2024-02-29",
    "9999-12-31",
  ])
    it(`accepts the real date-only ${milestoneDate}`, () =>
      expect(parsePersonalMilestoneMutation({ ...valid, milestoneDate }).milestoneDate).toBe(
        milestoneDate,
      ));
  for (const milestoneDate of [
    "0000-01-01",
    "0100-02-29",
    "1900-02-29",
    "2026-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "10000-01-01",
    "2026-1-01",
    "2026-01-01T00:00:00Z",
    " 2026-01-01",
    null,
    1,
  ])
    it(`rejects non-calendar input ${milestoneDate}`, () =>
      expect(() => parsePersonalMilestoneMutation({ ...valid, milestoneDate })).toThrow(
        "MILESTONE_INVALID",
      ));
  for (const key of [
    "id",
    "ownerId",
    "dateBasis",
    "createdAt",
    "verified",
    "filter",
    "lifecycle",
    "amount",
    "scope",
  ])
    it(`rejects server/foreign field ${key}`, () =>
      expect(() => parsePersonalMilestoneMutation({ ...valid, [key]: "injected" })).toThrow(
        "MILESTONE_INVALID",
      ));
  it("requires full CAS updates and exact revisioned deletion", () => {
    expect(parsePersonalMilestoneUpdate({ ...valid, expectedRevision: 1 })).toEqual({
      ...valid,
      expectedRevision: 1,
    });
    for (const input of [
      { title: "Partial", expectedRevision: 1 },
      { ...valid },
      { ...valid, expectedRevision: 0 },
      { ...valid, expectedRevision: 1.5 },
      { ...valid, expectedRevision: PERSONAL_MILESTONE_MAX_REVISION + 1 },
    ])
      expect(() => parsePersonalMilestoneUpdate(input)).toThrow("MILESTONE_INVALID");
    expect(
      parsePersonalMilestoneDelete({ expectedRevision: PERSONAL_MILESTONE_MAX_REVISION }),
    ).toEqual({ expectedRevision: PERSONAL_MILESTONE_MAX_REVISION });
    expect(() => parsePersonalMilestoneDelete({ expectedRevision: 1, title: "extra" })).toThrow(
      "MILESTONE_INVALID",
    );
  });
  it("bounds lists and body-only opaque cursors and canonicalizes input IDs", () => {
    expect(parsePersonalMilestonePageInput()).toEqual({ limit: 20 });
    expect(parsePersonalMilestonePageInput({ limit: 5 })).toEqual({ limit: 5 });
    expect(parsePersonalMilestonePageInput({ limit: 50, cursor: "a".repeat(2048) })).toEqual({
      limit: 50,
      cursor: "a".repeat(2048),
    });
    for (const input of [
      { limit: 0 },
      { limit: 51 },
      { limit: "5" },
      { cursor: "" },
      { cursor: "a".repeat(2049) },
      { cursor: "a+b/" },
      { lifecycle: "ACTIVE" },
      null,
    ])
      expect(() => parsePersonalMilestonePageInput(input)).toThrow("MILESTONE_INVALID");
    expect(parsePersonalMilestoneId("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(() => parsePersonalMilestoneId("private-owner-not-id")).toThrow("MILESTONE_INVALID");
  });
  it("does not silently repair noncanonical retained data or recording timestamps", () => {
    expect(PersonalMilestoneDtoSchema.parse(dto)).toEqual(dto);
    for (const patch of [
      { title: " untrimmed " },
      { title: "Cafe\u0301" },
      { revision: 0 },
      { ownerId: "foreign" },
      { dateBasis: "VERIFIED" },
      { createdAt: "0000-01-01T00:00:00.000Z" },
      { updatedAt: "+010000-01-01T00:00:00.000Z" },
      { updatedAt: "2026-11-05T12:13:14.000Z" },
    ])
      expect(PersonalMilestoneDtoSchema.safeParse({ ...dto, ...patch }).success).toBe(false);
  });
  it("keeps a maximum valid50row DTO below64KiB; overflow is not invented native data", () => {
    const page = {
      version: 1,
      scope: "OWNED",
      selectionBasis: "ALL_PERSONAL_MILESTONES",
      readAt: dto.createdAt,
      items: Array.from({ length: 50 }, (_, n) => ({
        ...dto,
        title: "🐉".repeat(120),
        revision: PERSONAL_MILESTONE_MAX_REVISION,
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      })),
      total: Number.MAX_SAFE_INTEGER,
      nextCursor: "a".repeat(2048),
    };
    expect(PersonalMilestonePageSchema.safeParse(page).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(
      PERSONAL_MILESTONE_MAX_RESPONSE_BYTES,
    );
    expect(
      PersonalMilestonePageSchema.safeParse({ ...page, total: Number.MAX_SAFE_INTEGER + 1 })
        .success,
    ).toBe(false);
    expect(
      PersonalMilestonePageSchema.safeParse({ ...page, items: [...page.items, dto] }).success,
    ).toBe(false);
  });
});
