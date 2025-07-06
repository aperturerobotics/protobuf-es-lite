import { describe, it, expect } from "vitest";
import { unixMilliToDate } from "./util";

describe("unixMilliToDate", () => {
  it("should convert unix milliseconds to Date correctly", () => {
    const testCases = [
      { input: 0n, expected: new Date(0) },
      { input: 1000n, expected: new Date(1000) },
      { input: 1609459200000n, expected: new Date(1609459200000) },
      { input: -1000n, expected: new Date(-1000) },
    ];

    testCases.forEach(({ input, expected }) => {
      const result = unixMilliToDate(input);
      expect(result).toEqual(expected);
    });
  });

  it("should handle large values", () => {
    const large = 8640000000000000n;
    expect(unixMilliToDate(large)).toEqual(new Date(8640000000000000));
  });

  it("should handle small values", () => {
    const small = -8640000000000000n;
    expect(unixMilliToDate(small)).toEqual(new Date(-8640000000000000));
  });

  it("should handle fractional seconds correctly", () => {
    const fractionalSecond = 1609459200123n;
    expect(unixMilliToDate(fractionalSecond)).toEqual(new Date(1609459200123));
  });
  it("should throw an error for values outside the safe range of Number", () => {
    const tooBig = 8640000000000001n;
    const tooSmall = -8640000000000001n;

    expect(() => unixMilliToDate(tooBig)).toThrowError(
      "Timestamp is outside the range that can be safely represented by a JavaScript Date",
    );
    expect(() => unixMilliToDate(tooSmall)).toThrowError(
      "Timestamp is outside the range that can be safely represented by a JavaScript Date",
    );
  });
});
