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
  DescField,
  DescFile,
  DescMessage,
} from "../descriptor-set.js";
import {
  FeatureSet_EnumType,
  FeatureSet_JsonFormat,
} from "../google/protobuf/descriptor.pb.js";

export function checkSupportedFile(file: DescFile) {
  if (file.syntax !== "editions") {
    return;
  }
  checkJsonFormat(file, file.getFeatures().jsonFormat);
  for (const enumeration of file.enums) {
    checkSupportedEnum(enumeration);
  }
  for (const message of file.messages) {
    checkSupportedMessage(message);
  }
}

function checkSupportedMessage(message: DescMessage) {
  checkJsonFormat(message, message.getFeatures().jsonFormat);
  for (const enumeration of message.nestedEnums) {
    checkSupportedEnum(enumeration);
  }
  for (const field of message.fields) {
    checkJsonFormat(field, field.getFeatures().jsonFormat);
    if (field.fieldKind === "enum") {
      checkSupportedEnum(field.enum);
    }
    if (field.fieldKind === "map" && field.mapValue.kind === "enum") {
      checkSupportedEnum(field.mapValue.enum);
    }
  }
  for (const child of message.nestedMessages) {
    checkSupportedMessage(child);
  }
}

function checkSupportedEnum(enumeration: DescEnum) {
  checkJsonFormat(enumeration, enumeration.getFeatures().jsonFormat);
  if (enumeration.getFeatures().enumType == FeatureSet_EnumType.CLOSED) {
    throw new Error(`${enumeration}: closed enums are not supported`);
  }
}

function checkJsonFormat(
  desc: DescFile | DescMessage | DescEnum | DescField,
  value: FeatureSet_JsonFormat,
) {
  if (value == FeatureSet_JsonFormat.LEGACY_BEST_EFFORT) {
    throw new Error(
      `${desc}: json_format = LEGACY_BEST_EFFORT is not supported`,
    );
  }
}
