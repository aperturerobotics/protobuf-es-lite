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
import { createImportSymbol } from "../protoplugin/ecmascript/index.js";
import { getFieldDefaultValueExpression } from "../util.js";
import type {
  DescEnum,
  DescExtension,
  DescField,
  DescFile,
  DescMessage,
} from "../descriptor-set.js";
import { localName } from "../names.js";
import { LongType, ScalarType } from "../scalar.js";
import {
  FeatureSet_FieldPresence,
  FeatureSet_MessageEncoding,
  FeatureSet_Utf8Validation,
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
} from "../google/protobuf/descriptor.pb.js";

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
  let name = localName(desc);
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
      if (field.scalar == ScalarType.STRING && requiresUtf8Validation(field)) {
        e.push(`utf8: true, `);
      }
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
      if (field.mapKeyUtf8) {
        e.push(`keyUtf8: true, `);
      }
      switch (field.mapValue.kind) {
        case "scalar":
          e.push(
            `V: {kind: "scalar", T: `,
            rtScalarType,
            `.`,
            ScalarType[field.mapValue.scalar],
          );
          if (
            field.mapValue.scalar == ScalarType.STRING &&
            field.mapValue.utf8
          ) {
            e.push(`, utf8: true`);
          }
          e.push(`}, `);
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
      if (
        field.proto.type === FieldDescriptorProto_Type.GROUP ||
        field.getFeatures().messageEncoding ==
          FeatureSet_MessageEncoding.DELIMITED
      ) {
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
  if (field.explicitPresence) {
    e.push(`opt: true, `);
  }
  if (!field.explicitPresence && isRequiredField(field)) {
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

function requiresUtf8Validation(field: DescField | DescExtension): boolean {
  return (
    fieldFile(field).syntax === "editions" &&
    field.getFeatures().utf8Validation == FeatureSet_Utf8Validation.VERIFY
  );
}

function isRequiredField(field: DescField | DescExtension): boolean {
  return (
    field.proto.label === FieldDescriptorProto_Label.REQUIRED ||
    field.getFeatures().fieldPresence ==
      FeatureSet_FieldPresence.LEGACY_REQUIRED
  );
}

function fieldFile(field: DescField | DescExtension): DescFile {
  return field.kind === "extension" ? field.file : field.parent.file;
}
