// Copyright 2024 Aperture Robotics, LLC.
// Copyright 2021-2024 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { Printable, Schema } from "../protoplugin/ecmascript/index.js";
import type { DescMessage } from "../descriptor-set.js";
import { ScalarType } from "../scalar.js";
import type { DescWkt } from "../protoplugin/ecmascript/reify-wkt.js";

type Rt = Schema["runtime"];

/**
 * WktCodec replaces parts of a well-known type's generated codec: its JSON
 * functions, the conversions to and from the plain value its fields hold,
 * and the methods its message type adds.
 */
export interface WktCodec {
  writeJson?: Printable;
  readJson?: Printable;
  unwrap?: Printable;
  wrap?: Printable;
  methods?: Printable;
}

// wktCodec returns the overrides of a well-known type. The JSON forms of Any,
// Timestamp and Duration, and the methods of Any and Timestamp, are runtime
// functions; the rest are generated here.
export function wktCodec(
  rt: Rt,
  message: DescMessage,
  wkt: DescWkt,
): WktCodec | undefined {
  const t: Printable = {
    kind: "es_ref_message",
    type: message,
    typeOnly: true,
  };
  switch (wkt.typeName) {
    case "google.protobuf.Any":
      return {
        writeJson: rt.anyWriteJson,
        readJson: rt.anyReadJson,
        methods: rt.anyMethods,
      };
    case "google.protobuf.Timestamp":
      return {
        writeJson: rt.timestampWriteJson,
        readJson: rt.timestampReadJson,
        unwrap: [rt.timestampMethods, ".toDate"],
        wrap: [rt.timestampMethods, ".fromDate"],
        methods: rt.timestampMethods,
      };
    case "google.protobuf.Duration":
      return {
        writeJson: rt.durationWriteJson,
        readJson: rt.durationReadJson,
      };
    case "google.protobuf.Struct": {
      const value = wkt.fields.mapValue;
      if (value.kind !== "message") {
        return undefined;
      }
      return {
        writeJson: [
          "(m: ",
          t,
          ", o: ",
          rt.JsonWriteOptions,
          "): ",
          rt.JsonValue,
          " => {",
          "\n    const out: ",
          rt.JsonObject,
          " = {};",
          "\n    const f = m.fields ?? {};",
          "\n    for (const k in f) out[k] = ",
          value.message,
          ".writeJson(f[k], o);",
          "\n    return out;",
          "\n  }",
        ],
        readJson: [
          "(j: ",
          rt.JsonValue,
          ", o: ",
          rt.JsonReadOptions,
          ", m: ",
          t,
          "): ",
          t,
          " => {",
          "\n    m.fields ??= ",
          rt.newMap,
          "();",
          "\n    for (const [k, v] of ",
          rt.jsonEntries,
          `(j, "${wkt.typeName}")) m.fields[k] = `,
          value.message,
          ".readJson(v, o, {});",
          "\n    return m;",
          "\n  }",
        ],
      };
    }
    case "google.protobuf.Value": {
      const k = wkt.kind.name;
      const struct = wkt.structValue.message;
      const list = wkt.listValue.message;
      return {
        writeJson: [
          "(m: ",
          t,
          ", o: ",
          rt.JsonWriteOptions,
          "): ",
          rt.JsonValue,
          " => {",
          `\n    switch (m.${k}?.case) {`,
          `\n      case "nullValue": return null;`,
          `\n      case "numberValue":`,
          `\n        if (!Number.isFinite(m.${k}.value)) throw new Error("google.protobuf.Value cannot be NaN or Infinity");`,
          `\n        return m.${k}.value;`,
          `\n      case "stringValue": return m.${k}.value;`,
          `\n      case "boolValue": return m.${k}.value;`,
          `\n      case "structValue": return `,
          struct,
          `.writeJson(m.${k}.value, o);`,
          `\n      case "listValue": return `,
          list,
          `.writeJson(m.${k}.value, o);`,
          "\n    }",
          `\n    throw new Error("google.protobuf.Value must have a value");`,
          "\n  }",
        ],
        readJson: [
          "(j: ",
          rt.JsonValue,
          ", o: ",
          rt.JsonReadOptions,
          ", m: ",
          t,
          "): ",
          t,
          " => {",
          "\n    switch (typeof j) {",
          `\n      case "number": m.${k} = { case: "numberValue", value: j }; break;`,
          `\n      case "string": m.${k} = { case: "stringValue", value: j }; break;`,
          `\n      case "boolean": m.${k} = { case: "boolValue", value: j }; break;`,
          `\n      default:`,
          `\n        if (j === null) m.${k} = { case: "nullValue", value: `,
          wkt.nullValue.enum,
          ".NULL_VALUE };",
          `\n        else if (Array.isArray(j)) m.${k} = { case: "listValue", value: `,
          list,
          ".readJson(j, o, {}) };",
          `\n        else m.${k} = { case: "structValue", value: `,
          struct,
          ".readJson(j, o, {}) };",
          "\n    }",
          "\n    return m;",
          "\n  }",
        ],
      };
    }
    case "google.protobuf.ListValue": {
      const value = wkt.values.message;
      return {
        writeJson: [
          "(m: ",
          t,
          ", o: ",
          rt.JsonWriteOptions,
          "): ",
          rt.JsonValue,
          " => (m.values ?? []).map((v) => ",
          value,
          ".writeJson(v, o))",
        ],
        readJson: [
          "(j: ",
          rt.JsonValue,
          ", o: ",
          rt.JsonReadOptions,
          ", m: ",
          t,
          "): ",
          t,
          " => {",
          "\n    const a = (m.values ??= []);",
          "\n    for (const e of ",
          rt.jsonList,
          "(j)) a.push(",
          value,
          ".readJson(e, o, {}));",
          "\n    return m;",
          "\n  }",
        ],
      };
    }
    default: {
      const [write, read] = wrapperJson(rt, wkt.value.scalar);
      const [value, zero] = wrapperValue(wkt.value.scalar);
      return {
        unwrap: ["(m: ", t, "): unknown => m.value ?? ", zero],
        wrap: ["(v: unknown): ", t, " => ({ value: v as ", value, " })"],
        writeJson: ["(m: ", t, "): ", rt.JsonValue, " => ", write],
        readJson: [
          "(j: ",
          rt.JsonValue,
          ", _o: ",
          rt.JsonReadOptions,
          ", m: ",
          t,
          "): ",
          t,
          " => {\n    m.value = ",
          read,
          "(j);\n    return m;\n  }",
        ],
      };
    }
  }
}

// wrapperJson returns the expression writing the value of a wrapper message
// m to JSON, and the function reading it.
function wrapperJson(rt: Rt, scalar: ScalarType): [Printable, Printable] {
  switch (scalar) {
    case ScalarType.DOUBLE:
      return [[rt.jsonDouble, "(m.value ?? 0)"], rt.readDouble];
    case ScalarType.FLOAT:
      return [[rt.jsonDouble, "(m.value ?? 0)"], rt.readFloat];
    case ScalarType.INT64:
      return [[rt.jsonLong, "(m.value ?? 0n)"], rt.readInt64];
    case ScalarType.UINT64:
      return [[rt.jsonLong, "(m.value ?? 0n)"], rt.readUint64];
    case ScalarType.UINT32:
      return ["m.value ?? 0", rt.readUint32];
    case ScalarType.BOOL:
      return ["m.value ?? false", rt.readBool];
    case ScalarType.STRING:
      return [`m.value ?? ""`, rt.readStr];
    case ScalarType.BYTES:
      return [[rt.jsonBytes, "(m.value ?? new Uint8Array(0))"], rt.readBytes];
    default:
      return ["m.value ?? 0", rt.readInt32];
  }
}

// wrapperValue returns the TypeScript type of a wrapper's value and the
// expression of its zero value.
function wrapperValue(scalar: ScalarType): [string, string] {
  switch (scalar) {
    case ScalarType.INT64:
    case ScalarType.UINT64:
      return ["bigint", "0n"];
    case ScalarType.BOOL:
      return ["boolean", "false"];
    case ScalarType.STRING:
      return ["string", `""`];
    case ScalarType.BYTES:
      return ["Uint8Array", "new Uint8Array(0)"];
    default:
      return ["number", "0"];
  }
}
