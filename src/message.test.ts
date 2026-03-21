import { describe, expect, it } from "vitest";
import { createMessageType } from "./message.js";
import { ScalarType } from "./scalar.js";
import type { PartialFieldInfo } from "./field.js";

type MapScalarMsg = {
  labels?: { [key: string]: string };
};

const MapScalarMsg = createMessageType<MapScalarMsg>({
  typeName: "test.MapScalarMsg",
  fields: [
    {
      no: 1,
      name: "labels",
      kind: "map",
      K: ScalarType.STRING,
      V: { kind: "scalar", T: ScalarType.STRING },
    },
  ] as readonly PartialFieldInfo[],
  packedByDefault: true,
});

describe("compareMessages with map fields", () => {
  it("equals returns true when both map fields are undefined", () => {
    const a = MapScalarMsg.create();
    const b = MapScalarMsg.create();
    expect(MapScalarMsg.equals(a, b)).toBe(true);
  });

  it("equals returns true when one map field is undefined and other is empty", () => {
    const a = MapScalarMsg.create();
    const b = MapScalarMsg.create({ labels: {} });
    expect(MapScalarMsg.equals(a, b)).toBe(true);
  });

  it("equals returns false when one map field is undefined and other has entries", () => {
    const a = MapScalarMsg.create();
    const b = MapScalarMsg.create({ labels: { foo: "bar" } });
    expect(MapScalarMsg.equals(a, b)).toBe(false);
  });

  it("equals returns true for identical map entries", () => {
    const a = MapScalarMsg.create({ labels: { x: "1", y: "2" } });
    const b = MapScalarMsg.create({ labels: { x: "1", y: "2" } });
    expect(MapScalarMsg.equals(a, b)).toBe(true);
  });

  it("equals returns false for different map entries", () => {
    const a = MapScalarMsg.create({ labels: { x: "1" } });
    const b = MapScalarMsg.create({ labels: { x: "2" } });
    expect(MapScalarMsg.equals(a, b)).toBe(false);
  });

  it("equals handles null messages with map fields", () => {
    expect(MapScalarMsg.equals(null, null)).toBe(true);
    expect(MapScalarMsg.equals(undefined, undefined)).toBe(true);
    expect(
      MapScalarMsg.equals(null, MapScalarMsg.create({ labels: { a: "b" } })),
    ).toBe(false);
  });
});
