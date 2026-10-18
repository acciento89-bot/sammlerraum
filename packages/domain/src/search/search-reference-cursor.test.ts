import { describe, expect, it } from "vitest";
import {
  decodeReferenceCursor,
  encodeReferenceCursor,
  referenceContextHash,
} from "./search-reference-cursor";
const after = "abcd0000-0000-4000-8000-000000000001",
  actor = "owner";
const hash = referenceContextHash(actor, "COLLECTIONS", null, 20),
  value = { v: 1 as const, contextHash: hash, after };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
describe("canonical reference cursor", () => {
  it("binds actor family parent limit", () => {
    const token = encodeReferenceCursor(value);
    expect(decodeReferenceCursor(token, hash)).toBe(after);
    for (const other of [
      referenceContextHash("foreign", "COLLECTIONS", null, 20),
      referenceContextHash(actor, "CUSTOM_FIELDS", null, 20),
      referenceContextHash(actor, "COLLECTIONS", after, 20),
      referenceContextHash(actor, "COLLECTIONS", null, 50),
    ])
      expect(() => decodeReferenceCursor(token, other)).toThrow("SEARCH_INVALID");
  });
  it.each([
    "",
    "a".repeat(2049),
    "a=",
    Buffer.from([0xff]).toString("base64url"),
    encode({ ...value, after: after.toUpperCase() }),
    encode({ ...value, extra: true }),
    encode({ ...value, v: 2 }),
    encode({ after, contextHash: hash, v: 1 }),
    encode({ ...value, after: { createdAt: "2026-01-01T00:00:00.000Z", id: after } }),
    Buffer.from(JSON.stringify(value) + " ").toString("base64url"),
    Buffer.from(`{"v":1,"v":1,"contextHash":"${hash}","after":"${after}"}`).toString("base64url"),
    encode({ ...value, after: "x".repeat(1600) }),
  ])("rejects malformed/noncanonical token", (token) => {
    expect(() => decodeReferenceCursor(token, hash)).toThrow("SEARCH_INVALID");
  });
});
