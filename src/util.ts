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

import type { Printable } from "./protoplugin/ecmascript/index.js";
import type {
  DescExtension,
  DescField,
  DescMessage,
} from "./descriptor-set.js";
import { codegenInfo } from "./codegen-info.js";
import { LongType, ScalarType } from "./scalar.js";
import type { RefDescMessage } from "./protoplugin/ecmascript/opaque-printables.js";

// unixMilliToDate converts the unix milliseconds bigint into a Date.
// Throws an error if the bigint is outside the safe range of Number values.
export function unixMilliToDate(unixMilliseconds: bigint): Date {
  if (
    unixMilliseconds < -8640000000000000n ||
    unixMilliseconds > 8640000000000000n
  ) {
    throw new Error(
      "Timestamp is outside the range that can be safely represented by a JavaScript Date",
    );
  }
  return new Date(Number(unixMilliseconds));
}

export function getFieldTypeInfo(field: DescField | DescExtension): {
  typing: Printable;
  optional: boolean;
  typingInferrableFromZeroValue: boolean;
} {
  const typing: Printable = [];
  let typingInferrableFromZeroValue: boolean;
  let optional = false;
  switch (field.fieldKind) {
    case "scalar":
      typing.push(scalarTypeScriptType(field.scalar, field.longType));
      optional = field.explicitPresence || field.proto.label === 2; // FieldDescriptorProto_Label.REQUIRED; avoid descriptor.pb.js import
      typingInferrableFromZeroValue = true;
      break;
    case "message": {
      typing.push(getUnwrappedFieldScriptType(field));
      optional = true;
      typingInferrableFromZeroValue = true;
      break;
    }
    case "enum":
      typing.push({
        kind: "es_ref_enum",
        type: field.enum,
        typeOnly: true,
      });
      optional = field.explicitPresence || field.proto.label === 2; // FieldDescriptorProto_Label.REQUIRED; avoid descriptor.pb.js import
      typingInferrableFromZeroValue = true;
      break;
    case "map": {
      let keyType: string;
      switch (field.mapKey) {
        case ScalarType.INT32:
        case ScalarType.FIXED32:
        case ScalarType.UINT32:
        case ScalarType.SFIXED32:
        case ScalarType.SINT32:
          keyType = "number";
          break;
        default:
          keyType = "string";
          break;
      }
      let valueType: Printable;
      switch (field.mapValue.kind) {
        case "scalar":
          valueType = scalarTypeScriptType(
            field.mapValue.scalar,
            LongType.BIGINT,
          );
          break;
        case "message":
          valueType = getUnwrappedMessageScriptType(field.mapValue.message);
          break;
        case "enum":
          valueType = {
            kind: "es_ref_enum",
            type: field.mapValue.enum,
            typeOnly: true,
          };
          break;
      }
      typing.push("{ [key: ", keyType, "]: ", valueType, " }");
      typingInferrableFromZeroValue = false;
      optional = false;
      break;
    }
  }
  if (field.repeated) {
    typing.push("[]");
    optional = false;
    typingInferrableFromZeroValue = false;
  }
  return { typing, optional, typingInferrableFromZeroValue };
}

function scalarTypeScriptType(type: ScalarType, longType: LongType): Printable {
  switch (type) {
    case ScalarType.STRING:
      return "string";
    case ScalarType.BOOL:
      return "boolean";
    case ScalarType.UINT64:
    case ScalarType.SFIXED64:
    case ScalarType.FIXED64:
    case ScalarType.SINT64:
    case ScalarType.INT64:
      if (longType === LongType.STRING) {
        return "string";
      }
      return "bigint";
    case ScalarType.BYTES:
      return "Uint8Array";
    case ScalarType.DATE:
      return "Date";
    default:
      return "number";
  }
}

function getUnwrappedFieldScriptType(
  field: DescField | DescExtension,
  longType?: LongType,
): Printable {
  const baseType = codegenInfo.getUnwrappedFieldType(field);
  return baseType ?
      scalarTypeScriptType(
        baseType,
        longType ?? field.longType ?? LongType.BIGINT,
      )
    : ({
        kind: "es_ref_message",
        type: field.message,
        typeOnly: true,
      } as RefDescMessage);
}

function getUnwrappedMessageScriptType(
  msg: DescMessage,
  longType: LongType = LongType.BIGINT,
): Printable {
  const baseType = codegenInfo.getUnwrappedMessageType(msg);
  return baseType !== undefined ?
      scalarTypeScriptType(baseType, longType)
    : ({
        kind: "es_ref_message",
        type: msg,
        typeOnly: true,
      } as RefDescMessage);
}
