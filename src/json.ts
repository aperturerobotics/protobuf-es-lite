import {
  FieldInfo,
  FieldList,
  OneofInfo,
  isFieldSet,
  resolveMessageType,
} from "./field.js";
import { assert, assertFloat32, assertInt32, assertUInt32 } from "./assert.js";
import {
  LongType,
  ScalarType,
  ScalarValue,
  scalarZeroValue,
} from "./scalar.js";
import { wrapField } from "./field-wrapper.js";
import { EnumType } from "./enum.js";
import { protoInt64 } from "./proto-int64.js";
import { protoBase64 } from "./proto-base64.js";

/**
 * Options for parsing JSON data.
 */
export interface JsonReadOptions {
  /**
   * Ignore unknown fields: Proto3 JSON parser should reject unknown fields
   * by default. This option ignores unknown fields in parsing, as well as
   * unrecognized enum string representations.
   */
  ignoreUnknownFields: boolean;
}

/**
 * Options for serializing to JSON.
 */
export interface JsonWriteOptions {
  /**
   * Emit fields with default values: Fields with default values are omitted
   * by default in proto3 JSON output. This option overrides this behavior
   * and outputs fields with their default values.
   */
  emitDefaultValues: boolean;

  /**
   * Emit enum values as integers instead of strings: The name of an enum
   * value is used by default in JSON output. An option may be provided to
   * use the numeric value of the enum value instead.
   */
  enumAsInteger: boolean;

  /**
   * Use proto field name instead of lowerCamelCase name: By default proto3
   * JSON printer should convert the field name to lowerCamelCase and use
   * that as the JSON name. An implementation may provide an option to use
   * proto field name as the JSON name instead. Proto3 JSON parsers are
   * required to accept both the converted lowerCamelCase name and the proto
   * field name.
   */
  useProtoFieldName: boolean;
}

/**
 * Options for serializing to JSON.
 */
export interface JsonWriteStringOptions extends JsonWriteOptions {
  prettySpaces: number;
}

/**
 * Represents any possible JSON value:
 * - number
 * - string
 * - boolean
 * - null
 * - object (with any JSON value as property)
 * - array (with any JSON value as element)
 */
export type JsonValue =
  | number
  | string
  | boolean
  | null
  | JsonObject
  | JsonValue[];

/**
 * Represents a JSON object.
 */
export type JsonObject = { [k: string]: JsonValue };

// Default options for parsing JSON.
const jsonReadDefaults: Readonly<JsonReadOptions> = {
  ignoreUnknownFields: false,
};

// Default options for serializing to JSON.
const jsonWriteDefaults: Readonly<JsonWriteStringOptions> = {
  emitDefaultValues: false,
  enumAsInteger: false,
  useProtoFieldName: false,
  prettySpaces: 0,
};

export function makeReadOptions(
  options?: Partial<JsonReadOptions>,
): Readonly<JsonReadOptions> {
  return options ? { ...jsonReadDefaults, ...options } : jsonReadDefaults;
}

export function makeWriteOptions(
  options?: Partial<JsonWriteStringOptions>,
): Readonly<JsonWriteStringOptions> {
  return options ? { ...jsonWriteDefaults, ...options } : jsonWriteDefaults;
}

function debugJsonValue(json: unknown): string {
  if (json === null) {
    return "null";
  }
  switch (typeof json) {
    case "object":
      return Array.isArray(json) ? "array" : "object";
    case "string":
      return json.length > 100 ? "string" : `"${json.split('"').join('\\"')}"`;
    default:
      return String(json);
  }
}

export function readMessage<T>(
  fields: FieldList,
  typeName: string,
  json: JsonValue,
  options: JsonReadOptions,
  message: T,
): T {
  if (json == null || Array.isArray(json) || typeof json != "object") {
    throw new Error(
      `cannot decode message ${typeName} from JSON: ${debugJsonValue(json)}`,
    );
  }
  const oneofSeen = new Map<OneofInfo, string>();
  for (const [jsonKey, jsonValue] of Object.entries(json)) {
    const field = fields.findJsonName(jsonKey);
    if (field) {
      if (field.oneof) {
        if (jsonValue === null && field.kind == "scalar") {
          // see conformance test Required.Proto3.JsonInput.OneofFieldNull{First,Second}
          continue;
        }
        const seen = oneofSeen.get(field.oneof);
        if (seen !== undefined) {
          throw new Error(
            `cannot decode message ${typeName} from JSON: multiple keys for oneof "${field.oneof.name}" present: "${seen}", "${jsonKey}"`,
          );
        }
        oneofSeen.set(field.oneof, jsonKey);
      }
      readField(message as Record<string, unknown>, jsonValue, field, options);
    } else {
      let found = false;
      if (!found && !options.ignoreUnknownFields) {
        throw new Error(
          `cannot decode message ${typeName} from JSON: key "${jsonKey}" is unknown`,
        );
      }
    }
  }
  return message;
}

export function writeMessage<T>(
  message: T,
  fields: FieldList,
  options: JsonWriteOptions,
): JsonValue {
  const json: JsonObject = {};
  let field: FieldInfo | undefined;
  try {
    for (field of fields.byNumber()) {
      if (!isFieldSet(field, message as Record<string, any>)) {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (field.req) {
          throw `required field not set`;
        }
        if (!options.emitDefaultValues) {
          continue;
        }
        if (!canEmitFieldDefaultValue(field)) {
          continue;
        }
      }
      const value =
        field.oneof ?
          (message as any)[field.oneof.localName].value
        : (message as any)[field.localName];
      const jsonValue = writeField(field, value, options);
      if (jsonValue !== undefined) {
        json[options.useProtoFieldName ? field.name : field.jsonName] =
          jsonValue;
      }
    }
  } catch (e) {
    const m =
      field ?
        `cannot encode field ${field.name} to JSON`
      : `cannot encode message to JSON`;
    const r = e instanceof Error ? e.message : String(e);
    throw new Error(m + (r.length > 0 ? `: ${r}` : ""));
  }
  return json;
}

// Read a JSON value for a field.
// The "parentType" argument is only used to provide context in errors.
function readField(
  target: Record<string, unknown>,
  jsonValue: JsonValue,
  field: FieldInfo,
  options: JsonReadOptions,
) {
  let localName = field.localName;
  if (field.repeated) {
    assert(field.kind != "map");
    if (jsonValue === null) {
      return;
    }
    if (!Array.isArray(jsonValue)) {
      throw new Error(
        `cannot decode field ${
          field.name
        } from JSON: ${debugJsonValue(jsonValue)}`,
      );
    }
    var targetArray = target[localName] as unknown[];
    if (!Array.isArray(targetArray)) {
      targetArray = target[localName] = [];
    }
    for (const jsonItem of jsonValue) {
      if (jsonItem === null) {
        throw new Error(
          `cannot decode field ${
            field.name
          } from JSON: ${debugJsonValue(jsonItem)}`,
        );
      }
      switch (field.kind) {
        case "message":
          const messageType = resolveMessageType(field.T);
          targetArray.push(messageType.fromJson(jsonItem, options));
          break;
        case "enum":
          const enumValue = readEnum(
            field.T,
            jsonItem,
            options.ignoreUnknownFields,
            true,
          );
          if (enumValue !== tokenIgnoredUnknownEnum) {
            targetArray.push(enumValue);
          }
          break;
        case "scalar":
          try {
            targetArray.push(readScalar(field.T, jsonItem, field.L, true));
          } catch (e) {
            let m = `cannot decode field ${
              field.name
            } from JSON: ${debugJsonValue(jsonItem)}`;
            if (e instanceof Error && e.message.length > 0) {
              m += `: ${e.message}`;
            }
            throw new Error(m);
          }
          break;
      }
    }
  } else if (field.kind == "map") {
    if (jsonValue === null) {
      return;
    }
    if (typeof jsonValue != "object" || Array.isArray(jsonValue)) {
      throw new Error(
        `cannot decode field ${
          field.name
        } from JSON: ${debugJsonValue(jsonValue)}`,
      );
    }
    var targetMap = target[localName] as Record<string, unknown>;
    if (typeof targetMap !== "object") {
      targetMap = target[localName] = {};
    }
    for (const [jsonMapKey, jsonMapValue] of Object.entries(jsonValue)) {
      if (jsonMapValue === null) {
        throw new Error(
          `cannot decode field ${field.name} from JSON: map value null`,
        );
      }
      let key: string;
      try {
        key = readMapKey(field.K, jsonMapKey);
      } catch (e) {
        let m = `cannot decode map key for field ${
          field.name
        } from JSON: ${debugJsonValue(jsonValue)}`;
        if (e instanceof Error && e.message.length > 0) {
          m += `: ${e.message}`;
        }
        throw new Error(m);
      }
      switch (field.V.kind) {
        case "message":
          const messageType = resolveMessageType(field.V.T);
          targetMap[key] = messageType.fromJson(jsonMapValue, options);
          break;
        case "enum":
          const enumValue = readEnum(
            field.V.T,
            jsonMapValue,
            options.ignoreUnknownFields,
            true,
          );
          if (enumValue !== tokenIgnoredUnknownEnum) {
            targetMap[key] = enumValue;
          }
          break;
        case "scalar":
          try {
            targetMap[key] = readScalar(
              field.V.T,
              jsonMapValue,
              LongType.BIGINT,
              true,
            );
          } catch (e) {
            let m = `cannot decode map value for field ${
              field.name
            } from JSON: ${debugJsonValue(jsonValue)}`;
            if (e instanceof Error && e.message.length > 0) {
              m += `: ${e.message}`;
            }
            throw new Error(m);
          }
          break;
      }
    }
  } else {
    if (field.oneof) {
      target = target[field.oneof.localName] = { case: localName };
      localName = "value";
    }
    switch (field.kind) {
      case "message":
        const messageType = resolveMessageType(field.T);
        if (
          jsonValue === null &&
          messageType.typeName != "google.protobuf.Value"
        ) {
          return;
        }
        let currentValue = target[localName];
        target[localName] = currentValue = messageType.fromJson(
          jsonValue,
          options,
        );
        if (messageType.fieldWrapper && !field.oneof) {
          target[localName] = messageType.fieldWrapper.unwrapField(
            currentValue as any,
          );
        }
        break;
      case "enum":
        const enumValue = readEnum(
          field.T,
          jsonValue,
          options.ignoreUnknownFields,
          false,
        );
        switch (enumValue) {
          case tokenNull:
            clearField(field, target);
            break;
          case tokenIgnoredUnknownEnum:
            break;
          default:
            target[localName] = enumValue;
            break;
        }
        break;
      case "scalar":
        try {
          const scalarValue = readScalar(field.T, jsonValue, field.L, false);
          switch (scalarValue) {
            case tokenNull:
              clearField(field, target);
              break;
            default:
              target[localName] = scalarValue;
              break;
          }
        } catch (e) {
          let m = `cannot decode field ${field.name} from JSON: ${debugJsonValue(jsonValue)}`;
          if (e instanceof Error && e.message.length > 0) {
            m += `: ${e.message}`;
          }
          throw new Error(m);
        }
        break;
    }
  }
}

const tokenNull = Symbol();
const tokenIgnoredUnknownEnum = Symbol();

function readEnum(
  type: EnumType,
  json: JsonValue,
  ignoreUnknownFields: boolean,
  nullAsZeroValue: false,
): number | typeof tokenIgnoredUnknownEnum | typeof tokenNull;
function readEnum(
  type: EnumType,
  json: JsonValue,
  ignoreUnknownFields: boolean,
  nullAsZeroValue: true,
): number | typeof tokenIgnoredUnknownEnum;
function readEnum(
  type: EnumType,
  json: JsonValue,
  ignoreUnknownFields: boolean,
  nullAsZeroValue: boolean,
): number | typeof tokenNull | typeof tokenIgnoredUnknownEnum {
  if (json === null) {
    if (type.typeName == "google.protobuf.NullValue") {
      return 0; // google.protobuf.NullValue.NULL_VALUE = 0
    }
    return nullAsZeroValue ? type.values[0].no : tokenNull;
  }
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (typeof json) {
    case "number":
      if (Number.isInteger(json)) {
        return json;
      }
      break;
    case "string":
      const value = type.findName(json);
      if (value !== undefined) {
        return value.no;
      }
      if (ignoreUnknownFields) {
        return tokenIgnoredUnknownEnum;
      }
      break;
  }
  throw new Error(
    `cannot decode enum ${type.typeName} from JSON: ${debugJsonValue(json)}`,
  );
}

function readScalar(
  type: ScalarType,
  json: JsonValue,
  longType: LongType,
  nullAsZeroValue: true,
): ScalarValue;
function readScalar(
  type: ScalarType,
  json: JsonValue,
  longType: LongType,
  nullAsZeroValue: false,
): ScalarValue | typeof tokenNull;
function readScalar(
  type: ScalarType,
  json: JsonValue,
  longType: LongType,
  nullAsZeroValue: boolean,
): ScalarValue | typeof tokenNull {
  if (json === null) {
    if (nullAsZeroValue) {
      return scalarZeroValue(type, longType);
    }
    return tokenNull;
  }
  // every valid case in the switch below returns, and every fall
  // through is regarded as a failure.
  switch (type) {
    // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
    // Either numbers or strings are accepted. Exponent notation is also accepted.
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      if (json === "NaN") return Number.NaN;
      if (json === "Infinity") return Number.POSITIVE_INFINITY;
      if (json === "-Infinity") return Number.NEGATIVE_INFINITY;
      if (json === "") {
        // empty string is not a number
        break;
      }
      if (typeof json == "string" && json.trim().length !== json.length) {
        // extra whitespace
        break;
      }
      if (typeof json != "string" && typeof json != "number") {
        break;
      }
      const float = Number(json);
      if (Number.isNaN(float)) {
        // not a number
        break;
      }
      if (!Number.isFinite(float)) {
        // infinity and -infinity are handled by string representation above, so this is an error
        break;
      }
      if (type == ScalarType.FLOAT) assertFloat32(float);
      return float;

    // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
    case ScalarType.INT32:
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
    case ScalarType.UINT32:
      let int32: number | undefined;
      if (typeof json == "number") int32 = json;
      else if (typeof json == "string" && json.length > 0) {
        if (json.trim().length === json.length) int32 = Number(json);
      }
      if (int32 === undefined) break;
      if (type == ScalarType.UINT32 || type == ScalarType.FIXED32)
        assertUInt32(int32);
      else assertInt32(int32);
      return int32;

    // int64, fixed64, uint64: JSON value will be a decimal string. Either numbers or strings are accepted.
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      if (typeof json != "number" && typeof json != "string") break;
      const long = protoInt64.parse(json);
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      return longType ? long.toString() : long;
    case ScalarType.FIXED64:
    case ScalarType.UINT64:
      if (typeof json != "number" && typeof json != "string") break;
      const uLong = protoInt64.uParse(json);
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      return longType ? uLong.toString() : uLong;

    // bool:
    case ScalarType.BOOL:
      if (typeof json !== "boolean") break;
      return json;

    // string:
    case ScalarType.STRING:
      if (typeof json !== "string") {
        break;
      }
      // A string must always contain UTF-8 encoded or 7-bit ASCII.
      // We validate with encodeURIComponent, which appears to be the fastest widely available option.
      try {
        encodeURIComponent(json);
      } catch (e) {
        throw new Error("invalid UTF8");
      }
      return json;

    // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
    // Either standard or URL-safe base64 encoding with/without paddings are accepted.
    case ScalarType.BYTES:
      if (json === "") return new Uint8Array(0);
      if (typeof json !== "string") break;
      return protoBase64.dec(json);
  }
  throw new Error();
}

function readMapKey(type: ScalarType, json: JsonValue) {
  if (type === ScalarType.BOOL) {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (json) {
      case "true":
        json = true;
        break;
      case "false":
        json = false;
        break;
    }
  }
  return readScalar(type, json, LongType.BIGINT, true).toString();
}

/**
 * Resets the field, so that isFieldSet() will return false.
 */
export function clearField(
  field: FieldInfo,
  target: Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- `any` is the best choice for dynamic access
) {
  const localName = field.localName;
  const implicitPresence = !field.opt && !field.req;
  if (field.repeated) {
    target[localName] = [];
  } else if (field.oneof) {
    target[field.oneof.localName] = { case: undefined };
  } else {
    switch (field.kind) {
      case "map":
        target[localName] = {};
        break;
      case "enum":
        target[localName] = implicitPresence ? field.T.values[0].no : undefined;
        break;
      case "scalar":
        target[localName] =
          implicitPresence ? scalarZeroValue(field.T, field.L) : undefined;
        break;
      case "message":
        target[localName] = undefined;
        break;
    }
  }
}

// Decide whether an unset field should be emitted with JSON write option `emitDefaultValues`
function canEmitFieldDefaultValue(field: FieldInfo) {
  if (field.repeated || field.kind == "map") {
    // maps are {}, repeated fields are []
    return true;
  }
  if (field.oneof) {
    // oneof fields are never emitted
    return false;
  }
  if (field.kind == "message") {
    // singular message field are allowed to emit JSON null, but we do not
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (field.opt || field.req) {
    // the field uses explicit presence, so we cannot emit a zero value
    return false;
  }
  return true;
}

function writeField(
  field: FieldInfo,
  value: unknown,
  options: JsonWriteOptions,
): JsonValue | undefined {
  if (field.kind == "map") {
    assert(typeof value == "object" && value != null);
    const jsonObj: JsonObject = {};
    const entries = Object.entries(value);
    switch (field.V.kind) {
      case "scalar":
        for (const [entryKey, entryValue] of entries) {
          jsonObj[entryKey.toString()] = writeScalar(field.V.T, entryValue); // JSON standard allows only (double quoted) string as property key
        }
        break;
      case "message":
        for (const [entryKey, entryValue] of entries) {
          // JSON standard allows only (double quoted) string as property key
          const messageType = resolveMessageType(field.V.T);
          jsonObj[entryKey.toString()] = messageType.toJson(
            entryValue,
            options,
          );
        }
        break;
      case "enum":
        const enumType = field.V.T;
        for (const [entryKey, entryValue] of entries) {
          // JSON standard allows only (double quoted) string as property key
          jsonObj[entryKey.toString()] = writeEnum(
            enumType,
            entryValue,
            options.enumAsInteger,
          );
        }
        break;
    }
    return options.emitDefaultValues || entries.length > 0 ?
        jsonObj
      : undefined;
  }
  if (field.repeated) {
    assert(Array.isArray(value));
    const jsonArr: JsonValue[] = [];
    switch (field.kind) {
      case "scalar":
        for (let i = 0; i < value.length; i++) {
          jsonArr.push(writeScalar(field.T, value[i]) as JsonValue);
        }
        break;
      case "enum":
        for (let i = 0; i < value.length; i++) {
          jsonArr.push(
            writeEnum(field.T, value[i], options.enumAsInteger) as JsonValue,
          );
        }
        break;
      case "message":
        for (let i = 0; i < value.length; i++) {
          jsonArr.push(value[i].toJson(options));
        }
        break;
    }
    return options.emitDefaultValues || jsonArr.length > 0 ?
        jsonArr
      : undefined;
  }
  switch (field.kind) {
    case "scalar":
      return writeScalar(field.T, value);
    case "enum":
      return writeEnum(field.T, value, options.enumAsInteger);
    case "message":
      const messageType = resolveMessageType(field.T);
      return messageType.toJson(wrapField(messageType.fieldWrapper, value));
  }
}

function writeScalar(
  type: ScalarType,
  value: unknown,
): string | number | boolean {
  switch (type) {
    // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
    case ScalarType.INT32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
    case ScalarType.FIXED32:
    case ScalarType.UINT32:
      assert(typeof value == "number");
      return value;

    // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
    // Either numbers or strings are accepted. Exponent notation is also accepted.
    case ScalarType.FLOAT:
    // assertFloat32(value);
    case ScalarType.DOUBLE: // eslint-disable-line no-fallthrough
      assert(typeof value == "number");
      if (Number.isNaN(value)) return "NaN";
      if (value === Number.POSITIVE_INFINITY) return "Infinity";
      if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
      return value;

    // string:
    case ScalarType.STRING:
      assert(typeof value == "string");
      return value;

    // bool:
    case ScalarType.BOOL:
      assert(typeof value == "boolean");
      return value;

    // JSON value will be a decimal string. Either numbers or strings are accepted.
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      assert(
        typeof value == "bigint" ||
          typeof value == "string" ||
          typeof value == "number",
      );
      return value.toString();

    // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
    // Either standard or URL-safe base64 encoding with/without paddings are accepted.
    case ScalarType.BYTES:
      assert(value instanceof Uint8Array);
      return protoBase64.enc(value);
  }
}

function writeEnum(
  type: EnumType,
  value: unknown,
  enumAsInteger: boolean,
): string | number | null {
  assert(typeof value == "number");
  if (type.typeName == "google.protobuf.NullValue") {
    return null;
  }
  if (enumAsInteger) {
    return value;
  }
  const val = type.findNumber(value);
  return val?.name ?? value; // if we don't know the enum value, just return the number
}
