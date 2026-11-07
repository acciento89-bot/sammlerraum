import { describe, expect, it } from "vitest";
import {
  parseSmartCollectionWire,
  parseSmartCollectionDefinition,
} from "@sammlerraum/contracts/smart-collections";
describe("saved query strict input", () => {
  it("preserves full normalized query and permits explicit all-owned selection", () => {
    expect(
      parseSmartCollectionWire(
        { name: " Ｓaved ", text: " Ｗatch ", lifecycle: "ALL", f: null },
        "create",
      ),
    ).toEqual({
      name: "Saved",
      definition: { version: 1, text: "Watch", filter: null, lifecycle: "ALL" },
    });
    expect(parseSmartCollectionWire({ name: "All" }, "create")).toEqual({
      name: "All",
      definition: { version: 1, text: "", filter: null, lifecycle: "ACTIVE" },
    });
  });
  it.each([
    { name: " " },
    { name: "x\n" },
    { name: "x".repeat(101) },
    { name: "x", ownerId: "other" },
    { name: "x", expectedRevision: 1 },
    { name: "x", f: {} },
    { name: "x", text: "x".repeat(201) },
    { name: "x", f: '{"version":1,"version":1,"root":{"kind":"tags","test":{"op":"present"}}}' },
    {
      name: "x",
      f: JSON.stringify({
        version: 1,
        root: {
          kind: "and",
          children: Array.from({ length: 51 }, () => ({ kind: "tags", test: { op: "present" } })),
        },
      }),
    },
  ])("rejects invalid create input %j", (input) => {
    expect(() => parseSmartCollectionWire(input, "create")).toThrow();
  });
  it("requires exact full definition and bounded revision", () => {
    expect(() =>
      parseSmartCollectionDefinition({ version: 1, text: "", lifecycle: "ACTIVE" }),
    ).toThrow();
    expect(() => parseSmartCollectionWire({ name: "x" }, "update")).toThrow();
    expect(() => parseSmartCollectionWire({ expectedRevision: 2147483648 }, "delete")).toThrow();
    expect(() => parseSmartCollectionWire({ expectedRevision: 1, extra: 1 }, "delete")).toThrow();
  });
});
