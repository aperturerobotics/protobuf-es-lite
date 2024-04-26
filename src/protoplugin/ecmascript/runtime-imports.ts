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

import type { ImportSymbol } from "./import-symbol.js";
import { createImportSymbol } from "./import-symbol.js";
import type { RuntimeSymbolName } from "../../codegen-info.js";
import { codegenInfo } from "../../codegen-info.js";

export type RuntimeImports = {
  [K in RuntimeSymbolName]: ImportSymbol;
};

export function createRuntimeImports(bootstrapWkt: boolean): RuntimeImports {
  const imports: RuntimeImports = {} as RuntimeImports;
  for (const [name, info] of Object.entries(codegenInfo.symbols)) {
    const symbol = createImportSymbol(
      name,
      bootstrapWkt ? info.privateImportPath : info.publicImportPath,
    );
    imports[name as RuntimeSymbolName] =
      info.typeOnly ? symbol.toTypeOnly() : symbol;
  }
  return imports;
}
