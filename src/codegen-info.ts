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
import { getUnwrappedFieldType } from "./field-wrapper.js";
import { scalarZeroValue } from "./scalar.js";

type RuntimeSymbolInfo = {
  typeOnly: boolean;
  publicImportPath: string;
  privateImportPath: string;
};

export const packageName = "@aptre/protobuf-es-lite";

const symbolInfo = (
  typeOnly: boolean,
  privateImportPath: string,
): RuntimeSymbolInfo => ({
  typeOnly,
  privateImportPath,
  publicImportPath: packageName,
});

const symbols = {
  Message: symbolInfo(false, "./message.js"),
  FieldList: symbolInfo(true, "./field-list.js"),
  PartialFieldInfo: symbolInfo(true, "./field.js"),
  MessageType: symbolInfo(true, "./message-type.js"),
  Extension: symbolInfo(true, "./extension.js"),
  BinaryReadOptions: symbolInfo(true, "./binary-format.js"),
  BinaryWriteOptions: symbolInfo(true, "./binary-format.js"),
  JsonReadOptions: symbolInfo(true, "./json-format.js"),
  JsonWriteOptions: symbolInfo(true, "./json-format.js"),
  JsonValue: symbolInfo(true, "./json-format.js"),
  JsonObject: symbolInfo(true, "./json-format.js"),
  protoDouble: symbolInfo(false, "./proto-double.js"),
  protoInt64: symbolInfo(false, "./proto-int64.js"),
  ScalarType: symbolInfo(false, "./scalar.js"),
  LongType: symbolInfo(false, "./scalar.js"),
  MethodKind: symbolInfo(false, "./service-type.js"),
  MethodIdempotency: symbolInfo(false, "./service-type.js"),
  createEnumType: symbolInfo(false, "./enum.js"),
  createMessageType: symbolInfo(false, "./message.js"),
} as const;

// prettier-ignore
export const codegenInfo = {
  packageName,
  localName,
  getUnwrappedFieldType,
  scalarZeroValue,
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
