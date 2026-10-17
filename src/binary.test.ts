import { describe, expect, it } from "vitest";
import { Child, Maps, Nested, Oneofs, Scalars } from "./testdata/codec.pb.js";
import { Legacy } from "./testdata/legacy.pb.js";
import { Strict } from "./testdata/strict.pb.js";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("binary UTF-8 validation", () => {
  it("rejects invalid UTF-8 in editions strings that verify it", () => {
    expect(() => Strict.fromBinary(bytes(0x0a, 0x01, 0xff))).toThrow();
  });

  it("decodes invalid UTF-8 loosely where verification is off", () => {
    expect(Strict.fromBinary(bytes(0x12, 0x01, 0xff)).loose).toBe("�");
    expect(Child.fromBinary(bytes(0x12, 0x01, 0xff)).label).toBe("�");
    expect(Legacy.fromBinary(bytes(0x08, 0x00, 0x42, 0x01, 0xff)).loose).toBe(
      "�",
    );
  });

  it("rejects invalid UTF-8 in map keys and values that verify it", () => {
    expect(() =>
      Strict.fromBinary(bytes(0x1a, 0x03, 0x0a, 0x01, 0xff)),
    ).toThrow();
    expect(() =>
      Strict.fromBinary(bytes(0x1a, 0x06, 0x0a, 0x01, 0x61, 0x12, 0x01, 0xff)),
    ).toThrow();
  });
});

describe("binary reader", () => {
  it("skips unknown fields of every wire type", () => {
    const unknown = [
      ...[0x48, 0x96, 0x01], // field 9 varint
      ...[0x51, 1, 2, 3, 4, 5, 6, 7, 8], // field 10 fixed64
      ...[0x5a, 0x02, 0xaa, 0xbb], // field 11 delimited
      ...[0x63, 0x08, 0x01, 0x64], // field 12 group
      ...[0x6d, 1, 2, 3, 4], // field 13 fixed32
    ];
    expect(Child.fromBinary(bytes(...unknown, 0x08, 0x05))).toEqual({
      count: 5,
    });
  });

  it("rejects field number 0 and wire types 6 and 7", () => {
    expect(() => Child.fromBinary(bytes(0x00, 0x00))).toThrow(/illegal tag/);
    expect(() => Child.fromBinary(bytes(0x0e))).toThrow(/illegal tag/);
    expect(() => Child.fromBinary(bytes(0x0f))).toThrow(/illegal tag/);
  });

  it("rejects a message that runs past its input", () => {
    expect(() => Oneofs.fromBinary(bytes(0x1a, 0x02, 0x08))).toThrow(
      /premature EOF/,
    );
    expect(() => Child.fromBinary(bytes(0x5a, 0x05, 0x00))).toThrow(
      /premature EOF/,
    );
  });

  it("merges a repeated message field and keeps the last oneof member", () => {
    const a = Child.toBinary({ count: 1 });
    const b = Child.toBinary({ label: "x" });
    const twice = bytes(0x0a, a.length, ...a, 0x0a, b.length, ...b);
    expect(Nested.fromBinary(twice).child).toEqual({ count: 1, label: "x" });
    const both = bytes(0x08, 0x07, 0x12, 0x01, 0x61);
    expect(Oneofs.fromBinary(both).choice).toEqual({
      case: "cStr",
      value: "a",
    });
  });

  it("reads packed and unpacked encodings of a repeated scalar", () => {
    const packed = Legacy.toBinary({ req: 0, packed: [1, 2] });
    const unpacked = Legacy.toBinary({ req: 0, unpacked: [1, 2] });
    expect(Array.from(packed)).toEqual([0x08, 0x00, 0x32, 0x02, 0x01, 0x02]);
    expect(Array.from(unpacked)).toEqual([0x08, 0x00, 0x28, 0x01, 0x28, 0x02]);
    // Each field reads either encoding.
    expect(Legacy.fromBinary(bytes(0x2a, 0x02, 0x01, 0x02)).unpacked).toEqual([
      1, 2,
    ]);
    expect(Legacy.fromBinary(bytes(0x30, 0x01, 0x30, 0x02)).packed).toEqual([
      1, 2,
    ]);
  });
});

describe("binary implicit scalar presence", () => {
  it("does not encode absent or zero implicit fields", () => {
    expect(Array.from(Child.toBinary({}))).toEqual([]);
    expect(Array.from(Child.toBinary({ count: undefined }))).toEqual([]);
    expect(Array.from(Child.toBinary({ count: 0, label: "" }))).toEqual([]);
    expect(Array.from(Child.toBinary({ count: 7 }))).toEqual([0x08, 0x07]);
  });

  it("encodes a proto2 required field even at zero", () => {
    expect(Array.from(Legacy.toBinary({ req: 0 }))).toEqual([0x08, 0x00]);
  });

  it("encodes 64-bit fields given as strings", () => {
    const m = Scalars.fromBinary(Scalars.toBinary({ fInt64Str: "-5" }));
    expect(m.fInt64Str).toBe("-5");
  });
});

// Workers RPC serializes only objects with the ordinary prototype, so decoded
// and created messages at every depth must keep it.
describe("binary message objects", () => {
  it("decodes nested messages as ordinary objects", () => {
    const msg = Nested.fromBinary(
      Nested.toBinary({ child: { count: 1 }, children: [{ count: 2 }] }),
    );
    expect(Object.getPrototypeOf(msg)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(msg.child)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(msg.children?.[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(Nested.create({}))).toBe(Object.prototype);
  });

  it("keeps a __proto__ map key as an own entry", () => {
    const msg = Maps.fromBinary(
      Maps.toBinary({ mStr: JSON.parse('{"__proto__":"v"}') }),
    );
    expect(Object.getOwnPropertyNames(msg.mStr)).toEqual(["__proto__"]);
    expect(msg.mStr?.["__proto__"]).toBe("v");
  });
});

// The writer encodes nested messages in place and moves each one forward to
// fit its length prefix, so lengths that need more than one varint byte and
// a buffer that grows mid-message must still produce canonical bytes.
describe("binary writer", () => {
  it("writes a nested message's length before its bytes", () => {
    expect(Nested.toBinary({ child: { count: 150 } })).toEqual(
      bytes(0x0a, 0x03, 0x08, 0x96, 0x01),
    );
  });

  it("round-trips nested messages past one-byte lengths", () => {
    const children = Array.from({ length: 300 }, (_, i) => ({
      count: (i + 1) * 1000,
    }));
    const msg = { child: { count: 7 }, children };
    expect(Nested.fromBinary(Nested.toBinary(msg))).toEqual(msg);

    const mStr = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`key${i}`, "v".repeat(i * 5)]),
    );
    const text = { next: { jsonNamed: "s".repeat(200) } };
    expect(Nested.fromBinary(Nested.toBinary(text))).toEqual(text);
    expect(Maps.fromBinary(Maps.toBinary({ mStr })).mStr).toEqual(mStr);
  });
});
