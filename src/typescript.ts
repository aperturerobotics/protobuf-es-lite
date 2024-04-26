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
  DescEnum,
  DescExtension,
  DescField,
  DescMessage,
} from "@bufbuild/protobuf";
import {
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  LongType,
  ScalarType,
} from "@bufbuild/protobuf";
import type {
  GeneratedFile,
  Printable,
  Schema,
} from "@bufbuild/protoplugin/ecmascript";
import {
  createImportSymbol,
  localName,
} from "@bufbuild/protoplugin/ecmascript";
import { getNonEditionRuntime } from "./editions.js";
import { getFieldDefaultValueExpression, getFieldTypeInfo } from "./util.js";

const libPkg = "@aptre/protobuf-es-lite";
const MessageImport = createImportSymbol("Message", libPkg);
const MessageTypeImport = createImportSymbol("MessageType", libPkg);
const CreateMessageTypeImport = createImportSymbol("createMessageType", libPkg);
const PartialFieldInfo = createImportSymbol("PartialFieldInfo", libPkg);

export function generateTs(schema: Schema) {
  for (const file of schema.files) {
    const f = schema.generateFile(file.name + "_pb.ts");
    f.preamble(file);
    f.print(`export const protobufPackage = "${file.proto.package}";`);
    f.print();

    for (const enumeration of file.enums) {
      generateEnum(f, enumeration);
    }

    const messageTypes: DescMessage[] = [];
    const dependencies = new Map<DescMessage, Set<DescMessage>>();
    function collectMessages(message: DescMessage) {
      if (message.file === file) {
        messageTypes.push(message);
        const deps = new Set<DescMessage>();
        for (const field of message.fields) {
          if (field.fieldKind === "message" && field.message.file === file) {
            deps.add(field.message);
          }
        }
        dependencies.set(message, deps);
        for (const nestedMessage of message.nestedMessages) {
          collectMessages(nestedMessage);
        }
      }
    }

    for (const message of file.messages) {
      collectMessages(message);
    }

    // Topological sort toensure consts are declared in the right order.
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

// prettier-ignore
function generateEnum(f: GeneratedFile, enumeration: DescEnum) {
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
  f.print("// ", enumeration, "_Name maps the enum names to the values.");
  f.print(f.exportDecl("const", enumeration.name+"_Name"), " = {");
  for (const value of enumeration.values) {
    f.print("  ", localName(value), ": ", enumeration, ".", localName(value), ",");
  }
  f.print("};");
  f.print();
}

// prettier-ignore
function generateMessage(schema: Schema, f: GeneratedFile, message: DescMessage) {
  // check if we support this runtime
  getNonEditionRuntime(schema, message.file);

  f.print(f.jsDoc(message));
  f.print(f.exportDecl("interface", message), " extends ", MessageImport, "<", message, "> {");
  for (const member of message.members) {
    switch (member.kind) {
      case "field":
        generateField(f, member);
        break;
    }
    f.print();
  }
  f.print("}");
  f.print();
  f.print(f.exportDecl("const", message), ": ", MessageTypeImport, "<", message, "> = ", CreateMessageTypeImport, "(");
  f.print("  {");
  f.print("    typeName: ", f.string(message.typeName), ",");
  f.print("    fields: [");
  for (const field of message.fields) {
    generateFieldInfo(f, field);
  }
  f.print("    ] as readonly ", PartialFieldInfo, "[],");
  f.print("    packedByDefault: ", message.file.proto.syntax === "proto3", ",");
  f.print("  },");
  f.print(");");
  f.print();
  for (const nestedEnum of message.nestedEnums) {
    generateEnum(f, nestedEnum);
  }
  for (const nestedMessage of message.nestedMessages) {
    generateMessage(schema, f, nestedMessage);
  }
}

// prettier-ignore
function generateField(f: GeneratedFile, field: DescField) {
  f.print(f.jsDoc(field, "  "));
  const { typing } = getFieldTypeInfo(field);
  f.print("  ", localName(field), ": ", typing, ";");
}

// prettier-ignore
export function generateFieldInfo(f: GeneratedFile, field: DescField | DescExtension) {
  f.print("        ", getFieldInfoLiteral( field), ",");
}

// prettier-ignore
export function getFieldInfoLiteral(field: DescField | DescExtension): Printable {
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
      e.push(`kind: "scalar", T: `, field.scalar, ` /* ScalarType.`, ScalarType[field.scalar], ` */, `);
      if (field.longType != LongType.BIGINT) {
        e.push(`L: `, field.longType, ` /* LongType.`, LongType[field.longType], ` */, `);
      }
      break;
    case "map":
      e.push(`kind: "map", K: `, field.mapKey, ` /* ScalarType.`, ScalarType[field.mapKey], ` */, `);
      switch (field.mapValue.kind) {
        case "scalar":
          e.push(`V: {kind: "scalar", T: `, field.mapValue.scalar, ` /* ScalarType.`, ScalarType[field.mapValue.scalar], ` */}, `);
          break;
        case "message":
          e.push(`V: {kind: "message", T: `, field.mapValue.message, `}, `);
          break;
        case "enum":
          e.push(`V: {kind: "enum", T: `, field.mapValue.enum, `}, `);
          break;
      }
      break;
    case "message":
      e.push(`kind: "message", T: `, field.message, `, `);
      if (field.proto.type === FieldDescriptorProto_Type.GROUP) {
        e.push(`delimited: true, `);
      }
      break;
    case "enum":
      e.push(`kind: "enum", T: `, field.enum, `, `);
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
