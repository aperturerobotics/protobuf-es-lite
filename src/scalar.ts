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

import { protoInt64 } from "./proto-int64.js";

/**
 * Scalar value types. This is a subset of field types declared by protobuf
 * enum google.protobuf.FieldDescriptorProto.Type The types GROUP and MESSAGE
 * are omitted, but the numerical values are identical.
 */
export enum ScalarType {
  // 0 is reserved for errors.
  // Order is weird for historical reasons.
  DOUBLE = 1,
  FLOAT = 2,
  // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT64 if
  // negative values are likely.
  INT64 = 3,
  UINT64 = 4,
  // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT32 if
  // negative values are likely.
  INT32 = 5,
  FIXED64 = 6,
  FIXED32 = 7,
  BOOL = 8,
  STRING = 9,
  // Tag-delimited aggregate.
  // Group type is deprecated and not supported in proto3. However, Proto3
  // implementations should still be able to parse the group wire format and
  // treat group fields as unknown fields.
  // TYPE_GROUP = 10,
  // TYPE_MESSAGE = 11,  // Length-delimited aggregate.

  // New in version 2.
  BYTES = 12,
  UINT32 = 13,
  // TYPE_ENUM = 14,
  SFIXED32 = 15,
  SFIXED64 = 16,
  SINT32 = 17, // Uses ZigZag encoding.
  SINT64 = 18, // Uses ZigZag encoding.
}

/**
 * JavaScript representation of fields with 64 bit integral types (int64, uint64,
 * sint64, fixed64, sfixed64).
 *
 * This is a subset of google.protobuf.FieldOptions.JSType, which defines JS_NORMAL,
 * JS_STRING, and JS_NUMBER. Protobuf-ES uses BigInt by default, but will use
 * String if `[jstype = JS_STRING]` is specified.
 *
 * ```protobuf
 * uint64 field_a = 1; // BigInt
 * uint64 field_b = 2 [jstype = JS_NORMAL]; // BigInt
 * uint64 field_b = 2 [jstype = JS_NUMBER]; // BigInt
 * uint64 field_b = 2 [jstype = JS_STRING]; // String
 * ```
 */
export enum LongType {
  /**
   * Use JavaScript BigInt.
   */
  BIGINT = 0,

  /**
   * Use JavaScript String.
   *
   * Field option `[jstype = JS_STRING]`.
   */
  STRING = 1,
}

// prettier-ignore
/**
 * ScalarValue maps from a scalar field type to a TypeScript value type.
 */
export type ScalarValue<T = ScalarType, L extends LongType = LongType.STRING | LongType.BIGINT> =
    T extends ScalarType.STRING ? string
  : T extends ScalarType.INT32 ? number
  : T extends ScalarType.UINT32 ? number
  : T extends ScalarType.UINT32 ? number
  : T extends ScalarType.SINT32 ? number
  : T extends ScalarType.FIXED32 ? number
  : T extends ScalarType.SFIXED32 ? number
  : T extends ScalarType.FLOAT ? number
  : T extends ScalarType.DOUBLE ? number
  : T extends ScalarType.INT64 ?    (L extends LongType.STRING ? string : bigint)
  : T extends ScalarType.SINT64 ?   (L extends LongType.STRING ? string : bigint)
  : T extends ScalarType.SFIXED64 ? (L extends LongType.STRING ? string : bigint)
  : T extends ScalarType.UINT64 ?   (L extends LongType.STRING ? string : bigint)
  : T extends ScalarType.FIXED64 ?  (L extends LongType.STRING ? string : bigint)
  : T extends ScalarType.BOOL ? boolean
  : T extends ScalarType.BYTES ? Uint8Array
  : never;

/**
 * Returns true if both scalar values are equal.
 */
export function scalarEquals(
  type: ScalarType,
  a: string | boolean | number | bigint | Uint8Array | undefined,
  b: string | boolean | number | bigint | Uint8Array | undefined,
): boolean {
  if (a === b) {
    // This correctly matches equal values except BYTES and (possibly) 64-bit integers.
    return true;
  }
  // Special case BYTES - we need to compare each byte individually
  if (type == ScalarType.BYTES) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
  // Special case 64-bit integers - we support number, string and bigint representation.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (type) {
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      // Loose comparison will match between 0n, 0 and "0".
      return a == b;
  }
  // Anything that hasn't been caught by strict comparison or special cased
  // BYTES and 64-bit integers is not equal.
  return false;
}

/**
 * Returns the zero value for the given scalar type.
 */
export function scalarZeroValue<T extends ScalarType, L extends LongType>(
  type: T,
  longType: L,
): ScalarValue<T, L> {
  switch (type) {
    case ScalarType.BOOL:
      return false as ScalarValue<T>;
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- acceptable since it's covered by tests
      return (longType == 0 ? protoInt64.zero : "0") as ScalarValue<T, L>;
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      return 0.0 as ScalarValue<T>;
    case ScalarType.BYTES:
      return new Uint8Array(0) as ScalarValue<T>;
    case ScalarType.STRING:
      return "" as ScalarValue<T>;
    default:
      // Handles INT32, UINT32, SINT32, FIXED32, SFIXED32.
      // We do not use individual cases to save a few bytes code size.
      return 0 as ScalarValue<T>;
  }
}

/**
 * Returns true for a zero-value. For example, an integer has the zero-value `0`,
 * a boolean is `false`, a string is `""`, and bytes is an empty Uint8Array.
 *
 * In proto3, zero-values are not written to the wire, unless the field is
 * optional or repeated.
 */
export function isScalarZeroValue(type: ScalarType, value: unknown): boolean {
  switch (type) {
    case ScalarType.BOOL:
      return value === false;
    case ScalarType.STRING:
      return value === "";
    case ScalarType.BYTES:
      return value instanceof Uint8Array && !value.byteLength;
    default:
      return value == 0; // Loose comparison matches 0n, 0 and "0"
  }
}

/**
 * Returns the normalized version of the scalar value.
 * Zero or null is cast to the zero value.
 * Bytes is cast to a Uint8Array.
 * The BigInt long type is used.
 */
export function normalizeScalarValue<T>(
  type: ScalarType,
  value: T | null | undefined,
  longType: LongType = LongType.BIGINT,
): T {
  if (value == null) {
    return scalarZeroValue(type, longType) as T;
  }

  if (type === ScalarType.BYTES) {
    return toU8Arr(value as any) as T;
  }

  if (isScalarZeroValue(type, value)) {
    return scalarZeroValue(type, longType) as T;
  }

  // TODO: enforce correct type for other values as well.
  return value;
}

// converts any ArrayLike<number> to Uint8Array if necessary.
export function toU8Arr(input: ArrayLike<number>) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}
