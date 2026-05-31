import { describe, expect, it } from "vitest";
import { createEmptyMessageType, createMessageType } from "./message.js";
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

type EmptyMsg = Record<string, never>;

const EmptyMsg = createEmptyMessageType<EmptyMsg>("test.EmptyMsg", true);
const EmptyMsgViaFullConstructor = createMessageType<EmptyMsg>({
  typeName: "test.EmptyMsg",
  fields: [] satisfies readonly PartialFieldInfo[],
  packedByDefault: true,
});

describe("createEmptyMessageType", () => {
  it("matches createMessageType behavior for zero-field messages", () => {
    const empty = EmptyMsg.create();
    const full = EmptyMsgViaFullConstructor.create();

    expect(EmptyMsg.typeName).toBe(EmptyMsgViaFullConstructor.typeName);
    expect(EmptyMsg.fields.list()).toEqual(
      EmptyMsgViaFullConstructor.fields.list(),
    );
    expect(EmptyMsg.fields.byMember()).toEqual(
      EmptyMsgViaFullConstructor.fields.byMember(),
    );
    expect(EmptyMsg.equals(empty, full)).toBe(true);
    expect(EmptyMsg.clone(empty)).toEqual(
      EmptyMsgViaFullConstructor.clone(full),
    );
    expect(EmptyMsg.createComplete()).toEqual(
      EmptyMsgViaFullConstructor.createComplete(),
    );
    expect(Array.from(EmptyMsg.toBinary(empty))).toEqual(
      Array.from(EmptyMsgViaFullConstructor.toBinary(full)),
    );
    expect(EmptyMsg.fromBinary(new Uint8Array(0))).toEqual(
      EmptyMsgViaFullConstructor.fromBinary(new Uint8Array(0)),
    );
    expect(EmptyMsg.toJson(empty)).toEqual(
      EmptyMsgViaFullConstructor.toJson(full),
    );
    expect(EmptyMsg.fromJson({})).toEqual(
      EmptyMsgViaFullConstructor.fromJson({}),
    );
  });
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
