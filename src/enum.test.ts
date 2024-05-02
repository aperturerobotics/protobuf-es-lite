import { describe, it, expect } from "vitest";
import {
  createEnumType,
  enumInfoZeroValue,
  enumDescZeroValue,
  enumZeroValue,
  normalizeEnumValue,
  EnumValueInfo,
} from "./enum.js";

describe("enum", () => {
  const TestEnum = createEnumType("TestEnum", [
    { no: 0, name: "ZERO" },
    { no: 1, name: "ONE" },
    { no: 2, name: "TWO" },
  ]);

  describe("createEnumType", () => {
    it("should create an EnumType with the correct values", () => {
      expect(TestEnum.typeName).toBe("TestEnum");
      expect(TestEnum.values).toEqual([
        { no: 0, name: "ZERO", localName: "ZERO" },
        { no: 1, name: "ONE", localName: "ONE" },
        { no: 2, name: "TWO", localName: "TWO" },
      ]);
    });

    it("should find enum values by name", () => {
      expect(TestEnum.findName("ZERO")).toEqual({
        no: 0,
        name: "ZERO",
        localName: "ZERO",
      });
      expect(TestEnum.findName("ONE")).toEqual({
        no: 1,
        name: "ONE",
        localName: "ONE",
      });
      expect(TestEnum.findName("TWO")).toEqual({
        no: 2,
        name: "TWO",
        localName: "TWO",
      });
      expect(TestEnum.findName("THREE")).toBeUndefined();
    });

    it("should find enum values by number", () => {
      expect(TestEnum.findNumber(0)).toEqual({
        no: 0,
        name: "ZERO",
        localName: "ZERO",
      });
      expect(TestEnum.findNumber(1)).toEqual({
        no: 1,
        name: "ONE",
        localName: "ONE",
      });
      expect(TestEnum.findNumber(2)).toEqual({
        no: 2,
        name: "TWO",
        localName: "TWO",
      });
      expect(TestEnum.findNumber(3)).toBeUndefined();
    });
  });

  describe("enumInfoZeroValue", () => {
    it("should return 0 for an empty enum", () => {
      expect(enumInfoZeroValue([])).toBe(0);
    });

    it("should return the first value number", () => {
      expect(enumInfoZeroValue(TestEnum.values as EnumValueInfo[])).toBe(0);
    });
  });

  describe("enumDescZeroValue", () => {
    it("should throw for an empty enum", () => {
      expect(() => enumDescZeroValue({ values: [] } as any)).toThrow(
        "invalid enum: missing at least one value",
      );
    });

    it("should return the first value number", () => {
      expect(enumDescZeroValue({ values: [{ number: 42 }] } as any)).toBe(42);
    });
  });

  describe("enumZeroValue", () => {
    it("should throw for an empty enum", () => {
      expect(() => enumZeroValue({ values: [] } as any)).toThrow(
        "invalid enum: missing at least one value",
      );
    });

    it("should return the first value number", () => {
      expect(enumZeroValue(TestEnum)).toBe(0);
    });
  });

  describe("normalizeEnumValue", () => {
    it("should return the zero value for null or undefined", () => {
      expect(normalizeEnumValue(TestEnum, null)).toBe(0);
      expect(normalizeEnumValue(TestEnum, undefined)).toBe(0);
    });

    it("should return the zero value for empty string or zero value", () => {
      expect(normalizeEnumValue(TestEnum, "")).toBe(0);
      expect(normalizeEnumValue(TestEnum, 0)).toBe(0);
    });

    it("should return the number for a valid name", () => {
      expect(normalizeEnumValue(TestEnum, "ZERO")).toBe(0);
      expect(normalizeEnumValue(TestEnum, "ONE")).toBe(1);
      expect(normalizeEnumValue(TestEnum, "TWO")).toBe(2);
    });

    it("should throw for an invalid name", () => {
      expect(() => normalizeEnumValue(TestEnum, "THREE")).toThrow(
        'enum TestEnum: invalid value: "THREE"',
      );
    });

    it("should return the number value", () => {
      expect(normalizeEnumValue(TestEnum, 0)).toBe(0);
      expect(normalizeEnumValue(TestEnum, 1)).toBe(1);
      expect(normalizeEnumValue(TestEnum, 2)).toBe(2);
    });
  });
});
