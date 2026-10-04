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

type ZeroMsg = {
  weight?: number;
  size?: bigint;
  name?: string;
  enabled?: boolean;
  data?: Uint8Array;
  child?: MapScalarMsg;
  choice?:
    | { value: number; case: "count" }
    | { value?: undefined; case: undefined };
  labels?: { [key: string]: string };
};

const ZeroMsg = createMessageType<ZeroMsg>({
  typeName: "test.ZeroMsg",
  fields: [
    { no: 1, name: "weight", kind: "scalar", T: ScalarType.INT32 },
    { no: 2, name: "size", kind: "scalar", T: ScalarType.UINT64 },
    { no: 3, name: "name", kind: "scalar", T: ScalarType.STRING },
    { no: 4, name: "enabled", kind: "scalar", T: ScalarType.BOOL },
    { no: 5, name: "data", kind: "scalar", T: ScalarType.BYTES },
    { no: 6, name: "child", kind: "message", T: () => MapScalarMsg },
    {
      no: 7,
      name: "count",
      kind: "scalar",
      T: ScalarType.INT32,
      oneof: "choice",
    },
    {
      no: 8,
      name: "labels",
      kind: "map",
      K: ScalarType.STRING,
      V: { kind: "scalar", T: ScalarType.STRING },
    },
  ] as readonly PartialFieldInfo[],
  packedByDefault: true,
});

describe("compareMessages with zero values", () => {
  it("equals an unset field and its zero value", () => {
    const zero = ZeroMsg.create({
      weight: 0,
      size: 0n,
      name: "",
      enabled: false,
      data: new Uint8Array(0),
      child: {},
    });
    expect(ZeroMsg.equals(zero, {})).toBe(true);
    expect(ZeroMsg.equals({}, zero)).toBe(true);
    expect(ZeroMsg.equals(zero, ZeroMsg.createComplete())).toBe(true);
    expect(ZeroMsg.equals(null, zero)).toBe(true);
  });

  it("equals a message and its binary round trip", () => {
    const msg = ZeroMsg.create({
      weight: 0,
      name: "peer",
      child: { labels: {} },
    });
    expect(ZeroMsg.equals(msg, ZeroMsg.fromBinary(ZeroMsg.toBinary(msg)))).toBe(
      true,
    );
  });

  it("distinguishes a nonzero value from an unset field", () => {
    expect(ZeroMsg.equals({ weight: 1 }, {})).toBe(false);
    expect(ZeroMsg.equals({ child: { labels: { a: "" } } }, {})).toBe(false);
    expect(ZeroMsg.equals(null, { name: "x" })).toBe(false);
  });

  it("keeps oneof case and map key presence strict", () => {
    expect(ZeroMsg.equals({ choice: { case: "count", value: 0 } }, {})).toBe(
      false,
    );
    expect(
      ZeroMsg.equals(
        { choice: { case: "count", value: 0 } },
        { choice: { case: "count", value: 0 } },
      ),
    ).toBe(true);
    expect(ZeroMsg.equals({ labels: { a: "" } }, { labels: {} })).toBe(false);
    expect(ZeroMsg.equals({ labels: { a: "" } }, { labels: { b: "" } })).toBe(
      false,
    );
  });
});
