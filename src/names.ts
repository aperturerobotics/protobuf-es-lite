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
  DescEnumValue,
  DescExtension,
  DescField,
  DescMessage,
  DescService,
} from "./descriptor-set.js";
import type { DescMethod, DescOneof } from "./descriptor-set.js";

/**
 * Returns the name of a protobuf element in generated code.
 *
 * Field names - including oneofs - are converted to lowerCamelCase. For
 * messages, enumerations and services, the package name is stripped from
 * the type name. For nested messages and enumerations, the names are joined
 * with an underscore. For methods, the first character is made lowercase.
 */
export function localName(
  desc:
    | DescEnum
    | DescEnumValue
    | DescMessage
    | DescExtension
    | DescOneof
    | DescField
    | DescService
    | DescMethod,
): string {
  switch (desc.kind) {
    case "field":
      return localFieldName(desc.name, desc.oneof !== undefined);
    case "oneof":
      return localOneofName(desc.name);
    case "enum":
    case "message":
    case "service":
    case "extension": {
      const pkg = desc.file.proto.package;
      const offset = pkg === undefined ? 0 : pkg.length + 1;
      const name = desc.typeName.substring(offset).replace(/\./g, "_");
      return safeIdentifier(name);
    }
    case "enum_value": {
      let name = desc.name;
      const sharedPrefix = desc.parent.sharedPrefix;
      if (sharedPrefix !== undefined) {
        name = name.substring(sharedPrefix.length);
      }
      return safeObjectProperty(name);
    }
    case "rpc": {
      let name = desc.name;
      if (name.length == 0) {
        return name;
      }
      name = name[0].toLowerCase() + name.substring(1);
      return safeObjectProperty(name);
    }
  }
}

/**
 * Returns the name of a field in generated code.
 */
export function localFieldName(protoName: string, inOneof: boolean) {
  const name = protoCamelCase(protoName);
  if (inOneof) {
    // oneof member names are not properties, but values of the `case` property.
    return name;
  }
  return safeObjectProperty(safeMessageProperty(name));
}

/**
 * Returns the name of a oneof group in generated code.
 */
export function localOneofName(protoName: string): string {
  return localFieldName(protoName, false);
}

/**
 * Finds a prefix shared by enum values, for example `MY_ENUM_` for
 * `enum MyEnum {MY_ENUM_A=0; MY_ENUM_B=1;}`.
 */
export function findEnumSharedPrefix(
  enumName: string,
  valueNames: string[],
): string | undefined {
  const prefix = camelToSnakeCase(enumName) + "_";
  for (const name of valueNames) {
    if (!name.toLowerCase().startsWith(prefix)) {
      return undefined;
    }
    const shortName = name.substring(prefix.length);
    if (shortName.length == 0) {
      return undefined;
    }
    if (/^\d/.test(shortName)) {
      // identifiers must not start with numbers
      return undefined;
    }
  }
  return prefix;
}

/**
 * Converts lowerCamelCase or UpperCamelCase into lower_snake_case.
 * This is used to find shared prefixes in an enum.
 */
export function camelToSnakeCase(camel: string): string {
  return (
    camel.substring(0, 1) + camel.substring(1).replace(/[A-Z]/g, (c) => "_" + c)
  ).toLowerCase();
}

/**
 * Converts snake_case to protoCamelCase according to the convention
 * used by protoc to convert a field name to a JSON name.
 */
export function protoCamelCase(snakeCase: string): string {
  let capNext = false;
  const b: string[] = [];
  for (let i = 0; i < snakeCase.length; i++) {
    let c = snakeCase.charAt(i);
    switch (c) {
      case "_":
        capNext = true;
        break;
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        b.push(c);
        capNext = false;
        break;
      default:
        if (capNext) {
          capNext = false;
          c = c.toUpperCase();
        }
        b.push(c);
        break;
    }
  }
  return b.join("");
}

/**
 * Names that cannot be used for identifiers, such as class names,
 * but _can_ be used for object properties.
 */
const reservedIdentifiers = new Set([
  // ECMAScript 2015 keywords
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",

  // ECMAScript 2015 future reserved keywords
  "enum",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",

  // Class name cannot be 'Object' when targeting ES5 with module CommonJS
  "Object",

  // TypeScript keywords that cannot be used for types (as opposed to variables)
  "bigint",
  "number",
  "boolean",
  "string",
  "object",

  // Identifiers reserved for the runtime, so we can generate legible code
  "globalThis",
  "Uint8Array",
  "Partial",
]);

/**
 * Names that cannot be used for object properties because they are reserved
 * by built-in JavaScript properties.
 */
const reservedObjectProperties = new Set([
  // names reserved by JavaScript
  "constructor",
  "toString",
  "toJSON",
  "valueOf",
  "__proto__",
  "prototype",
]);

/**
 * Names that cannot be used for object properties because they are reserved
 * by the runtime.
 */
const reservedMessageProperties = new Set(["__proto__"]);

const fallback = <T extends string>(name: T) => `${name}$` as const;

/**
 * Will wrap names that are Object prototype properties or names reserved
 * for `Message`s.
 */
const safeMessageProperty = (name: string): string => {
  if (reservedMessageProperties.has(name)) {
    return fallback(name);
  }
  return name;
};

/**
 * Names that cannot be used for object properties because they are reserved
 * by built-in JavaScript properties.
 */
export const safeObjectProperty = (name: string): string => {
  if (reservedObjectProperties.has(name)) {
    return fallback(name);
  }
  return name;
};

/**
 * Names that can be used for identifiers or class properties
 */
export const safeIdentifier = (name: string): string => {
  if (reservedIdentifiers.has(name)) {
    return fallback(name);
  }
  return name;
};

export function checkSanitizeKey(key: string): boolean {
  return (
    typeof key === "string" &&
    !!key.length &&
    !reservedObjectProperties.has(key)
  );
}

export function throwSanitizeKey(key: string) {
  if (typeof key !== "string") {
    throw new Error("illegal non-string object key: " + typeof key);
  }
  if (!checkSanitizeKey(key)) {
    throw new Error("illegal object key: " + key);
  }
}
