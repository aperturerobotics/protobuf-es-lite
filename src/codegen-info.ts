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

import { localName, safeIdentifier, safeObjectProperty } from "./names.js";
import type {
  DescExtension,
  DescField,
  DescMessage,
} from "./descriptor-set.js";
import { ScalarType } from "./scalar.js";

type RuntimeSymbolInfo = {
  typeOnly: boolean;
  publicImportPath: string;
  privateImportPath: string;
};

export const packageName = "@aptre/protobuf-es-lite";

const runtimePath = (owner: string): string => `${packageName}/${owner}`;

// sym describes a runtime symbol exported by module owner.
const sym = (typeOnly: boolean, owner: string): RuntimeSymbolInfo => ({
  typeOnly,
  publicImportPath: runtimePath(owner),
  privateImportPath: `./${owner}.js`,
});

const symbols = {
  Message: sym(true, "message"),
  MessageType: sym(true, "message"),
  createMessageType: sym(false, "message"),
  newMap: sym(false, "message"),
  createEnumType: sym(false, "enum"),
  BinaryReader: sym(true, "binary-encoding"),
  IMessageTypeRegistry: sym(true, "type-registry"),
  JsonReadOptions: sym(true, "json"),
  JsonWriteOptions: sym(true, "json"),
  JsonValue: sym(true, "json"),
  JsonObject: sym(true, "json"),
  jsonEntries: sym(false, "json"),
  jsonList: sym(false, "json"),
  jsonDouble: sym(false, "json"),
  jsonLong: sym(false, "json"),
  jsonBytes: sym(false, "json"),
  readStr: sym(false, "json"),
  readBool: sym(false, "json"),
  readInt32: sym(false, "json"),
  readUint32: sym(false, "json"),
  readDouble: sym(false, "json"),
  readFloat: sym(false, "json"),
  readInt64: sym(false, "json"),
  readUint64: sym(false, "json"),
  readBytes: sym(false, "json"),
  anyMethods: sym(false, "wkt"),
  anyWriteJson: sym(false, "wkt"),
  anyReadJson: sym(false, "wkt"),
  timestampMethods: sym(false, "wkt"),
  timestampWriteJson: sym(false, "wkt"),
  timestampReadJson: sym(false, "wkt"),
  durationWriteJson: sym(false, "wkt"),
  durationReadJson: sym(false, "wkt"),
  protoInt64: sym(false, "proto-int64"),
  protoDouble: sym(false, "proto-double"),
  ScalarType: sym(false, "scalar"),
  LongType: sym(false, "scalar"),
  MethodKind: sym(false, "service-type"),
  MethodIdempotency: sym(false, "service-type"),
} as const;

/**
 * getUnwrappedFieldType returns the type a message field holds in place of
 * its message: a Date for a Timestamp, and the wrapped scalar for a singular
 * wrapper field outside a oneof.
 */
function getUnwrappedFieldType(
  field: DescField | DescExtension,
): ScalarType | undefined {
  if (field.fieldKind !== "message") {
    return undefined;
  }
  if (field.message.typeName !== "google.protobuf.Timestamp") {
    if (field.repeated || field.oneof != null) {
      return undefined;
    }
  }
  return getUnwrappedMessageType(field.message);
}

/**
 * getUnwrappedMessageType returns the type a map value of msg holds in place
 * of the message: a Date for a Timestamp and the scalar of a wrapper.
 */
function getUnwrappedMessageType(msg: DescMessage): ScalarType | undefined {
  return wrappedScalars[msg.typeName];
}

const wrappedScalars: Record<string, ScalarType> = {
  "google.protobuf.Timestamp": ScalarType.DATE,
  "google.protobuf.DoubleValue": ScalarType.DOUBLE,
  "google.protobuf.FloatValue": ScalarType.FLOAT,
  "google.protobuf.Int64Value": ScalarType.INT64,
  "google.protobuf.UInt64Value": ScalarType.UINT64,
  "google.protobuf.Int32Value": ScalarType.INT32,
  "google.protobuf.UInt32Value": ScalarType.UINT32,
  "google.protobuf.BoolValue": ScalarType.BOOL,
  "google.protobuf.StringValue": ScalarType.STRING,
  "google.protobuf.BytesValue": ScalarType.BYTES,
};

// prettier-ignore
export const codegenInfo = {
  packageName,
  localName,
  getUnwrappedFieldType,
  getUnwrappedMessageType,
  safeIdentifier,
  safeObjectProperty,
  symbols,
  wktSourceFiles: [
    "google/protobuf/compiler/plugin.proto",
    "google/protobuf/any.proto",
    "google/protobuf/api.proto",
    "google/protobuf/descriptor.proto",
    "google/protobuf/duration.proto",
    "google/protobuf/empty.proto",
    "google/protobuf/field_mask.proto",
    "google/protobuf/source_context.proto",
    "google/protobuf/struct.proto",
    "google/protobuf/timestamp.proto",
    "google/protobuf/type.proto",
    "google/protobuf/wrappers.proto",
  ] as ReadonlyArray<string>,
} as const;

export type RuntimeSymbolName = keyof typeof codegenInfo.symbols;

export type CodegenInfo = typeof codegenInfo;
