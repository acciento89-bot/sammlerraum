import { describe, expect, it } from "vitest";
import { GradingInputSchema } from "./grading";

describe("grading authored provenance", () => {
  it("accepts trimmed NFC multiline source with CR LF and tabs", () => {
    expect(
      GradingInputSchema.parse({
        provider: "Provider",
        grade: "A",
        source: "  Cafe\u0301 receipt\r\nSecond\tline\rThird\nlast  ",
      }).source,
    ).toBe("Café receipt\r\nSecond\tline\rThird\nlast");
  });
  it.each(
    Array.from({ length: 128 }, (_, code) => code).filter(
      (code) => (code < 32 && ![9, 10, 13].includes(code)) || code === 127,
    ),
  )("rejects forbidden source control %i", (code) => {
    expect(
      GradingInputSchema.safeParse({
        provider: "Provider",
        grade: "A",
        source: `First${String.fromCharCode(code)}last`,
      }).success,
    ).toBe(false);
  });
  it.each(["provider", "grade", "certificateNo", "comparableScale", "verificationUrl"])(
    "keeps %s control-free",
    (field) => {
      for (const control of ["\r", "\n", "\t", "\u0000", "\u007f"]) {
        expect(
          GradingInputSchema.safeParse({
            provider: "Provider",
            grade: "A",
            comparableValue: "1",
            comparableScale: "Scale",
            [field]: `https://example.test/a${control}b`,
          }).success,
        ).toBe(false);
      }
    },
  );
  it("retains source length and nonblank bounds", () => {
    for (const source of ["\r\n\t ", "x".repeat(1001)])
      expect(GradingInputSchema.safeParse({ provider: "P", grade: "A", source }).success).toBe(
        false,
      );
  });
});
