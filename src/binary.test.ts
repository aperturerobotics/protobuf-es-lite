import { describe, expect, it } from "vitest";
import { createMessageType } from "./message.js";
import { ScalarType } from "./scalar.js";
import type { PartialFieldInfo } from "./field.js";

type Utf8Msg = {
  strict?: string;
  loose?: string;
  labels?: { [key: string]: string };
};

const Utf8Msg = createMessageType<Utf8Msg>({
  typeName: "test.Utf8Msg",
  fields: [
    {
      no: 1,
      name: "strict",
      kind: "scalar",
      T: ScalarType.STRING,
      opt: true,
      utf8: true,
    },
    {
      no: 2,
      name: "loose",
      kind: "scalar",
      T: ScalarType.STRING,
      opt: true,
    },
    {
      no: 3,
      name: "labels",
      kind: "map",
      K: ScalarType.STRING,
      keyUtf8: true,
      V: { kind: "scalar", T: ScalarType.STRING, utf8: true },
    },
  ] as readonly PartialFieldInfo[],
  packedByDefault: true,
});

type SparseScalarMsg = {
  count?: number;
};

const SparseScalarMsg = createMessageType<SparseScalarMsg>({
  typeName: "test.SparseScalarMsg",
  fields: [
    {
      no: 1,
      name: "count",
      kind: "scalar",
      T: ScalarType.UINT32,
    },
  ] as readonly PartialFieldInfo[],
  packedByDefault: true,
});

describe("binary UTF-8 validation", () => {
  it("rejects invalid UTF-8 for fields that require validation", () => {
    expect(() =>
      Utf8Msg.fromBinary(new Uint8Array([0x0a, 0x01, 0xff])),
    ).toThrow();
  });

  it("keeps existing loose string decoding behavior", () => {
    expect(Utf8Msg.fromBinary(new Uint8Array([0x12, 0x01, 0xff])).loose).toBe(
      "\ufffd",
    );
  });

  it("rejects invalid UTF-8 in map keys and values that require validation", () => {
    expect(() =>
      Utf8Msg.fromBinary(new Uint8Array([0x1a, 0x03, 0x0a, 0x01, 0xff])),
    ).toThrow();
    expect(() =>
      Utf8Msg.fromBinary(
        new Uint8Array([0x1a, 0x06, 0x0a, 0x01, 0x61, 0x12, 0x01, 0xff]),
      ),
    ).toThrow();
  });
});

describe("binary implicit scalar presence", () => {
  it("does not encode absent sparse scalar fields", () => {
    expect(Array.from(SparseScalarMsg.toBinary({}))).toEqual([]);
    expect(
      Array.from(SparseScalarMsg.toBinary({ count: undefined as number })),
    ).toEqual([]);
    expect(Array.from(SparseScalarMsg.toBinary({ count: 0 }))).toEqual([]);
    expect(Array.from(SparseScalarMsg.toBinary({ count: 7 }))).toEqual([
      0x08, 0x07,
    ]);
  });
});
