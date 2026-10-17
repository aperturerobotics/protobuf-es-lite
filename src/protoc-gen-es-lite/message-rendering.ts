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

import type {
  GeneratedFile,
  Printable,
  Schema,
} from "../protoplugin/ecmascript/index.js";
import { reifyWkt } from "../protoplugin/ecmascript/index.js";
import { getFieldTypeInfo } from "../util.js";
import type {
  DescEnum,
  DescField,
  DescMessage,
  DescOneof,
} from "../descriptor-set.js";
import { localName, protoCamelCase } from "../names.js";
import {
  FeatureSet_FieldPresence,
  FeatureSet_MessageEncoding,
  FeatureSet_Utf8Validation,
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
} from "../google/protobuf/descriptor.pb.js";
import { LongType, ScalarType } from "../scalar.js";
import { codegenInfo } from "../codegen-info.js";
import { FieldFlag, MAP_KEY_SHIFT } from "../codec.js";
import { wktCodec } from "./wkt-overrides.js";

// A message codec is generated from one description of each field's values,
// a Val. The singular, repeated, map and oneof shapes of a field differ only
// in how they loop over and test the values a Val reads and writes.
export type Val =
  | { kind: "scalar"; scalar: ScalarType; str: boolean; utf8?: boolean }
  | { kind: "enum"; enum: DescEnum }
  | { kind: "message"; message: DescMessage; group: boolean }
  | { kind: "date"; message: DescMessage }
  | { kind: "wrap"; message: DescMessage; scalar: ScalarType };

// Rt is the set of runtime symbols a generated file imports, and the
// reference to an enum's runtime type.
type Rt = Schema["runtime"] & { enumType(e: DescEnum): Printable };

/** GenerateOptions are the plugin options that change generated messages. */
export interface GenerateOptions {
  /**
   * Generate a typed decoder for each message in place of the shared one that
   * walks its field descriptions. Engines that compile TypeScript ahead of
   * time decode faster with it; elsewhere it only adds code.
   */
  typedDecode: boolean;
}

export function generateMessage(
  schema: Schema,
  f: GeneratedFile,
  message: DescMessage,
  opts: GenerateOptions,
) {
  const rt: Rt = {
    ...schema.runtime,
    enumType: (e: DescEnum): Printable => {
      const ref = f.import(e);
      return f.import(ref.name + "_Enum", ref.from);
    },
  };
  f.print(f.jsDoc(message));
  f.print(f.exportDecl("interface", message), " {");
  for (const field of message.fields) {
    generateField(f, field);
  }
  for (const oneof of message.oneofs) {
    generateOneof(f, oneof);
  }
  f.print("}");
  f.print();

  const wkt = reifyWkt(message);
  const codec = wkt && wktCodec(schema.runtime, message, wkt);
  const overrides: Printable[] = [];
  if (opts.typedDecode) {
    overrides.push("\n  decode: ", decodeFn(rt, message), ",");
  }
  if (codec?.writeJson) {
    overrides.push("\n  writeJson: ", codec.writeJson, ",");
  }
  if (codec?.readJson) {
    overrides.push("\n  readJson: ", codec.readJson, ",");
  }
  if (codec?.unwrap && codec.wrap) {
    overrides.push("\n  unwrap: ", codec.unwrap, ",");
    overrides.push("\n  wrap: ", codec.wrap, ",");
  }
  const descs: Printable[] = byNumber(message).map((field) => [
    "\n  ",
    fieldDesc(rt, field),
    ",",
  ]);
  const call: Printable[] = [
    rt.createMessageType,
    "<",
    message,
    ">(",
    f.string(message.typeName),
    ", () => [",
    descs,
    descs.length ? "\n]" : "]",
    overrides.length ? [", {", overrides, "\n}"] : [],
    ")",
  ];
  const head: Printable[] = [
    f.exportDecl("const", message),
    ": ",
    rt.MessageType,
    "<",
    message,
    ">",
  ];
  if (codec?.methods) {
    f.print(...head, " & typeof ", codec.methods, " = /* @__PURE__ */ {");
    f.print("  ...", call, ",");
    f.print("  ...", codec.methods, ",");
    f.print("};");
  } else {
    f.print(...head, " = /* @__PURE__ */ ", call, ";");
  }
  f.print();
}

// hasString reports whether a field holds strings: as its values, or as the
// keys or values of a map.
function hasString(field: DescField): boolean {
  switch (field.fieldKind) {
    case "scalar":
      return field.scalar === ScalarType.STRING;
    case "map":
      return (
        field.mapKey === ScalarType.STRING ||
        (field.mapValue.kind === "scalar" &&
          field.mapValue.scalar === ScalarType.STRING)
      );
    default:
      return false;
  }
}

// fieldDesc prints the description of field that the runtime walks:
// [number, proto name, type, flags, value type, oneof, local name, JSON
// name], without trailing slots that hold their defaults.
function fieldDesc(rt: Rt, field: DescField): Printable {
  let type: number;
  let valueType: Printable | undefined;
  let flags = 0;
  const kind =
    field.fieldKind === "map" ? field.mapValue.kind : field.fieldKind;
  switch (field.fieldKind) {
    case "scalar":
      type = field.scalar;
      if (field.longType === LongType.STRING) {
        flags |= FieldFlag.LONG_STRING;
      }
      break;
    case "enum":
      type = FieldDescriptorProto_Type.ENUM;
      valueType = rt.enumType(field.enum);
      break;
    case "message":
      type =
        isDelimited(field) ?
          FieldDescriptorProto_Type.GROUP
        : FieldDescriptorProto_Type.MESSAGE;
      valueType = [field.message, ".codec"];
      break;
    case "map": {
      const v = field.mapValue;
      flags |= FieldFlag.MAP | (field.mapKey << MAP_KEY_SHIFT);
      if (v.kind === "scalar") {
        type = v.scalar;
      } else if (v.kind === "enum") {
        type = FieldDescriptorProto_Type.ENUM;
        valueType = rt.enumType(v.enum);
      } else {
        type = FieldDescriptorProto_Type.MESSAGE;
        valueType = [v.message, ".codec"];
      }
      break;
    }
  }
  if (field.repeated) {
    flags |= FieldFlag.REPEATED;
    if (field.packed && (kind === "scalar" || kind === "enum")) {
      const val = fieldVal(field);
      if (isPackable(val)) {
        flags |= FieldFlag.PACKED;
      }
    }
  }
  if (
    fieldShape(field) === "explicit" &&
    (kind === "scalar" || kind === "enum")
  ) {
    flags |= FieldFlag.PRESENCE;
  }
  if (hasString(field) && verifiesUtf8(field)) {
    flags |= FieldFlag.UTF8;
  }
  const camel = protoCamelCase(field.name);
  const local = localName(field);
  const json = field.jsonName ?? camel;
  const slots: Printable[] = [
    String(field.number),
    JSON.stringify(field.name),
    String(type),
    String(flags),
    valueType ?? "0",
    field.oneof ? JSON.stringify(field.oneof.name) : "0",
    local !== camel ? JSON.stringify(local) : "0",
    json !== camel ? JSON.stringify(json) : "0",
  ];
  let n = slots.length;
  while (n > 3 && slots[n - 1] === "0") {
    n--;
  }
  const out: Printable[] = ["["];
  for (let i = 0; i < n; i++) {
    out.push(i ? ", " : "", slots[i]);
  }
  out.push("]");
  return out;
}

function generateField(f: GeneratedFile, field: DescField) {
  if (field.oneof) {
    return;
  }
  printDoc(f, f.jsDoc(field, "  "));
  const { typing } = getFieldTypeInfo(field);
  f.print("  ", localName(field), "?: ", typing, ";");
}

function generateOneof(f: GeneratedFile, oneof: DescOneof) {
  printDoc(f, f.jsDoc(oneof, "  "));
  const cases: Printable[] = oneof.fields.map((field) => {
    const { typing } = getFieldTypeInfo(field);
    return [
      "\n    | ",
      `{ value: `,
      typing,
      `; case: "`,
      localName(field),
      `" }`,
    ];
  });
  f.print(
    "  ",
    oneof.name,
    "?:\n    | { value?: undefined; case: undefined }",
    cases,
    ";",
  );
}

// printDoc prints a doc comment unless it is empty.
export function printDoc(f: GeneratedFile, doc: Printable) {
  if (String(doc) !== "") {
    f.print(doc);
  }
}

// fieldVal describes the values of a singular or repeated field. Timestamp
// fields hold Dates, and singular wrapper fields outside a oneof hold the
// wrapped scalar.
export function fieldVal(field: DescField): Val {
  switch (field.fieldKind) {
    case "scalar":
      return {
        kind: "scalar",
        scalar: field.scalar,
        str: field.longType === LongType.STRING,
        utf8: verifiesUtf8(field),
      };
    case "enum":
      return { kind: "enum", enum: field.enum };
    case "message":
      return messageVal(
        field.message,
        codegenInfo.getUnwrappedFieldType(field),
        isDelimited(field),
      );
    case "map":
      throw new Error("map field has no single value type");
  }
}

// mapVal describes the values of a map field. Map values unwrap Timestamp
// and the wrapper types.
function mapVal(field: DescField & { fieldKind: "map" }): Val {
  const v = field.mapValue;
  switch (v.kind) {
    case "scalar":
      return {
        kind: "scalar",
        scalar: v.scalar,
        str: false,
        utf8: verifiesUtf8(field),
      };
    case "enum":
      return { kind: "enum", enum: v.enum };
    case "message":
      return messageVal(
        v.message,
        codegenInfo.getUnwrappedMessageType(v.message),
        false,
      );
  }
}

function messageVal(
  message: DescMessage,
  unwrapped: ScalarType | undefined,
  group: boolean,
): Val {
  if (unwrapped === ScalarType.DATE) {
    return { kind: "date", message };
  }
  if (unwrapped !== undefined) {
    return { kind: "wrap", message, scalar: unwrapped };
  }
  return { kind: "message", message, group };
}

// verifiesUtf8 reports whether the strings of a field must be valid UTF-8.
// verifiesUtf8 reports whether decoding rejects invalid UTF-8 in field. Only
// editions files verify, as before: proto3 strings stay lenient so existing
// data with bad text still decodes.
function verifiesUtf8(field: DescField): boolean {
  return (
    field.parent.file.syntax === "editions" &&
    field.getFeatures().utf8Validation == FeatureSet_Utf8Validation.VERIFY
  );
}

function isDelimited(field: DescField): boolean {
  return (
    field.proto.type === FieldDescriptorProto_Type.GROUP ||
    field.getFeatures().messageEncoding == FeatureSet_MessageEncoding.DELIMITED
  );
}

// hasPresence reports whether a singular field distinguishes unset from its
// zero value.
function hasPresence(field: DescField): boolean {
  return (
    field.explicitPresence ||
    field.proto.label === FieldDescriptorProto_Label.REQUIRED ||
    field.getFeatures().fieldPresence ==
      FeatureSet_FieldPresence.LEGACY_REQUIRED
  );
}

// fieldShape classifies how a field holds its values.
function fieldShape(
  field: DescField,
): "map" | "list" | "oneof" | "explicit" | "implicit" {
  if (field.fieldKind === "map") {
    return "map";
  }
  if (field.repeated) {
    return "list";
  }
  if (field.oneof) {
    return "oneof";
  }
  const val = fieldVal(field);
  if (val.kind !== "scalar" && val.kind !== "enum") {
    return "explicit";
  }
  return hasPresence(field) ? "explicit" : "implicit";
}

// byNumber returns the fields of message in field-number order.
function byNumber(message: DescMessage): DescField[] {
  return message.fields.slice().sort((a, b) => a.number - b.number);
}

function prop(field: DescField): string {
  return localName(field);
}

// oneofKey is the property of a oneof in the generated interface.
function oneofKey(oneof: DescOneof): string {
  return oneof.name;
}

// --- binary encoding

// Wire types of scalar values.
function wireType(val: Val): number {
  switch (val.kind) {
    case "enum":
      return 0;
    case "scalar":
      switch (val.scalar) {
        case ScalarType.DOUBLE:
        case ScalarType.FIXED64:
        case ScalarType.SFIXED64:
          return 1;
        case ScalarType.FLOAT:
        case ScalarType.FIXED32:
        case ScalarType.SFIXED32:
          return 5;
        case ScalarType.STRING:
        case ScalarType.BYTES:
          return 2;
        default:
          return 0;
      }
    default:
      return 2;
  }
}

// scalarMethod is the reader and writer method for a scalar type.
function scalarMethod(scalar: ScalarType): string {
  return ScalarType[scalar].toLowerCase();
}

function isPackable(val: Val): boolean {
  return val.kind === "enum" || (val.kind === "scalar" && wireType(val) !== 2);
}

// readValue returns the expression that reads one value of val.
function readValue(val: Val): Printable[] {
  switch (val.kind) {
    case "scalar": {
      const method =
        val.scalar === ScalarType.STRING && val.utf8 ?
          "utf8"
        : scalarMethod(val.scalar);
      const read = `r.${method}()`;
      return [val.str ? `${read}.toString()` : read];
    }
    case "enum":
      return ["r.int32()"];
    case "message":
      return [
        val.message,
        val.group ? ".decode(r, r.len, {})" : ".decode(r, r.delimited(), {})",
      ];
    case "date":
      return [
        val.message,
        ".toDate(",
        val.message,
        ".decode(r, r.delimited(), {}))",
      ];
    case "wrap":
      return [
        val.message,
        ".decode(r, r.delimited(), {}).value ?? ",
        scalarZero(val.scalar, false),
      ];
  }
}

function decodeFn(rt: Rt, message: DescMessage): Printable[] {
  const t = typeRef(message);
  const cases: Printable[] = [];
  for (const field of byNumber(message)) {
    cases.push(`\n        case ${field.number}: `, decodeField(rt, field));
  }
  return [
    "(r: ",
    rt.BinaryReader,
    ", end: number, m: ",
    t,
    "): ",
    t,
    " => {",
    "\n    while (r.pos < end) {",
    "\n      const t = r.tag();",
    "\n      if ((t & 7) === 4) return m;",
    "\n      switch (t >>> 3) {",
    cases,
    "\n        default: r.skip(t);",
    "\n      }",
    "\n    }",
    "\n    return m;",
    "\n  }",
  ];
}

function decodeField(rt: Rt, field: DescField): Printable[] {
  const p = `m.${prop(field)}`;
  switch (fieldShape(field)) {
    case "implicit":
    case "explicit": {
      const val = fieldVal(field);
      if (val.kind === "message") {
        return [
          `${p} = `,
          val.message,
          val.group ? ".decode(r, r.len, " : ".decode(r, r.delimited(), ",
          `${p} ?? {}); break;`,
        ];
      }
      return [`${p} = `, readValue(val), "; break;"];
    }
    case "oneof": {
      const val = fieldVal(field);
      const o = `m.${oneofKey(field.oneof!)}`;
      const c = localName(field);
      if (val.kind === "message") {
        return [
          `${o} = { case: "${c}", value: `,
          val.message,
          val.group ? ".decode(r, r.len, " : ".decode(r, r.delimited(), ",
          `${o}?.case === "${c}" ? ${o}.value : {}) }; break;`,
        ];
      }
      return [`${o} = { case: "${c}", value: `, readValue(val), " }; break;"];
    }
    case "list": {
      const val = fieldVal(field);
      if (isPackable(val)) {
        return [
          `for (const e = r.run(t), a = (${p} ??= []); r.pos < e;) a.push(`,
          readValue(val),
          "); break;",
        ];
      }
      return [`(${p} ??= []).push(`, readValue(val), "); break;"];
    }
    case "map": {
      const f = field as DescField & { fieldKind: "map" };
      const val = mapVal(f);
      const key: Val = {
        kind: "scalar",
        scalar: f.mapKey,
        str: false,
        utf8: verifiesUtf8(f),
      };
      const stringKey = mapKeyIsString(f.mapKey);
      return [
        "{ const [k, v] = r.entry((r) => ",
        f.mapKey === ScalarType.BOOL ? "String(r.bool())"
        : stringKey && f.mapKey !== ScalarType.STRING ?
          [readValue(key), ".toString()"]
        : readValue(key),
        ", (r) => ",
        readValue(val),
        ", ",
        f.mapKey === ScalarType.BOOL ? `"false"`
        : f.mapKey === ScalarType.STRING ? `""`
        : stringKey ? `"0"`
        : "0",
        ", ",
        valZero(val),
        `); ${p} ??= `,
        rt.newMap,
        `(); ${p}[k] = v; break; }`,
      ];
    }
  }
}

// mapKeyIsString reports whether a map key type is a string property in the
// generated interface; 32-bit integer keys are numbers.
function mapKeyIsString(scalar: ScalarType): boolean {
  switch (scalar) {
    case ScalarType.INT32:
    case ScalarType.UINT32:
    case ScalarType.SINT32:
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
      return false;
    default:
      return true;
  }
}

function scalarZero(scalar: ScalarType, str: boolean): string {
  switch (scalar) {
    case ScalarType.STRING:
      return `""`;
    case ScalarType.BOOL:
      return "false";
    case ScalarType.BYTES:
      return "new Uint8Array(0)";
    case ScalarType.INT64:
    case ScalarType.UINT64:
    case ScalarType.SINT64:
    case ScalarType.FIXED64:
    case ScalarType.SFIXED64:
      return str ? `"0"` : "0n";
    default:
      return "0";
  }
}

// valZero is the value of a map entry that has no value field.
function valZero(val: Val): Printable {
  switch (val.kind) {
    case "scalar":
      return scalarZero(val.scalar, val.str);
    case "enum":
      return String(val.enum.values[0]?.number ?? 0);
    case "message":
      return "{}";
    case "date":
      return "new Date(0)";
    case "wrap":
      return scalarZero(val.scalar, false);
  }
}

// typeRef prints the interface of message for a type position.
export function typeRef(message: DescMessage): Printable {
  return { kind: "es_ref_message", type: message, typeOnly: true };
}
