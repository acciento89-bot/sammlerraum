import { describe, expect, it } from "vitest";
import {
  emptyMilestoneDraft,
  editMilestoneDraft,
  milestoneDraftDirty,
  snapshotMilestoneDraft,
  milestoneOnPage,
} from "./personal-milestone-state";
const record = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Stored title",
  milestoneDate: "0001-01-01",
  revision: 3,
  dateBasis: "OWNER_ENTERED" as const,
  createdAt: "2026-11-05T12:00:00.001Z",
  updatedAt: "2026-11-05T12:00:00.002Z",
};
const page = {
  version: 1 as const,
  scope: "OWNED" as const,
  selectionBasis: "ALL_PERSONAL_MILESTONES" as const,
  readAt: record.updatedAt,
  items: [record],
  total: 1,
  nextCursor: null,
};
describe("private milestone editor state", () => {
  it("starts edits from a detached fetched revision rather than inventing the next revision", () => {
    const input = { ...record },
      draft = editMilestoneDraft(input);
    expect(draft).toMatchObject({
      kind: "update",
      title: record.title,
      milestoneDate: record.milestoneDate,
      original: { id: record.id, revision: 3 },
    });
    expect(draft.original).not.toBe(input);
    input.title = "Changed elsewhere";
    expect(draft.original!.title).toBe("Stored title");
  });
  it("protects actual unsaved content without inventing dirtiness for an empty or unchanged form", () => {
    expect(milestoneDraftDirty(null)).toBe(false);
    expect(milestoneDraftDirty(emptyMilestoneDraft())).toBe(false);
    expect(milestoneDraftDirty({ ...emptyMilestoneDraft(), milestoneDate: "9999-12-31" })).toBe(
      true,
    );
    expect(milestoneDraftDirty(editMilestoneDraft(record))).toBe(false);
    expect(milestoneDraftDirty({ ...editMilestoneDraft(record), title: "Changed" })).toBe(true);
  });
  it("freezes a normalized submitted snapshot independently from later typing", () => {
    const draft = { ...editMilestoneDraft(record), title: " Cafe\u0301 " },
      snapshot = snapshotMilestoneDraft(draft);
    draft.title = "Typed later";
    expect(snapshot).toMatchObject({
      kind: "update",
      input: { title: "Café", milestoneDate: "0001-01-01" },
      original: { id: record.id, revision: 3 },
    });
    expect(Object.isFrozen(snapshot.input)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() =>
      snapshotMilestoneDraft({ ...emptyMilestoneDraft(), title: "X", milestoneDate: "1900-02-29" }),
    ).toThrow("MILESTONE_INVALID");
  });
  it("does not treat a record absent from one page as deleted or adopt an older revision", () => {
    expect(milestoneOnPage({ ...page, items: [] }, record)).toEqual({ status: "not_on_page" });
    expect(milestoneOnPage({ ...page, items: [{ ...record, revision: 2 }] }, record)).toEqual({
      status: "older",
    });
    expect(milestoneOnPage({ ...page, items: [{ ...record, revision: 4 }] }, record)).toMatchObject(
      { status: "current", record: { revision: 4 } },
    );
  });
  it("never silently turns an edit without a fetched identity into a creation", () => {
    expect(() =>
      snapshotMilestoneDraft({
        kind: "update",
        title: "Kept",
        milestoneDate: "2026-11-05",
        original: null,
      }),
    ).toThrow("MILESTONE_INVALID");
    expect(() => snapshotMilestoneDraft({ ...editMilestoneDraft(record), kind: "create" })).toThrow(
      "MILESTONE_INVALID",
    );
  });
});
