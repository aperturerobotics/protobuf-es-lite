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
  Printable,
  Schema,
} from "../protoplugin/ecmascript/index.js";
import { reifyWkt } from "../protoplugin/ecmascript/index.js";
import { getFieldTypeInfo } from "../util.js";
import type {
  DescField,
  DescFile,
  DescMessage,
  DescOneof,
} from "../descriptor-set.js";
import { localName } from "../names.js";
import {
  Edition,
  FeatureSet_RepeatedFieldEncoding,
} from "../google/protobuf/descriptor.pb.js";
import { generateEnum } from "./enums.js";
import { generateFieldInfo } from "./field-info-rendering.js";
import {
  generateWktFieldWrapper,
  generateWktMethods,
} from "./wkt-overrides.js";

export function collectMessages(
  schema: Schema,
  file: DescFile,
  message: DescMessage,
  messageTypes: DescMessage[],
  dependencies: Map<DescMessage, Set<DescMessage>>,
  f: GeneratedFile,
) {
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
    collectMessages(schema, file, nestedMessage, messageTypes, dependencies, f);
  }
}

// topologicalSort sorts the list of messages by dependency order.
export function topologicalSort(
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

export function generateMessage(
  schema: Schema,
  f: GeneratedFile,
  message: DescMessage,
) {
  const {
    MessageType: rtMessageType,
    createEmptyMessageType,
    createMessageType,
    PartialFieldInfo,
  } = schema.runtime;

  f.print(f.jsDoc(message));
  f.print(f.exportDecl("interface", message), " {");
  for (const field of message.fields) {
    generateField(f, field);
  }

  for (const oneof of message.oneofs) {
    generateOneof(f, oneof);
  }

  f.print();
  f.print("};");
  f.print();

  // If we need to extend the message type, do that here.
  const reWkt = reifyWkt(message);
  if (reWkt != null) {
    f.print("const ", message, "_Wkt = {");
    generateWktMethods(schema, f, message, reWkt);
    f.print("};");
    f.print();

    f.print(
      f.exportDecl("const", message),
      `: `,
      rtMessageType,
      `<`,
      message,
      `> & typeof `,
      message,
      `_Wkt = `,
      "/* @__PURE__ */ ",
      createMessageType,
      "<",
      message,
      ", typeof ",
      message,
      "_Wkt>({",
    );
  } else {
    if (message.fields.length === 0) {
      f.print(
        f.exportDecl("const", message),
        `: `,
        rtMessageType,
        `<`,
        message,
        `> = `,
        "/* @__PURE__ */ ",
        createEmptyMessageType,
        "<",
        message,
        ">(",
        f.string(message.typeName),
        ", ",
        packedByDefault(message),
        ");",
      );
      f.print();
      return;
    }

    f.print(
      f.exportDecl("const", message),
      `: `,
      rtMessageType,
      `<`,
      message,
      `> = `,
      "/* @__PURE__ */ ",
      createMessageType,
      "({",
    );
  }

  f.print("    typeName: ", f.string(message.typeName), ",");
  f.print("    fields: [");
  for (const field of message.fields) {
    generateFieldInfo(f, schema, field);
  }
  f.print("    ] satisfies readonly ", PartialFieldInfo, "[],");
  f.print("    packedByDefault: ", packedByDefault(message), ",");
  if (reWkt == null) {
    f.print("});");
  } else {
    generateWktFieldWrapper(f, message, reWkt);
    f.print("}, ", message, "_Wkt);");
  }
  f.print();
}

function packedByDefault(message: DescMessage): boolean {
  switch (message.file.edition) {
    case Edition.EDITION_PROTO2:
      return false;
    case Edition.EDITION_PROTO3:
      return true;
    default:
      return (
        message.getFeatures().repeatedFieldEncoding ==
        FeatureSet_RepeatedFieldEncoding.PACKED
      );
  }
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
  const oneOfCases: Printable[] = oneof.fields
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
