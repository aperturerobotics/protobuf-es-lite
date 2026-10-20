import { describe, expect, it } from "vitest";
import type { MessageType } from "./message.js";
import * as walk from "./testdata/codec.pb.js";
import * as typed from "./testdata/codec-typed.pb.js";

// codec-typed.pb.ts is codec.proto generated with typed_decode and
// typed_encode, so each of its messages encodes and decodes with generated
// code where codec.pb.ts walks the field descriptions. Both must write the
// same bytes and read them into the same message.
const child = { count: 3, label: "c" };
const samples: [string, unknown[]][] = [
  ["Child", [{}, child, { count: 4294967295 }]],
  [
    "Scalars",
    [
      {
        fDouble: -1.5,
        fFloat: 2.5,
        fInt64: -9007199254740993n,
        fUint64: 18446744073709551615n,
        fInt32: -1,
        fFixed64: 5n,
        fFixed32: 6,
        fBool: true,
        fString: "héllo",
        fBytes: new Uint8Array([0, 255]),
        fUint32: 7,
        fSfixed32: -8,
        fSfixed64: -9n,
        fSint32: -10,
        fSint64: -11n,
        fInt64Str: "-12",
        color: walk.Color.BLUE,
      },
      { fDouble: Infinity, fFloat: -Infinity },
      {
        fDouble: 0,
        fInt64: 0n,
        fString: "",
        fBytes: new Uint8Array(0),
        fBool: false,
        fInt64Str: "0",
        color: walk.Color.UNSPECIFIED,
      },
    ],
  ],
  [
    "Optionals",
    [
      {
        oInt32: 0,
        oString: "",
        oBytes: new Uint8Array(0),
        oColor: walk.Color.UNSPECIFIED,
        oBool: false,
        oDouble: 0,
        oInt64: 0n,
      },
    ],
  ],
  [
    "Repeated",
    [
      {
        rInt32: [1, -2, 300],
        rDouble: [0.5, -0.25],
        rString: ["a", ""],
        rBytes: [new Uint8Array([1]), new Uint8Array(0)],
        rColor: [walk.Color.RED, walk.Color.BLUE],
        rChild: [child, {}],
        rSint64: [-1n, 1n],
        rUnpacked: [5, 6],
        rTs: [new Date(1700000000123), new Date(0)],
        rWrap: [{ value: 9 }, {}],
      },
    ],
  ],
  [
    "Maps",
    [
      {
        mStr: { a: "b", "": "" },
        mIntChild: { 1: child, [-5]: {} },
        mLongEnum: { "-7": walk.Color.RED },
        mBoolBytes: { true: new Uint8Array([2]), false: new Uint8Array(0) },
        mTs: { t: new Date(5) },
        mWrap: { 3: "w" },
        mSint: { "-2": 1.25 },
      },
    ],
  ],
  [
    "Oneofs",
    [
      { choice: { case: "cInt", value: 0 }, after: "x" },
      { choice: { case: "cStr", value: "s" } },
      { choice: { case: "cChild", value: child } },
      { choice: { case: "cColor", value: walk.Color.RED } },
      { choice: { case: "cBytes", value: new Uint8Array([3]) } },
      { choice: { case: "cTs", value: new Date(9) } },
      { choice: { case: "cWrap", value: { value: 2 } } },
    ],
  ],
  [
    "Wkts",
    [
      {
        ts: new Date(-1),
        dur: { seconds: -2n, nanos: -5 },
        i32: 0,
        str: "s",
        i64: 1n,
        byt: new Uint8Array([4]),
        st: { fields: { k: { kind: { case: "numberValue", value: 1 } } } },
        val: { kind: { case: "boolValue", value: true } },
        lst: { values: [{ kind: { case: "nullValue", value: 0 } }] },
        any: { typeUrl: "codec.Child", value: new Uint8Array([8, 1]) },
        dbl: 0.5,
        bln: false,
      },
    ],
  ],
  [
    "Nested",
    [
      {
        child,
        next: { next: { jsonNamed: "deep" }, inner: { x: 1, kind: 1 } },
        children: [child, child],
        jsonNamed: "n",
      },
    ],
  ],
  ["Empty", [{}]],
];

const lookup = (mod: object, name: string) =>
  (mod as Record<string, MessageType<unknown>>)[name];

describe("typed codec", () => {
  for (const [name, messages] of samples) {
    it(`encodes and decodes ${name} as the walker does`, () => {
      const w = lookup(walk, name);
      const t = lookup(typed, name);
      for (const m of messages) {
        const bytes = w.toBinary(m);
        expect(t.toBinary(m)).toEqual(bytes);
        const fromWalk = w.fromBinary(bytes);
        expect(t.fromBinary(bytes)).toEqual(fromWalk);
        expect(w.equals(fromWalk, m)).toBe(true);
        expect(t.toBinary(fromWalk)).toEqual(bytes);
      }
    });
  }

  it("merges repeated messages and skips unknown fields as the walker does", () => {
    const a = walk.Nested.toBinary({ child: { count: 1 }, jsonNamed: "a" });
    const b = walk.Nested.toBinary({ child: { label: "x" } });
    const bytes = new Uint8Array([...a, 0x48, 0x01, ...b]);
    expect(typed.Nested.fromBinary(bytes)).toEqual(
      walk.Nested.fromBinary(bytes),
    );
  });
});
