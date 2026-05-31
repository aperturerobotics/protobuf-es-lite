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
import {
  getUnwrappedFieldType,
  getUnwrappedMessageType,
} from "./field-wrapper.js";
import { scalarZeroValue } from "./scalar.js";

type RuntimeSymbolInfo = {
  typeOnly: boolean;
  publicImportPath: string;
  privateImportPath: string;
};

export const packageName = "@aptre/protobuf-es-lite";

const symbolInfo = (
  typeOnly: boolean,
  publicImportPath: string,
  privateImportPath: string,
): RuntimeSymbolInfo => ({
  typeOnly,
  publicImportPath,
  privateImportPath,
});

const runtimePath = (owner: string): string => `${packageName}/${owner}`;

const symbols = {
  Message: symbolInfo(true, runtimePath("message"), "./message.js"),
  FieldList: symbolInfo(true, runtimePath("field"), "./field.js"),
  PartialFieldInfo: symbolInfo(true, runtimePath("field"), "./field.js"),
  MessageType: symbolInfo(true, runtimePath("message"), "./message.js"),
  Extension: symbolInfo(true, packageName, "./extension.js"),
  IMessageTypeRegistry: symbolInfo(
    true,
    runtimePath("type-registry"),
    "./type-registry.js",
  ),
  BinaryReadOptions: symbolInfo(true, runtimePath("binary"), "./binary.js"),
  BinaryWriteOptions: symbolInfo(true, runtimePath("binary"), "./binary.js"),
  JsonReadOptions: symbolInfo(true, runtimePath("json"), "./json.js"),
  JsonWriteOptions: symbolInfo(true, runtimePath("json"), "./json.js"),
  JsonValue: symbolInfo(true, runtimePath("json"), "./json.js"),
  JsonObject: symbolInfo(true, runtimePath("json"), "./json.js"),
  jsonReadEnum: symbolInfo(false, runtimePath("json"), "./json.js"),
  jsonReadScalar: symbolInfo(false, runtimePath("json"), "./json.js"),
  jsonWriteEnum: symbolInfo(false, runtimePath("json"), "./json.js"),
  jsonWriteScalar: symbolInfo(false, runtimePath("json"), "./json.js"),
  jsonDebugValue: symbolInfo(false, runtimePath("json"), "./json.js"),
  protoDouble: symbolInfo(
    false,
    runtimePath("proto-double"),
    "./proto-double.js",
  ),
  protoInt64: symbolInfo(false, runtimePath("proto-int64"), "./proto-int64.js"),
  applyPartialMessage: symbolInfo(
    false,
    runtimePath("partial"),
    "./partial.js",
  ),
  ScalarType: symbolInfo(false, runtimePath("scalar"), "./scalar.js"),
  LongType: symbolInfo(false, runtimePath("scalar"), "./scalar.js"),
  ScalarValue: symbolInfo(true, runtimePath("scalar"), "./scalar.js"),
  MethodKind: symbolInfo(
    false,
    runtimePath("service-type"),
    "./service-type.js",
  ),
  MethodIdempotency: symbolInfo(
    false,
    runtimePath("service-type"),
    "./service-type.js",
  ),
  createEnumType: symbolInfo(false, runtimePath("enum"), "./enum.js"),
  createMessageType: symbolInfo(false, runtimePath("message"), "./message.js"),
} as const;

// prettier-ignore
export const codegenInfo = {
  packageName,
  localName,
  getUnwrappedFieldType,
  getUnwrappedMessageType,
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
