import { describe, expect, it } from "vitest";
import { createEnumType } from "./enum.js";
import { Color_Enum } from "./testdata/codec.pb.js";

describe("createEnumType", () => {
  const TestEnum = createEnumType("TestEnum", [
    [0, "ZERO"],
    [1, "ONE"],
    [2, "TWO"],
    [2, "ALIAS"],
  ]);

  it("keeps the values in declaration order", () => {
    expect(TestEnum.typeName).toBe("TestEnum");
    expect(TestEnum.values.map((v) => v.name)).toEqual([
      "ZERO",
      "ONE",
      "TWO",
      "ALIAS",
    ]);
  });

  it("finds values by name, including aliases", () => {
    expect(TestEnum.findName("ONE")).toEqual({ no: 1, name: "ONE" });
    expect(TestEnum.findName("ALIAS")).toEqual({ no: 2, name: "ALIAS" });
    expect(TestEnum.findName("THREE")).toBeUndefined();
  });

  it("finds the first value with a number", () => {
    expect(TestEnum.findNumber(2)).toEqual({ no: 2, name: "TWO" });
    expect(TestEnum.findNumber(3)).toBeUndefined();
  });

  it("describes generated enums", () => {
    expect(Color_Enum.typeName).toBe("codec.Color");
    expect(Color_Enum.findNumber(2)?.name).toBe("COLOR_BLUE");
  });
});
