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
import type { DescEnum } from "../descriptor-set.js";
import { localName } from "../names.js";

export function generateEnum(
  schema: Schema,
  f: GeneratedFile,
  enumeration: DescEnum,
) {
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
  f.print(
    f.exportDecl("const", enumeration),
    "_Enum",
    " = ",
    "/* @__PURE__ */ ",
    schema.runtime.createEnumType,
    "(",
    f.string(enumeration.typeName),
    ", [",
  );
  for (const value of enumeration.values) {
    f.print("  { no: ", value.number, ', name: "', value.name, '" },');
  }
  f.print("]);");
  f.print();
}
