import type { EnumType } from "./enum.js";
import { protoBase64 } from "./proto-base64.js";
import { protoInt64 } from "./proto-int64.js";
import type { IMessageTypeRegistry } from "./type-registry.js";

/**
 * Options for parsing JSON data.
 */
export interface JsonReadOptions {
  /**
   * Ignore unknown fields: Proto3 JSON parser should reject unknown fields
   * by default. This option ignores unknown fields in parsing, as well as
   * unrecognized enum string representations.
   */
  ignoreUnknownFields?: boolean;

  /**
   * This option is required to read `google.protobuf.Any` from JSON format.
   */
  typeRegistry?: IMessageTypeRegistry;
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
  emitDefaultValues?: boolean;

  /**
   * Emit enum values as integers instead of strings: The name of an enum
   * value is used by default in JSON output. An option may be provided to
   * use the numeric value of the enum value instead.
   */
  enumAsInteger?: boolean;

  /**
   * Use proto field name instead of lowerCamelCase name: By default proto3
   * JSON printer should convert the field name to lowerCamelCase and use
   * that as the JSON name. An implementation may provide an option to use
   * proto field name as the JSON name instead. Proto3 JSON parsers are
   * required to accept both the converted lowerCamelCase name and the proto
   * field name.
   */
  useProtoFieldName?: boolean;

  /**
   * This option is required to write `google.protobuf.Any` to JSON format.
   */
  typeRegistry?: IMessageTypeRegistry;
}

/**
 * Options for serializing to a JSON string.
 */
export interface JsonWriteStringOptions extends JsonWriteOptions {
  /** Indent nested values by this many spaces; 0 writes one line. */
  prettySpaces?: number;
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

/** jsonDouble converts a double to JSON, with NaN and infinities as strings. */
export function jsonDouble(v: number): JsonValue {
  if (Number.isNaN(v)) {
    return "NaN";
  }
  if (v === Infinity) {
    return "Infinity";
  }
  if (v === -Infinity) {
    return "-Infinity";
  }
  return v;
}

/** jsonLong converts a 64-bit integer to its JSON decimal string. */
export function jsonLong(v: bigint): JsonValue {
  return v.toString();
}

/** jsonBytes converts bytes to standard base64 with padding. */
export function jsonBytes(v: Uint8Array): JsonValue {
  return protoBase64.enc(v);
}

/**
 * jsonEnum converts an enum value to its name, or to its number when the
 * options ask for integers or the number has no name. NullValue is null.
 */
export function jsonEnum(
  v: number,
  type: EnumType,
  o: JsonWriteOptions,
): JsonValue {
  if (type.typeName === "google.protobuf.NullValue") {
    return null;
  }
  if (o.enumAsInteger) {
    return v;
  }
  return type.findNumber(v)?.name ?? v;
}

/**
 * jsonEntries returns the entries of the JSON object of a message, and
 * throws if j is not an object.
 */
export function jsonEntries(
  j: JsonValue,
  typeName: string,
): [string, JsonValue][] {
  if (j === null || typeof j !== "object" || Array.isArray(j)) {
    throw new Error(`${typeName} must be a JSON object, not ${debug(j)}`);
  }
  return Object.entries(j);
}

/**
 * jsonUnknown handles a key no field of the message has: it throws, unless
 * the options ignore unknown fields.
 */
export function jsonUnknown(key: string, o: JsonReadOptions): void {
  if (!o.ignoreUnknownFields) {
    throw new Error(`key "${key}" is unknown`);
  }
}

/** jsonList returns the elements of a JSON array, and throws otherwise. */
export function jsonList(j: JsonValue): JsonValue[] {
  if (!Array.isArray(j)) {
    throw new Error(`expected a JSON array, not ${debug(j)}`);
  }
  return j;
}

/**
 * readStr reads a string. The read helpers read null as the zero value, so a
 * null clears an implicit-presence field.
 */
export function readStr(j: JsonValue): string {
  if (j === null) {
    return "";
  }
  if (typeof j !== "string") {
    throw bad("string", j);
  }
  return j;
}

/** readBool reads a bool. */
export function readBool(j: JsonValue): boolean {
  if (j === null) {
    return false;
  }
  if (typeof j !== "boolean") {
    throw bad("bool", j);
  }
  return j;
}

/** readInt32 reads a signed 32-bit integer from a number or a string. */
export function readInt32(j: JsonValue): number {
  const n = readInt(j);
  if (n > 0x7fffffff || n < -0x80000000) {
    throw bad("int32", j);
  }
  return n;
}

/** readUint32 reads an unsigned 32-bit integer from a number or a string. */
export function readUint32(j: JsonValue): number {
  const n = readInt(j);
  if (n > 0xffffffff || n < 0) {
    throw bad("uint32", j);
  }
  return n;
}

function readInt(j: JsonValue): number {
  if (j === null) {
    return 0;
  }
  let n = NaN;
  if (typeof j === "number") {
    n = j;
  } else if (typeof j === "string" && j.length > 0 && j.trim() === j) {
    n = Number(j);
  }
  if (!Number.isInteger(n)) {
    throw bad("integer", j);
  }
  return n;
}

/**
 * readDouble reads a double from a number, a numeric string, or "NaN",
 * "Infinity" or "-Infinity".
 */
export function readDouble(j: JsonValue): number {
  if (j === null) {
    return 0;
  }
  if (j === "NaN") {
    return NaN;
  }
  if (j === "Infinity") {
    return Infinity;
  }
  if (j === "-Infinity") {
    return -Infinity;
  }
  let n = NaN;
  if (typeof j === "number") {
    n = j;
  } else if (typeof j === "string" && j.length > 0 && j.trim() === j) {
    n = Number(j);
  }
  if (!Number.isFinite(n)) {
    throw bad("number", j);
  }
  return n;
}

/** readFloat reads a double that fits in a 32-bit float. */
export function readFloat(j: JsonValue): number {
  const n = readDouble(j);
  if (Number.isFinite(n) && Math.abs(n) > 3.4028234663852886e38) {
    throw bad("float", j);
  }
  return n;
}

/** readInt64 reads a signed 64-bit integer from a number or a string. */
export function readInt64(j: JsonValue): bigint {
  if (j === null) {
    return 0n;
  }
  if (typeof j !== "number" && typeof j !== "string") {
    throw bad("int64", j);
  }
  return protoInt64.parse(j);
}

/** readUint64 reads an unsigned 64-bit integer from a number or a string. */
export function readUint64(j: JsonValue): bigint {
  if (j === null) {
    return 0n;
  }
  if (typeof j !== "number" && typeof j !== "string") {
    throw bad("uint64", j);
  }
  return protoInt64.uParse(j);
}

/** readBytes reads standard or URL-safe base64, with or without padding. */
export function readBytes(j: JsonValue): Uint8Array {
  if (j === null) {
    return new Uint8Array(0);
  }
  if (typeof j !== "string") {
    throw bad("bytes", j);
  }
  return protoBase64.dec(j);
}

/**
 * readEnum reads an enum value from its name or number. It returns undefined
 * for an unknown name when the options ignore unknown fields, so the caller
 * keeps the field as it was. Null also reads as undefined, an unset field,
 * except for google.protobuf.NullValue, where it is the value.
 */
export function readEnum(
  j: JsonValue,
  type: EnumType,
  o: JsonReadOptions,
): number | undefined {
  if (j === null) {
    return type.typeName === "google.protobuf.NullValue" ? 0 : undefined;
  }
  if (typeof j === "number" && Number.isInteger(j)) {
    return j;
  }
  if (typeof j === "string") {
    const value = type.findName(j);
    if (value) {
      return value.no;
    }
    if (o.ignoreUnknownFields) {
      return undefined;
    }
  }
  throw bad(type.typeName, j);
}

/** readBoolKey reads a bool map key, written in JSON as "true" or "false". */
export function readBoolKey(k: string): string {
  if (k !== "true" && k !== "false") {
    throw bad("bool", k);
  }
  return k;
}

function bad(type: string, j: JsonValue): Error {
  return new Error(`cannot read ${debug(j)} as ${type}`);
}

function debug(j: JsonValue): string {
  if (j === null) {
    return "null";
  }
  if (Array.isArray(j)) {
    return "array";
  }
  if (typeof j === "object") {
    return "object";
  }
  if (typeof j === "string") {
    return j.length > 100 ? "string" : JSON.stringify(j);
  }
  return (
    typeof j === "number" ? String(j)
    : j ? "true"
    : "false"
  );
}
