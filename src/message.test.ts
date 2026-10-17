import { describe, expect, it } from "vitest";
import type { MessageType } from "./message.js";
import type { IMessageTypeRegistry } from "./type-registry.js";
import {
  Child,
  Color,
  Empty,
  Maps,
  Nested,
  Oneofs,
  Optionals,
  Repeated,
  Scalars,
  Wkts,
} from "./testdata/codec.pb.js";

describe("empty messages", () => {
  it("encode, decode, compare and convert", () => {
    expect(Empty.create()).toEqual({});
    expect(Empty.equals({}, null)).toBe(true);
    expect(Empty.clone({})).toEqual({});
    expect(Array.from(Empty.toBinary({}))).toEqual([]);
    expect(Empty.fromBinary(new Uint8Array(0))).toEqual({});
    expect(Empty.toJson({})).toEqual({});
    expect(Empty.fromJson({})).toEqual({});
    expect(() => Empty.fromJson({ x: 1 })).toThrow(/x/);
    expect(Empty.fromJson({ x: 1 }, { ignoreUnknownFields: true })).toEqual({});
  });
});

describe("equals with map fields", () => {
  it("equals an unset map and an empty one", () => {
    expect(Maps.equals({}, {})).toBe(true);
    expect(Maps.equals({}, { mStr: {} })).toBe(true);
    expect(Maps.equals({ mStr: {} }, {})).toBe(true);
  });

  it("compares entries by key and value", () => {
    expect(Maps.equals({}, { mStr: { a: "b" } })).toBe(false);
    expect(Maps.equals({ mStr: { a: "b" } }, { mStr: { a: "b" } })).toBe(true);
    expect(Maps.equals({ mStr: { a: "b" } }, { mStr: { a: "c" } })).toBe(false);
    expect(Maps.equals({ mStr: { a: "" } }, { mStr: {} })).toBe(false);
    expect(Maps.equals({ mStr: { a: "" } }, { mStr: { b: "" } })).toBe(false);
    expect(
      Maps.equals(
        { mIntChild: { 1: { count: 1 } } },
        { mIntChild: { 1: { count: 1, label: "" } } },
      ),
    ).toBe(true);
  });

  it("handles null messages", () => {
    expect(Maps.equals(undefined, undefined)).toBe(true);
    expect(Maps.equals(null, { mStr: { a: "b" } })).toBe(false);
  });
});

describe("equals with zero values", () => {
  const zero: Scalars = {
    fInt32: 0,
    fUint64: 0n,
    fString: "",
    fBool: false,
    fBytes: new Uint8Array(0),
    color: Color.UNSPECIFIED,
  };

  it("equals an unset implicit field and its zero value", () => {
    expect(Scalars.equals(zero, {})).toBe(true);
    expect(Scalars.equals({}, zero)).toBe(true);
    expect(Scalars.equals(null, zero)).toBe(true);
    expect(Nested.equals({ child: {} }, {})).toBe(true);
  });

  it("equals a message and its binary and JSON round trips", () => {
    const msg: Nested = { child: { count: 0, label: "peer" }, children: [] };
    expect(Nested.equals(msg, Nested.fromBinary(Nested.toBinary(msg)))).toBe(
      true,
    );
    expect(Nested.equals(msg, Nested.fromJson(Nested.toJson(msg)))).toBe(true);
  });

  it("distinguishes a nonzero value from an unset field", () => {
    expect(Scalars.equals({ fInt32: 1 }, {})).toBe(false);
    expect(Nested.equals({ child: { count: 1 } }, {})).toBe(false);
    expect(Scalars.equals(null, { fString: "x" })).toBe(false);
  });

  it("keeps explicit presence and oneof cases strict", () => {
    expect(Optionals.equals({ oInt32: 0 }, {})).toBe(false);
    expect(Optionals.equals({ oInt32: 0 }, { oInt32: 0 })).toBe(true);
    expect(Oneofs.equals({ choice: { case: "cInt", value: 0 } }, {})).toBe(
      false,
    );
    expect(
      Oneofs.equals(
        { choice: { case: "cInt", value: 0 } },
        { choice: { case: "cInt", value: 0 } },
      ),
    ).toBe(true);
  });

  it("compares dates by time", () => {
    expect(Wkts.equals({ ts: new Date(5) }, { ts: new Date(5) })).toBe(true);
    expect(Wkts.equals({ ts: new Date(5) }, { ts: new Date(6) })).toBe(false);
    expect(Wkts.equals({ ts: new Date(0) }, {})).toBe(false);
  });
});

describe("clone", () => {
  it("copies every level", () => {
    const msg: Repeated = {
      rInt32: [1],
      rBytes: [new Uint8Array([1])],
      rChild: [{ count: 1 }],
      rTs: [new Date(7)],
    };
    const copy = Repeated.clone(msg);
    expect(copy).toEqual(msg);
    expect(copy.rInt32).not.toBe(msg.rInt32);
    expect(copy.rBytes?.[0]).not.toBe(msg.rBytes?.[0]);
    expect(copy.rChild?.[0]).not.toBe(msg.rChild?.[0]);
    expect(copy.rTs?.[0]).not.toBe(msg.rTs?.[0]);

    const maps = Maps.clone({ mIntChild: { 1: { count: 1 } } });
    expect(Object.getPrototypeOf(maps.mIntChild)).toBe(null);
    expect(maps.mIntChild?.[1]).toEqual({ count: 1 });
  });

  it("copies oneof values", () => {
    const msg: Oneofs = { choice: { case: "cChild", value: { count: 2 } } };
    const copy = Oneofs.clone(msg);
    expect(copy).toEqual(msg);
    expect(copy.choice).not.toBe(msg.choice);
    if (copy.choice?.case === "cChild" && msg.choice?.case === "cChild") {
      expect(copy.choice.value).not.toBe(msg.choice.value);
    }
  });
});

describe("JSON", () => {
  it("writes and reads every scalar form", () => {
    const msg: Scalars = {
      fDouble: NaN,
      fFloat: -Infinity,
      fInt64: -5n,
      fUint64: 18446744073709551615n,
      fBytes: new Uint8Array([0xfb, 0xff]),
      fInt64Str: "7",
      color: Color.BLUE,
    };
    const json = Scalars.toJson(msg);
    expect(json).toEqual({
      fDouble: "NaN",
      fFloat: "-Infinity",
      fInt64: "-5",
      fUint64: "18446744073709551615",
      fBytes: "+/8=",
      fInt64Str: "7",
      color: "COLOR_BLUE",
    });
    expect(Scalars.fromJson(json)).toEqual(msg);
    expect(Scalars.fromJson({ fBytes: "-_8" }).fBytes).toEqual(
      new Uint8Array([0xfb, 0xff]),
    );
  });

  it("applies write options at every depth", () => {
    const msg: Nested = {
      next: { inner: { kind: 1 }, jsonNamed: "n" },
    };
    expect(Nested.toJson(msg, { useProtoFieldName: true })).toEqual({
      next: { inner: { kind: "KIND_B" }, json_named: "n" },
    });
    expect(Nested.toJson(msg, { enumAsInteger: true })).toEqual({
      next: { inner: { kind: 1 }, customName: "n" },
    });
    expect(Nested.toJson({ next: {} }, { emitDefaultValues: true })).toEqual({
      children: [],
      customName: "",
      next: { children: [], customName: "" },
    });
  });

  it("writes present zero values of explicit fields and oneofs", () => {
    expect(Optionals.toJson({ oInt32: 0, oString: "" })).toEqual({
      oInt32: 0,
      oString: "",
    });
    expect(Oneofs.toJson({ choice: { case: "cInt", value: 0 } })).toEqual({
      cInt: 0,
    });
  });

  it("reads JSON names and proto names", () => {
    expect(Nested.fromJson({ customName: "a" }).jsonNamed).toBe("a");
    expect(Nested.fromJson({ json_named: "b" }).jsonNamed).toBe("b");
  });

  it("reads null as unset", () => {
    expect(Optionals.fromJson({ oInt32: null, oColor: null })).toEqual({});
    expect(Oneofs.fromJson({ cColor: null, cChild: null })).toEqual({});
    expect(Wkts.fromJson({ val: null }).val).toEqual({
      kind: { case: "nullValue", value: 0 },
    });
  });

  it("rejects unknown fields unless told to ignore them", () => {
    expect(() => Child.fromJson({ nope: 1 })).toThrow(/nope/);
    expect(Child.fromJson({ nope: 1 }, { ignoreUnknownFields: true })).toEqual(
      {},
    );
    expect(() => Scalars.fromJson({ color: "NOPE" })).toThrow();
    expect(
      Scalars.fromJson({ color: "NOPE" }, { ignoreUnknownFields: true }),
    ).toEqual({});
  });

  it("converts well-known types to their JSON forms", () => {
    const msg: Wkts = {
      ts: new Date(1700000000999),
      dur: { seconds: -2n, nanos: -250000000 },
      i32: 0,
      st: { fields: { a: { kind: { case: "numberValue", value: 1 } } } },
      lst: { values: [{ kind: { case: "boolValue", value: true } }] },
    };
    const json = Wkts.toJson(msg);
    expect(json).toEqual({
      ts: "2023-11-14T22:13:20.999Z",
      dur: "-2.250s",
      i32: 0,
      st: { a: 1 },
      lst: [true],
    });
    expect(Wkts.equals(Wkts.fromJson(json), msg)).toBe(true);
  });

  // Any holds the bare type name in typeUrl, without a URL prefix.
  it("round-trips Any through a registry", () => {
    const registry: IMessageTypeRegistry = {
      findMessage: <T>(name: string) =>
        (name === Child.typeName ? Child : undefined) as
          | MessageType<T>
          | undefined,
    };
    const msg: Wkts = {
      any: { typeUrl: "codec.Child", value: Child.toBinary({ count: 5 }) },
    };
    const json = Wkts.toJson(msg, { typeRegistry: registry });
    expect(json).toEqual({
      any: { "@type": "codec.Child", count: 5 },
    });
    expect(Wkts.fromJson(json, { typeRegistry: registry })).toEqual(msg);
  });

  it("keeps a __proto__ map key as an own entry", () => {
    const msg = Maps.fromJson(JSON.parse('{"mStr":{"__proto__":"v"}}'));
    expect(Object.getOwnPropertyNames(msg.mStr)).toEqual(["__proto__"]);
  });
});
