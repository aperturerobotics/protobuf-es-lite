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

import type { Schema } from "../protoplugin/ecmascript/index.js";
import type { DescMessage } from "../descriptor-set.js";
import { checkSupportedFile } from "./editions.js";
import { generateEnum } from "./enums.js";
import {
  collectMessages,
  generateMessage,
  topologicalSort,
} from "./message-rendering.js";

export function generateTs(schema: Schema) {
  for (const file of schema.files) {
    checkSupportedFile(file);
    const f = schema.generateFile(file.name + ".pb.ts");
    f.preamble(file);
    f.print(`export const protobufPackage = "${file.proto.package}";`);
    f.print();

    for (const enumeration of file.enums) {
      generateEnum(schema, f, enumeration);
    }

    const messageTypes: DescMessage[] = [];
    const dependencies = new Map<DescMessage, Set<DescMessage>>();

    for (const message of file.messages) {
      collectMessages(schema, file, message, messageTypes, dependencies, f);
    }

    // Topological sort to ensure consts are declared in the right order.
    const sortedMessageTypes = topologicalSort(messageTypes, dependencies);
    for (const message of sortedMessageTypes) {
      generateMessage(schema, f, message);
    }

    // We do not generate anything for services or extensions
  }
}
