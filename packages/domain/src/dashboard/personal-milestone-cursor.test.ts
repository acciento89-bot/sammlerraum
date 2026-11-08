import { describe, expect, it } from "vitest";
import {
  milestoneContextHash,
  encodeMilestoneCursor,
  decodeMilestoneCursor,
} from "./personal-milestone-cursor";
const cursor = {
  v: 1 as const,
  contextHash: milestoneContextHash("owner", 20),
  after: {
    milestoneDate: "0001-01-01",
    createdAt: "2026-11-05T12:13:14.001Z",
    id: "00000000-0000-4000-8000-000000000001",
  },
};
describe("authored milestone canonical three-column cursor", () => {
  it("roundtrips a real date, time and UUID without losing date-only semantics", () => {
    const token = encodeMilestoneCursor(cursor);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeMilestoneCursor(token, cursor.contextHash)).toEqual(cursor);
  });
  it("binds actor, page size and the milestone sort independently", () => {
    expect(milestoneContextHash("owner", 20)).toMatch(/^[a-f0-9]{64}$/u);
    expect(milestoneContextHash("owner", 5)).not.toBe(cursor.contextHash);
    expect(milestoneContextHash("other", 20)).not.toBe(cursor.contextHash);
    expect(() =>
      decodeMilestoneCursor(encodeMilestoneCursor(cursor), milestoneContextHash("other", 20)),
    ).toThrow("MILESTONE_INVALID");
  });
  it("rejects reordered, duplicate, extra, malformed and over-bound encodings", () => {
    const json = JSON.stringify(cursor);
    const mutations = [
      "",
      "a".repeat(2049),
      "a+b/",
      Buffer.from("\ufeff" + json).toString("base64url"),
      Buffer.from(JSON.stringify({ ...cursor, owner: "private" })).toString("base64url"),
      Buffer.from(
        JSON.stringify({ after: cursor.after, contextHash: cursor.contextHash, v: 1 }),
      ).toString("base64url"),
      Buffer.from(json.replace('"v":1', '"v":1,"v":1')).toString("base64url"),
      Buffer.from(
        JSON.stringify({ ...cursor, after: { ...cursor.after, milestoneDate: "1900-02-29" } }),
      ).toString("base64url"),
      Buffer.from([0xff]).toString("base64url"),
      encodeMilestoneCursor(cursor) + "=",
    ];
    for (const token of mutations)
      expect(() => decodeMilestoneCursor(token, cursor.contextHash)).toThrow("MILESTONE_INVALID");
  });
});
