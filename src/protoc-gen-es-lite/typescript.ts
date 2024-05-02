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
  ImportSymbol,
  Printable,
  Schema,
} from "../protoplugin/ecmascript/index.js";
import {
  createImportSymbol,
  reifyWkt,
} from "../protoplugin/ecmascript/index.js";
import { getFieldDefaultValueExpression, getFieldTypeInfo } from "../util.js";
import {
  DescEnum,
  DescExtension,
  DescField,
  DescFile,
  DescMessage,
  DescOneof,
  DescFieldMapValueMessage,
} from "../descriptor-set.js";
import { localName } from "../names.js";
import { LongType, ScalarType } from "../scalar.js";
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
} from "../google/protobuf/descriptor.pb.js";
import { DescWkt } from "../protoplugin/ecmascript/reify-wkt.js";

export function generateTs(schema: Schema) {
  for (const file of schema.files) {
    const f = schema.generateFile(file.name + ".pb.ts");
    f.preamble(file);
    f.print(`export const protobufPackage = "${file.proto.package}";`);
    f.print();

    for (const enumeration of file.enums) {
      generateEnum(schema, f, enumeration);
    }

    const messageTypes: DescMessage[] = [];
    const dependencies = new Map<DescMessage, Set<DescMessage>>();
    function collectMessages(message: DescMessage) {
      if (message.file !== file) {
        return;
      }

      for (const nestedEnum of message.nestedEnums) {
        generateEnum(schema, f, nestedEnum);
      }

      messageTypes.push(message);
      const deps = new Set<DescMessage>();
      for (const field of message.fields) {
        if (field.fieldKind === "message" && field.message.file === file) {
          deps.add(field.message);
        } else if (
          field.fieldKind === "map" &&
          field.mapValue.kind === "message" &&
          field.mapValue.message.file === file
        ) {
          deps.add(field.mapValue.message);
        }
      }
      dependencies.set(message, deps);

      for (const nestedMessage of message.nestedMessages) {
        collectMessages(nestedMessage);
      }
    }

    for (const message of file.messages) {
      collectMessages(message);
    }

    // Topological sort to ensure consts are declared in the right order.
    const sortedMessageTypes = topologicalSort(messageTypes, dependencies);
    for (const message of sortedMessageTypes) {
      generateMessage(schema, f, message);
    }

    // We do not generate anything for services or extensions
  }
}

// topologicalSort sorts the list of messages by dependency order.
function topologicalSort(
  messages: DescMessage[],
  dependencies: Map<DescMessage, Set<DescMessage>>,
): DescMessage[] {
  const result: DescMessage[] = [];
  const visited = new Set<DescMessage>();

  function visit(message: DescMessage) {
    if (visited.has(message)) return;
    visited.add(message);
    for (const dep of dependencies.get(message) ?? []) {
      visit(dep);
    }
    result.push(message);
  }

  for (const message of messages) {
    visit(message);
  }

  return result;
}

function generateEnum(schema: Schema, f: GeneratedFile, enumeration: DescEnum) {
  f.print(f.jsDoc(enumeration));
  f.print(f.exportDecl("enum", enumeration), " {");
  for (const value of enumeration.values) {
    if (enumeration.values.indexOf(value) > 0) {
      f.print();
    }
    f.print(f.jsDoc(value, "  "));
    f.print("  ", localName(value), " = ", value.number, ",");
  }
  f.print("}");
  f.print();
  f.print("// ", enumeration, "_Enum is the enum type for ", enumeration, ".");
  f.print(
    f.exportDecl("const", enumeration),
    "_Enum",
    " = ",
    schema.runtime.createEnumType,
    "(",
    f.string(enumeration.typeName),
    ", [",
  );
  for (const value of enumeration.values) {
    f.print("  { no: ", value.number, ', name: "', value.name, '" },');
  }
  f.print("]);");
  f.print();
}

export function checkSupportedSyntax(file: DescFile) {
  if (file.syntax === "editions") {
    throw new Error(
      `${file.proto.name ?? ""}: syntax "editions" is not supported`,
    );
  }
}

function generateMessage(
  schema: Schema,
  f: GeneratedFile,
  message: DescMessage,
) {
  checkSupportedSyntax(message.file);
  const {
    MessageType: rtMessageType,
    createMessageType,
    PartialFieldInfo,
  } = schema.runtime;

  f.print(f.jsDoc(message));
  f.print(f.exportDecl("type", message), " = ", schema.runtime.Message, "<{");
  for (const field of message.fields) {
    generateField(f, field);
  }

  for (const oneof of message.oneofs) {
    generateOneof(f, oneof);
  }

  f.print();
  f.print("}>;");
  f.print();

  // If we need to extend the message type, do that here.
  const reWkt = reifyWkt(message);
  if (reWkt != null) {
    f.print(
      "// ",
      message,
      "_Wkt contains the well-known-type overrides for ",
      message,
      ".",
    );
    f.print("const ", message, "_Wkt = {");
    generateWktMethods(schema, f, message, reWkt);
    f.print("};");
    f.print();

    f.print(
      "// ",
      message,
      " contains the message type declaration for ",
      message,
      ".",
    );
    f.print(
      f.exportDecl("const", message),
      `: `,
      rtMessageType,
      `<`,
      message,
      `> & typeof `,
      message,
      `_Wkt = `,
      createMessageType,
      "<",
      message,
      ", typeof ",
      message,
      "_Wkt>({",
    );
  } else {
    f.print(
      "// ",
      message,
      " contains the message type declaration for ",
      message,
      ".",
    );
    f.print(
      f.exportDecl("const", message),
      `: `,
      rtMessageType,
      `<`,
      message,
      `> = `,
      createMessageType,
      "({",
    );
  }

  f.print("    typeName: ", f.string(message.typeName), ",");
  f.print("    fields: [");
  for (const field of message.fields) {
    generateFieldInfo(f, schema, field);
  }
  f.print("    ] as readonly ", PartialFieldInfo, "[],");
  f.print("    packedByDefault: ", message.file.proto.syntax === "proto3", ",");
  if (reWkt == null) {
    f.print("});");
  } else {
    generateWktFieldWrapper(f, message, reWkt);
    f.print("}, ", message, "_Wkt);");
  }
  f.print();
}

function generateField(f: GeneratedFile, field: DescField) {
  if (field.oneof) {
    return;
  }
  f.print(f.jsDoc(field, "  "));
  const { typing } = getFieldTypeInfo(field);
  f.print("  ", localName(field), "?: ", typing, ";");
}

function generateOneof(f: GeneratedFile, oneof: DescOneof) {
  f.print();
  f.print(f.jsDoc(oneof, "  "));
  var oneOfCases: Printable[] = oneof.fields
    .map((field) => {
      const { typing } = getFieldTypeInfo(field);
      const doc = f.jsDoc(field, "    ");
      return [
        ` | {\n`,
        doc,
        `\n    value: `,
        typing,
        `;\n    case: "`,
        localName(field),
        `";\n  }`,
      ];
    })
    .flat();
  f.print(
    "  ",
    oneof.name,
    "?: {\n    value?: undefined,\n    case: undefined\n  }",
    oneOfCases,
    ";",
  );
}

export function makeImportPath(file: DescFile): string {
  return "./" + file.name + ".pb.js";
}

export function generateFieldInfo(
  f: GeneratedFile,
  schema: Schema,
  field: DescField | DescExtension,
) {
  f.print("        ", getFieldInfoLiteral(schema, field), ",");
}

export const createTypeImport = (
  desc: DescMessage | DescEnum | DescExtension,
): ImportSymbol => {
  var name = localName(desc);
  if (desc.kind === "enum") {
    name += "_Enum";
  }
  const from = makeImportPath(desc.file);
  return createImportSymbol(name, from);
};

export function getFieldInfoLiteral(
  schema: Schema,
  field: DescField | DescExtension,
): Printable {
  const { ScalarType: rtScalarType, LongType: rtLongType } = schema.runtime;
  const e: Printable = [];
  e.push("{ no: ", field.number, `, `);
  if (field.kind == "field") {
    e.push(`name: "`, field.name, `", `);
    if (field.jsonName !== undefined) {
      e.push(`jsonName: "`, field.jsonName, `", `);
    }
  }
  switch (field.fieldKind) {
    case "scalar":
      e.push(
        `kind: "scalar", T: `,
        rtScalarType,
        `.`,
        ScalarType[field.scalar],
        `, `,
      );
      if (field.longType != LongType.BIGINT) {
        e.push(`L: `, rtLongType, `.`, LongType[field.longType], `, `);
      }
      break;
    case "map":
      e.push(
        `kind: "map", K: `,
        rtScalarType,
        `.`,
        ScalarType[field.mapKey],
        `, `,
      );
      switch (field.mapValue.kind) {
        case "scalar":
          e.push(
            `V: {kind: "scalar", T: `,
            rtScalarType,
            `.`,
            ScalarType[field.mapValue.scalar],
            `}, `,
          );
          break;
        case "message":
          e.push(
            `V: {kind: "message", T: () => `,
            field.mapValue.message,
            `}, `,
          );
          break;
        case "enum":
          e.push(`V: {kind: "enum", T: `, field.mapValue.enum, `}, `);
          break;
      }
      break;
    case "message":
      e.push(`kind: "message", T: () => `, field.message, `, `);
      if (field.proto.type === FieldDescriptorProto_Type.GROUP) {
        e.push(`delimited: true, `);
      }
      break;
    case "enum":
      e.push(`kind: "enum", T: `, createTypeImport(field.enum), `, `);
      break;
  }
  if (field.repeated) {
    e.push(`repeated: true, `);
    if (field.packed !== field.packedByDefault) {
      e.push(`packed: `, field.packed, `, `);
    }
  }
  if (field.optional) {
    e.push(`opt: true, `);
  } else if (field.proto.label === FieldDescriptorProto_Label.REQUIRED) {
    e.push(`req: true, `);
  }
  const defaultValue = getFieldDefaultValueExpression(field);
  if (defaultValue !== undefined) {
    e.push(`default: `, defaultValue, `, `);
  }
  if (field.oneof) {
    e.push(`oneof: "`, field.oneof.name, `", `);
  }
  const lastE = e[e.length - 1];
  if (typeof lastE == "string" && lastE.endsWith(", ")) {
    e[e.length - 1] = lastE.substring(0, lastE.length - 2);
  }
  e.push(" }");
  return e;
}

function generateWktMethods(
  schema: Schema,
  f: GeneratedFile,
  message: DescMessage,
  ref: DescWkt,
) {
  const {
    JsonValue,
    JsonReadOptions,
    JsonWriteOptions,
    JsonObject,
    jsonReadScalar,
    jsonWriteScalar,
    jsonDebugValue,
    Message,
    MessageType,
    IMessageTypeRegistry,
    ScalarType: rtScalarType,
    LongType: rtLongType,
    // ScalarValue: rtScalarValue,
    protoInt64,
    applyPartialMessage,
  } = schema.runtime;
  switch (ref.typeName) {
    case "google.protobuf.Any":
      f.print(
        "  toJson(msg: ",
        message,
        ", options?: Partial<",
        JsonWriteOptions,
        ">): ",
        JsonValue,
        " {",
      );
      f.print("    const typeName = msg?.", localName(ref.typeUrl), ";");
      f.print(`    if (!typeName) {`);
      f.print("      return {};");
      f.print("    }");
      f.print(
        "    const messageType = options?.typeRegistry?.findMessage(typeName);",
      );
      f.print("    if (!messageType) {");
      f.print(
        "      throw new Error(`cannot encode message ",
        message.typeName,
        ' to JSON: "${typeName}" is not in the type registry`);',
      );
      f.print("    }");
      f.print(
        "    const message = messageType.fromBinary(msg.",
        localName(ref.value),
        ");",
      );
      f.print("    let json = messageType.toJson(message, options);");
      f.print(
        `    if (typeName.startsWith("google.protobuf.") || (json === null || Array.isArray(json) || typeof json !== "object")) {`,
      );
      f.print("      json = {value: json};");
      f.print("    }");
      f.print(`    json["@type"] = typeName;`);
      f.print("    return json;");
      f.print("  },");
      f.print();
      f.print(
        "  fromJson(json: ",
        JsonValue,
        ", options?: Partial<",
        JsonReadOptions,
        ">) {",
      );
      f.print(
        `    if (json === null || Array.isArray(json) || typeof json != "object") {`,
      );
      f.print(
        "      throw new Error(`cannot decode message ",
        message.typeName,
        ' from JSON: expected object but got ${json === null ? "null" : Array.isArray(json) ? "array" : typeof json}`);',
      );
      f.print("    }");
      f.print(`    if (Object.keys(json).length == 0) {`);
      f.print(`      return {} as `, message, `;`);
      f.print(`    }`);
      f.print(`    const typeUrl = json["@type"];`);
      f.print(`    if (typeof typeUrl != "string" || typeUrl == "") {`);
      f.print(
        "      throw new Error(`cannot decode message ",
        message.typeName,
        ' from JSON: "@type" is empty`);',
      );
      f.print("    }");
      f.print(
        "    const typeName = typeUrl, messageType = options?.typeRegistry?.findMessage(typeName);",
      );
      f.print("    if (!messageType) {");
      f.print(
        "      throw new Error(`cannot decode message ",
        message.typeName,
        " from JSON: ${typeUrl} is not in the type registry`);",
      );
      f.print("    }");
      f.print("    let message;");
      f.print(
        `    if (typeName.startsWith("google.protobuf.") &&  Object.prototype.hasOwnProperty.call(json, "value")) {`,
      );
      f.print(`      message = messageType.fromJson(json["value"], options);`);
      f.print("    } else {");
      f.print("      const copy = Object.assign({}, json);");
      f.print(`      delete copy["@type"];`);
      f.print("      message = messageType.fromJson(copy, options);");
      f.print("    }");
      f.print("    const out = {} as ", message, ";");
      f.print("    ", message, ".packFrom(out, message, messageType);");
      f.print("    return out;");
      f.print("  },");
      f.print();
      f.print(
        "  packFrom<T extends ",
        Message,
        "<T>>(out: ",
        message,
        ", message: ",
        Message,
        "<T>, messageType: ",
        MessageType,
        "<T>): void {",
      );
      f.print(
        "    out.",
        localName(ref.value),
        " = messageType.toBinary(message);",
      );
      f.print("    out.", localName(ref.typeUrl), " = messageType.typeName;");
      f.print("  },");
      f.print();
      f.print(
        "  unpackTo<T extends ",
        Message,
        "<T>>(msg: ",
        message,
        ", target: ",
        Message,
        "<T>, targetMessageType: ",
        MessageType,
        "<T>): boolean {",
      );
      f.print("    if (!", message, ".is(msg, targetMessageType)) {");
      f.print("      return false;");
      f.print("    }");
      f.print(
        "    const partial = targetMessageType.fromBinary(msg.",
        localName(ref.value),
        ");",
      );
      f.print(
        "    ",
        applyPartialMessage,
        "(partial, target, targetMessageType.fields);",
      );
      f.print("    return true;");
      f.print("  },");
      f.print();
      f.print(
        "  unpack<T extends Message<T>>(msg: ",
        message,
        ", registry: ",
        IMessageTypeRegistry,
        "): {message: ",
        Message,
        "<T>, messageType: ",
        MessageType,
        "<T>} | undefined {",
      );
      f.print("    const typeUrl = msg.", localName(ref.typeUrl)), ";";
      f.print(
        "    const messageType = !!typeUrl && registry.findMessage<T>(typeUrl);",
      );
      f.print(
        "    return messageType ? {message: messageType.fromBinary(msg.",
        localName(ref.value),
        "), messageType} : undefined;",
      );
      f.print("  },");
      f.print();
      f.print(
        "  is(msg: ",
        message,
        ", msgType: ",
        MessageType,
        " | string): boolean {",
      );
      f.print("    const name = msg.", localName(ref.typeUrl)), ";";
      f.print(
        "    return !!name && (typeof msgType === 'string' ? name === msgType : name === msgType.typeName);",
      );
      f.print("  },");
      break;
    case "google.protobuf.Timestamp":
      f.print("  fromJson(json: ", JsonValue, "): ", message, " {");
      f.print(`    if (typeof json !== "string") {`);
      f.print(
        "      throw new Error(`cannot decode ",
        message.typeName,
        "(json)}`);",
      );
      f.print("    }");
      f.print(
        `    const matches = json.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:Z|\\.([0-9]{3,9})Z|([+-][0-9][0-9]:[0-9][0-9]))$/);`,
      );
      f.print("    if (!matches) {");
      f.print(
        "      throw new Error(`cannot decode ",
        message.typeName,
        " from JSON: invalid RFC 3339 string`);",
      );
      f.print("    }");
      f.print(
        `    const ms = Date.parse(matches[1] + "-" + matches[2] + "-" + matches[3] + "T" + matches[4] + ":" + matches[5] + ":" + matches[6] + (matches[8] ? matches[8] : "Z"));`,
      );
      f.print("    if (Number.isNaN(ms)) {");
      f.print(
        "      throw new Error(`cannot decode ",
        message.typeName,
        " from JSON: invalid RFC 3339 string`);",
      );
      f.print("    }");
      f.print(
        `    if (ms < Date.parse("0001-01-01T00:00:00Z") || ms > Date.parse("9999-12-31T23:59:59Z")) {`,
      );
      f.print(
        "      throw new Error(`cannot decode message ",
        message.typeName,
        " from JSON: must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive`);",
      );
      f.print("    }");
      f.print("    return {");
      if (ref.seconds.longType === LongType.STRING) {
        f.print(
          "      ",
          localName(ref.seconds),
          ": ",
          protoInt64,
          ".parse(ms / 1000).toString(),",
        );
      } else {
        f.print(
          "      ",
          localName(ref.seconds),
          ": ",
          protoInt64,
          ".parse(ms / 1000),",
        );
      }
      f.print(
        "      ",
        localName(ref.nanos),
        ": !matches[7] ? 0 : ",
        `(parseInt("1" + matches[7] + "0".repeat(9 - matches[7].length)) - 1000000000),`,
      );
      f.print("    }");
      f.print("  },");

      f.print("  toJson(msg: ", message, "): JsonValue {");
      f.print(
        "    const ms = Number(msg.",
        localName(ref.seconds),
        ") * 1000;",
      );
      f.print(
        `    if (ms < Date.parse("0001-01-01T00:00:00Z") || ms > Date.parse("9999-12-31T23:59:59Z")) {`,
      );
      f.print(
        "      throw new Error(`cannot encode ",
        message.typeName,
        " to JSON: must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive`);",
      );
      f.print("    }");
      f.print(
        "    if (msg.",
        localName(ref.nanos),
        " != null && msg.",
        localName(ref.nanos),
        " < 0) {",
      );
      f.print(
        "      throw new Error(`cannot encode ",
        message.typeName,
        " to JSON: nanos must not be negative`);",
      );
      f.print("    }");
      f.print(`    let z = "Z";`);
      f.print(
        "    if (msg.",
        localName(ref.nanos),
        " != null && msg.",
        localName(ref.nanos),
        " > 0) {",
      );
      f.print(
        "      const nanosStr = (msg.",
        localName(ref.nanos),
        " + 1000000000).toString().substring(1);",
      );
      f.print(`      if (nanosStr.substring(3) === "000000") {`);
      f.print(`        z = "." + nanosStr.substring(0, 3) + "Z";`);
      f.print(`      } else if (nanosStr.substring(6) === "000") {`);
      f.print(`        z = "." + nanosStr.substring(0, 6) + "Z";`);
      f.print("      } else {");
      f.print(`        z = "." + nanosStr + "Z";`);
      f.print("      }");
      f.print("    }");
      f.print(`    return new Date(ms).toISOString().replace(".000Z", z);`);
      f.print("  },");
      f.print("  toDate(msg: ", message, " | null | undefined): Date | null {");
      f.print(
        "    if (!msg?.",
        localName(ref.seconds),
        " && !msg?.",
        localName(ref.nanos),
        ") { return null; }",
      );
      f.print(
        "    return new Date(Number(msg.",
        localName(ref.seconds),
        " ?? 0) * 1000 + Math.ceil((msg.",
        localName(ref.nanos),
        " ?? 0) / 1000000));",
      );
      f.print("  },");
      f.print("  fromDate(value: Date | null | undefined): ", message, " {");
      f.print("    if (value == null) { return {}; }");
      f.print("    const ms = value.getTime();");
      f.print("    const seconds = Math.floor(ms / 1000);");
      f.print("    const nanos = (ms % 1000) * 1000000;");
      f.print(
        "    return { ",
        localName(ref.seconds),
        ": ",
        protoInt64,
        ".parse(seconds), ",
        localName(ref.nanos),
        ": nanos };",
      );
      f.print("  },");
      f.print("  equals(a: ", message, " | Date | undefined | null, b: ", message, " | Date | undefined | null): boolean {");
      f.print("    const aDate = a instanceof Date ? a : ", message, "_Wkt.toDate(", message, "_Wkt.fromDate(a));");
      f.print("    const bDate = b instanceof Date ? b : ", message, "_Wkt.toDate(", message, "_Wkt.fromDate(b));");
      f.print("    if (aDate === bDate) {");
      f.print("      return true;");
      f.print("    }");
      f.print("    if (aDate == null || bDate == null) {");
      f.print("      return aDate === bDate;");
      f.print("    }");
      f.print("    return +aDate === +bDate;");
      f.print("  },");
      break;
    case "google.protobuf.Duration":
      f.print(
        "  fromJson(json: ",
        JsonValue,
        " | null | undefined, _options?: Partial<",
        JsonReadOptions,
        ">): ",
        message,
        " {",
      );
      f.print(`    if (typeof json !== "string") {`);
      f.print(
        "      throw new Error(`cannot decode ",
        message.typeName,
        " from JSON: ${",
        jsonDebugValue,
        "(json)}`);",
      );
      f.print("    }");
      f.print(`    const match = json.match(/^(-?[0-9]+)(?:\\.([0-9]+))?s/);`);
      f.print("    if (match === null) {");
      f.print(
        "      throw new Error(`cannot decode ",
        message.typeName,
        " from JSON: ${",
        jsonDebugValue,
        "(json)}`);",
      );
      f.print("    }");
      f.print("    const longSeconds = Number(match[1]);");
      f.print(
        "    if (longSeconds > 315576000000 || longSeconds < -315576000000) {",
      );
      f.print(
        "      throw new Error(`cannot decode ",
        message.typeName,
        " from JSON: ${",
        jsonDebugValue,
        "(json)}`);",
      );
      f.print("    }");
      f.print("    const msg = {} as ", message, ";");
      if (ref.seconds.longType === LongType.STRING) {
        f.print(
          "    msg.",
          localName(ref.seconds),
          " = ",
          protoInt64,
          ".parse(longSeconds).toString();",
        );
      } else {
        f.print(
          "    msg.",
          localName(ref.seconds),
          " = ",
          protoInt64,
          ".parse(longSeconds);",
        );
      }
      f.print(`    if (typeof match[2] == "string") {`);
      f.print(
        `      const nanosStr = match[2] + "0".repeat(9 - match[2].length);`,
      );
      f.print("      msg.", localName(ref.nanos), " = parseInt(nanosStr);");
      f.print("      if (longSeconds < 0 || Object.is(longSeconds, -0)) {");
      f.print(
        "        msg.",
        localName(ref.nanos),
        " = -msg.",
        localName(ref.nanos),
        ";",
      );
      f.print("      }");
      f.print("    }");
      f.print("    return msg;");
      f.print("  },");
      f.print("  toJson(msg: ", message, "): JsonValue {");
      f.print(
        "    const secs = Number(msg.",
        localName(ref.seconds),
        " ?? 0);",
      );
      f.print("    const nanos = Number(msg.", localName(ref.nanos), " ?? 0);");
      f.print("    if (secs > 315576000000 || secs < -315576000000) {");
      f.print(
        "      throw new Error(`cannot encode ",
        message.typeName,
        " to JSON: value out of range`);",
      );
      f.print("    }");
      f.print("    let text = secs.toString();");
      f.print("    if (nanos !== 0) {");
      f.print("      let nanosStr = Math.abs(nanos).toString();");
      f.print(`      nanosStr = "0".repeat(9 - nanosStr.length) + nanosStr;`);
      f.print(`      if (nanosStr.substring(3) === "000000") {`);
      f.print("        nanosStr = nanosStr.substring(0, 3);");
      f.print(`      } else if (nanosStr.substring(6) === "000") {`);
      f.print("        nanosStr = nanosStr.substring(0, 6);");
      f.print(`      }`);
      f.print(`      text += "." + nanosStr;`);
      f.print("      if (nanos < 0 && secs === 0) {");
      f.print(`          text = "-" + text;`);
      f.print(`      }`);
      f.print("    }");
      f.print(`    return text + "s";`);
      f.print("  },");
      break;
    case "google.protobuf.Struct":
      f.print(
        "  toJson(msg: ",
        message,
        ", options?: Partial<",
        JsonWriteOptions,
        ">): ",
        JsonValue,
        " {",
      );
      f.print("    const json: ", JsonObject, " = {}");
      f.print("    if (!msg.", localName(ref.fields), ") { return json; }");
      f.print(
        "    for (const [k, v] of Object.entries(msg.",
        localName(ref.fields),
        ")) {",
      );
      f.print(
        "      json[k] = v != null ? ",
        (ref.fields.mapValue as DescFieldMapValueMessage).message,
        ".toJson(v, options) : null;",
      );
      f.print("    }");
      f.print("    return json;");
      f.print("  },");
      f.print(
        "  fromJson(json: ",
        JsonValue,
        " | null | undefined, _options?: Partial<",
        JsonReadOptions,
        ">): ",
        message,
        " {",
      );
      f.print(
        `    if (typeof json != "object" || json == null || Array.isArray(json)) {`,
      );
      f.print(
        "      throw new Error(`cannot decode ",
        message.typeName,
        " from JSON ${",
        jsonDebugValue,
        "(json)}`);",
      );
      f.print("    }");
      f.print("    const fields = {} as { [key: string]: Value };");
      f.print("    for (const [k, v] of Object.entries(json)) {");
      f.print(
        "      fields[k] = ",
        ref.fields.mapValue.message ?? "",
        ".fromJson(v);",
      );
      f.print("    }");
      f.print(
        "    return {",
        localName(ref.fields),
        ": fields} as ",
        message,
        ";",
      );
      f.print("  },");
      break;
    case "google.protobuf.Value":
      f.print(
        "  toJson(msg: ",
        message,
        ", options?: Partial<",
        JsonWriteOptions,
        ">): ",
        JsonValue,
        " {",
      );
      f.print("    switch (msg.", localName(ref.kind), "?.case) {");
      f.print(`      case "`, localName(ref.nullValue), `":`);
      f.print("        return null;");
      f.print(`      case "`, localName(ref.numberValue), `":`);
      f.print(
        `        if (!Number.isFinite(msg.`,
        localName(ref.kind),
        `.value)) {`,
      );
      f.print(
        `          throw new Error("google.protobuf.Value cannot be NaN or Infinity");`,
      );
      f.print(`        }`);
      f.print(`        return msg.`, localName(ref.kind), `.value;`);
      f.print(`      case "`, localName(ref.boolValue), `":`);
      f.print(`        return msg.`, localName(ref.kind), `.value;`);
      f.print(`      case "`, localName(ref.stringValue), `":`);
      f.print("        return msg.", localName(ref.kind), ".value;");
      f.print(`      case "`, localName(ref.structValue), `":`);
      f.print(
        `        return `,
        ref.structValue.message,
        `.toJson(msg.`,
        localName(ref.kind),
        `.value, {...options, emitDefaultValues: true});`,
      );
      f.print(`      case "`, localName(ref.listValue), `":`);
      f.print(
        `        return `,
        ref.listValue.message,
        `.toJson(msg.`,
        localName(ref.kind),
        `.value, {...options, emitDefaultValues: true});`,
      );
      f.print(`      case null:`);
      f.print(`      case undefined:`);
      f.print(`      default:`);
      f.print(`        return null;`);
      f.print("    }");
      f.print("  },");
      f.print(
        "  fromJson(json: ",
        JsonValue,
        " | null | undefined, _options?: Partial<",
        JsonReadOptions,
        ">): ",
        message,
        " {",
      );
      f.print("    const msg = {} as ", message, ";");
      f.print("    switch (typeof json) {");
      f.print(`      case "number":`);
      f.print(
        `        msg.kind = { case: "`,
        localName(ref.numberValue),
        `", value: json };`,
      );
      f.print("        break;");
      f.print(`      case "string":`);
      f.print(
        `        msg.kind = { case: "`,
        localName(ref.stringValue),
        `", value: json };`,
      );
      f.print("        break;");
      f.print(`      case "boolean":`);
      f.print(
        `        msg.kind = { case: "`,
        localName(ref.boolValue),
        `", value: json };`,
      );
      f.print("        break;");
      f.print(`      case "object":`);
      f.print("        if (json == null) {");
      f.print(
        `          msg.kind = { case: "`,
        localName(ref.nullValue),
        `", value: `,
        ref.nullValue.enum,
        `.`,
        localName(ref.nullValue.enum.values[0]),
        ` };`,
      );
      f.print("        } else if (Array.isArray(json)) {");
      f.print(
        `          msg.kind = { case: "`,
        localName(ref.listValue),
        `", value: `,
        ref.listValue.message,
        `.fromJson(json) };`,
      );
      f.print("        } else {");
      f.print(
        `          msg.kind = { case: "`,
        localName(ref.structValue),
        `", value: `,
        ref.structValue.message,
        `.fromJson(json) };`,
      );
      f.print("        }");
      f.print("        break;");
      f.print("      default:");
      f.print(
        "        throw new Error(`cannot decode ",
        message.typeName,
        " from JSON ${",
        jsonDebugValue,
        "(json)}`);",
      );
      f.print("    }");
      f.print("    return msg;");
      f.print("  },");
      break;
    case "google.protobuf.ListValue":
      f.print(
        `  toJson(msg: `,
        message,
        `, options?: Partial<`,
        JsonWriteOptions,
        `>): `,
        JsonValue,
        ` {`,
      );
      f.print(
        `    return msg.`,
        localName(ref.values),
        `?.map(v => `,
        ref.values.message,
        `.toJson(v, options)) ?? [];`,
      );
      f.print(`  },`);
      f.print(
        `  fromJson(json: `,
        JsonValue,
        ` | null | undefined, options?: Partial<`,
        JsonReadOptions,
        `>): `,
        message,
        ` {`,
      );
      f.print(`    if (json == null) { return {}; }`);
      f.print(`    if (!Array.isArray(json)) {`);
      f.print(
        "      throw new Error(`cannot decode ",
        message.typeName,
        " from JSON ${",
        jsonDebugValue,
        "(json)}`);",
      );
      f.print(`    }`);
      f.print(
        `    const values: `,
        ref.values.message,
        `[] = json.map(v => `,
        ref.values.message,
        `.fromJson(v, options));`,
      );
      f.print(
        `    return {`,
        localName(ref.values),
        `: values} as `,
        message,
        `;`,
      );
      f.print(`  },`);
      break;
    case "google.protobuf.DoubleValue":
    case "google.protobuf.FloatValue":
    case "google.protobuf.Int64Value":
    case "google.protobuf.UInt64Value":
    case "google.protobuf.Int32Value":
    case "google.protobuf.UInt32Value":
    case "google.protobuf.BoolValue":
    case "google.protobuf.StringValue":
    case "google.protobuf.BytesValue":
      f.print(
        "  toJson(msg: ",
        message,
        ", _options?: Partial<",
        JsonWriteOptions,
        ">): ",
        JsonValue,
        " {",
      );
      f.print(
        "    return ",
        jsonWriteScalar,
        "(",
        rtScalarType,
        ".",
        ScalarType[ref.value.scalar],
        ", msg.value)!;",
      );
      f.print("  },");
      f.print(
        "  fromJson(json: ",
        JsonValue,
        " | null | undefined, _options?: Partial<",
        JsonReadOptions,
        ">): ",
        message,
        " {",
      );
      f.print("    try {");
      f.print(
        "      return {",
        localName(ref.value),
        ": ",
        jsonReadScalar,
        "(",
        rtScalarType,
        ".",
        ScalarType[ref.value.scalar],
        ", json, ",
        rtLongType,
        ".",
        LongType[ref.value.longType],
        ")} as ",
        message,
        ";",
      );
      f.print("    } catch (e) {");
      f.print(
        "      let m = `cannot decode message ",
        message.typeName,
        ' from JSON"`;',
      );
      f.print("      if (e instanceof Error && e.message.length > 0) {");
      f.print("        m += `: ${e.message}`");
      f.print("      }");
      f.print("      throw new Error(m);");
      f.print("    }");
      f.print("  },");
      break;
  }
}

function generateWktFieldWrapper(
  f: GeneratedFile,
  message: DescMessage,
  ref: DescWkt,
) {
  switch (ref?.typeName) {
    case "google.protobuf.Timestamp": {
      f.print("  fieldWrapper: {");
      f.print(
        "    wrapField(value: ",
        message,
        " | Date | null | undefined): ",
        message,
        " {",
      );
      f.print(
        "      if (value == null || value instanceof Date) { return ",
        message,
        "_Wkt.fromDate(value); }",
      );
      f.print("      return ", message, ".createComplete(value);");
      f.print("    },");
      f.print("    unwrapField(msg: ", message, "): Date | null {");
      f.print("      return ", message, "_Wkt.toDate(msg);");
      f.print("    }");
      f.print("  } as const,");
      break;
    }
    case "google.protobuf.DoubleValue":
    case "google.protobuf.FloatValue":
    case "google.protobuf.Int64Value":
    case "google.protobuf.UInt64Value":
    case "google.protobuf.Int32Value":
    case "google.protobuf.UInt32Value":
    case "google.protobuf.BoolValue":
    case "google.protobuf.StringValue":
    case "google.protobuf.BytesValue": {
      const { typing } = getFieldTypeInfo(ref.value);
      f.print("  fieldWrapper: {");
      f.print(
        "    wrapField(value: ",
        typing,
        " | null | undefined): ",
        message,
        " {",
      );
      f.print(
        "      return ",
        message,
        ".createComplete({ value: value ?? undefined });",
      );
      f.print("    },");
      f.print(
        "    unwrapField(msg: ",
        message,
        "): ",
        typing,
        " | null | undefined {",
      );
      f.print("      return msg.", localName(ref.value), ";");
      f.print("    }");
      f.print("  } as const,");
      break;
    }
  }
}
