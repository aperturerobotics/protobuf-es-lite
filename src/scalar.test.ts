import { describe, expect, it } from "vitest";
import {
  ScalarType,
  scalarEquals,
  scalarZeroValue,
  isScalarZeroValue,
  normalizeScalarValue,
  LongType,
} from "./scalar";

describe("scalarEquals", () => {
  it("returns true for equal values", () => {
    expect(scalarEquals(ScalarType.INT32, 1, 1)).toBe(true);
    expect(scalarEquals(ScalarType.STRING, "hello", "hello")).toBe(true);
    expect(scalarEquals(ScalarType.BOOL, true, true)).toBe(true);
    expect(
      scalarEquals(
        ScalarType.BYTES,
        new Uint8Array([1, 2, 3]),
        new Uint8Array([1, 2, 3]),
      ),
    ).toBe(true);
  });

  it("returns false for unequal values", () => {
    expect(scalarEquals(ScalarType.INT32, 1, 2)).toBe(false);
    expect(scalarEquals(ScalarType.STRING, "hello", "world")).toBe(false);
    expect(scalarEquals(ScalarType.BOOL, true, false)).toBe(false);
    expect(
      scalarEquals(
        ScalarType.BYTES,
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
      ),
    ).toBe(false);
  });

  it("handles 64-bit integer types", () => {
    expect(scalarEquals(ScalarType.INT64, 1n, 1n)).toBe(true);
    expect(scalarEquals(ScalarType.UINT64, 1n, 1)).toBe(true);
    expect(scalarEquals(ScalarType.FIXED64, 1, "1")).toBe(true);
    expect(scalarEquals(ScalarType.SINT64, 1n, 2n)).toBe(false);
    expect(scalarEquals(ScalarType.SFIXED64, 1, "2")).toBe(false);
  });
});

describe("scalarZeroValue", () => {
  it("returns zero value for each scalar type", () => {
    expect(scalarZeroValue(ScalarType.BOOL, LongType.BIGINT)).toBe(false);
    expect(scalarZeroValue(ScalarType.INT32, LongType.BIGINT)).toBe(0);
    expect(scalarZeroValue(ScalarType.STRING, LongType.BIGINT)).toBe("");
    expect(scalarZeroValue(ScalarType.BYTES, LongType.BIGINT)).toEqual(
      new Uint8Array(0),
    );
    expect(scalarZeroValue(ScalarType.INT64, LongType.BIGINT)).toBe(0n);
    expect(scalarZeroValue(ScalarType.UINT64, LongType.STRING)).toBe("0");
  });
});

describe("isScalarZeroValue", () => {
  it("returns true for zero values", () => {
    expect(isScalarZeroValue(ScalarType.BOOL, false)).toBe(true);
    expect(isScalarZeroValue(ScalarType.INT32, 0)).toBe(true);
    expect(isScalarZeroValue(ScalarType.STRING, "")).toBe(true);
    expect(isScalarZeroValue(ScalarType.BYTES, new Uint8Array(0))).toBe(true);
    expect(isScalarZeroValue(ScalarType.INT64, 0n)).toBe(true);
    expect(isScalarZeroValue(ScalarType.UINT64, "0")).toBe(true);
    expect(isScalarZeroValue(ScalarType.DATE, new Date(0))).toBe(true);
    expect(isScalarZeroValue(ScalarType.DATE, 0)).toBe(true);
    expect(isScalarZeroValue(ScalarType.DATE, "0")).toBe(true);
  });

  it("returns false for non-zero values", () => {
    expect(isScalarZeroValue(ScalarType.BOOL, true)).toBe(false);
    expect(isScalarZeroValue(ScalarType.INT32, 1)).toBe(false);
    expect(isScalarZeroValue(ScalarType.STRING, "hello")).toBe(false);
    expect(isScalarZeroValue(ScalarType.BYTES, new Uint8Array([1]))).toBe(
      false,
    );
    expect(isScalarZeroValue(ScalarType.INT64, 1n)).toBe(false);
    expect(isScalarZeroValue(ScalarType.UINT64, "1")).toBe(false);
    expect(isScalarZeroValue(ScalarType.DATE, new Date())).toBe(false);
    expect(isScalarZeroValue(ScalarType.DATE, Date.now())).toBe(false);
  });
});

describe("normalizeScalarValue", () => {
  it("returns normalized value", () => {
    expect(normalizeScalarValue(ScalarType.INT32, 1, false)).toBe(1);
    expect(normalizeScalarValue(ScalarType.STRING, "hello", false)).toBe(
      "hello",
    );
    expect(normalizeScalarValue(ScalarType.BYTES, [1, 2, 3], false)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(normalizeScalarValue(ScalarType.INT64, 1n, false)).toBe(1n);
  });

  it("returns zero value for null or undefined", () => {
    expect(normalizeScalarValue(ScalarType.INT32, null, false)).toBe(0);
    expect(normalizeScalarValue(ScalarType.STRING, undefined, false)).toBe("");
  });

  it("clones bytes when clone is true", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const normalized = normalizeScalarValue(ScalarType.BYTES, bytes, true);
    expect(normalized).not.toBe(bytes);
    expect(normalized).toEqual(bytes);
  });
});
