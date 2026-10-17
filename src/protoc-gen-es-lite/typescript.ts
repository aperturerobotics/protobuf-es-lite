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

import type { GeneratedFile, Schema } from "../protoplugin/ecmascript/index.js";
import type { DescEnum, DescMessage } from "../descriptor-set.js";
import { checkSupportedFile } from "./editions.js";
import { generateEnum } from "./enums.js";
import type { GenerateOptions } from "./message-rendering.js";
import { generateMessage } from "./message-rendering.js";

export function generateTs(schema: Schema, opts: GenerateOptions) {
  for (const file of schema.files) {
    checkSupportedFile(file);
    const f = schema.generateFile(file.name + ".pb.ts");
    f.preamble(file);
    f.print();
    generateTypes(schema, f, opts, file.enums, file.messages);
    // We do not generate anything for services or extensions
  }
}

// generateTypes emits enums and messages in declaration order, each message
// followed by its nested types. Field descriptions reference other message
// types only inside functions, so no order is needed between them.
function generateTypes(
  schema: Schema,
  f: GeneratedFile,
  opts: GenerateOptions,
  enums: DescEnum[],
  messages: DescMessage[],
) {
  for (const enumeration of enums) {
    generateEnum(schema, f, enumeration);
  }
  for (const message of messages) {
    generateMessage(schema, f, message, opts);
    generateTypes(schema, f, opts, message.nestedEnums, message.nestedMessages);
  }
}
