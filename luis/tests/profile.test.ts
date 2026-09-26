import { describe, expect, it } from "vitest";
import { caretAfterFormat, formatMoneyTyping, parseMoneyInput } from "@/lib/profile";

describe("formatMoneyTyping", () => {
  it.each([
    ["", ""],
    ["1", "1"],
    ["1500", "1,500"],
    ["15000", "15,000"],
    ["15,000", "15,000"],
    ["Q 15 000", "15,000"],
    ["1234567", "1,234,567"],
    ["0015000", "15,000"],
    ["1500.5", "1,500.5"],
    ["1500.567", "1,500.56"],
    ["1.2.3", "1.23"],
    [".5", "0.5"],
    ["abc", ""],
  ])("%j → %j", (raw, out) => {
    expect(formatMoneyTyping(raw)).toBe(out);
  });

  it("round-trips through parseMoneyInput", () => {
    for (const n of [1, 950, 15000, 19000, 123456, 1500.5]) {
      expect(parseMoneyInput(formatMoneyTyping(String(n)))).toBe(n);
    }
  });
});

describe("caretAfterFormat", () => {
  it("keeps the caret after the same digits once commas are added", () => {
    // typing the 4th digit at the end: "150|" + "0" → "1,500|"
    expect(caretAfterFormat("1500", 4, "1,500")).toBe(5);
    // inserting in the middle: "1,5|00" + "9" → raw "1,59|00" → "15,9|00"
    expect(caretAfterFormat("1,5900", 4, "15,900")).toBe(4);
    expect(caretAfterFormat("", 0, "")).toBe(0);
  });
});
