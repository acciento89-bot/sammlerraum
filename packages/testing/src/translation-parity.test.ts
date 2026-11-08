import { readFileSync } from "node:fs";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
function messages(locale: "de" | "en") {
  const values: Record<string, string> = {};
  function visit(value: unknown, path: string) {
    if (typeof value === "string") values[path] = value;
    else if (value && typeof value === "object" && !Array.isArray(value))
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
    else throw Error(`Unsupported translation value ${path}`);
  }
  visit(
    JSON.parse(
      readFileSync(new URL(`../../../apps/web/messages/${locale}.json`, import.meta.url), "utf8"),
    ),
    "",
  );
  return values;
}
describe("complete DE/EN translation contract", () => {
  const de = messages("de"),
    en = messages("en");
  it("has the same complete nonempty message keys in both locales", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    for (const locale of [de, en])
      for (const [key, value] of Object.entries(locale)) expect(value.trim(), key).not.toBe("");
  });
  it("preserves every interpolation/ICU argument across locales", () => {
    const args = (value: string) => {
      const names = new Set<string>();
      function visit(nodes: MessageFormatElement[]) {
        for (const node of nodes) {
          if (node.type !== TYPE.literal && node.type !== TYPE.pound) names.add(node.value);
          if ("options" in node)
            for (const option of Object.values(node.options)) visit(option.value);
          if ("children" in node) visit(node.children);
        }
      }
      visit(parse(value));
      return [...names].sort();
    };
    for (const key of Object.keys(de)) expect(args(en[key] ?? ""), key).toEqual(args(de[key]!));
  });
});
