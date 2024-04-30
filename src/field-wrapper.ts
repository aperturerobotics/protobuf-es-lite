import { DescExtension, DescField } from "./descriptor-set.js";
import { ScalarType } from "./scalar.js";

/**
 * A field wrapper unwraps a message to a primitive value that is more
 * ergonomic for use as a message field.
 */
export interface FieldWrapper<T = any, U = any> {
  wrapField(value: U | null | undefined): T;

  unwrapField(value: T): U | null | undefined;
}

/**
 * Wrap a primitive message field value in its corresponding wrapper
 * message. This function is idempotent.
 */
export function wrapField<T>(
  fieldWrapper: FieldWrapper<T> | undefined,
  value: any,
): T {
  if (!fieldWrapper) {
    return value as T;
  }
  return fieldWrapper.wrapField(value);
}

/**
 * If the given field uses one of the well-known wrapper types, return
 * the primitive type it wraps.
 */
export function getUnwrappedFieldType(
  field: DescField | DescExtension,
): ScalarType | undefined {
  if (field.fieldKind !== "message") {
    return undefined;
  }
  if (field.repeated) {
    return undefined;
  }
  if (field.oneof != undefined) {
    return undefined;
  }
  return wktWrapperToScalarType[field.message.typeName];
}

const wktWrapperToScalarType: Record<string, ScalarType> = {
  "google.protobuf.DoubleValue": ScalarType.DOUBLE,
  "google.protobuf.FloatValue": ScalarType.FLOAT,
  "google.protobuf.Int64Value": ScalarType.INT64,
  "google.protobuf.UInt64Value": ScalarType.UINT64,
  "google.protobuf.Int32Value": ScalarType.INT32,
  "google.protobuf.UInt32Value": ScalarType.UINT32,
  "google.protobuf.BoolValue": ScalarType.BOOL,
  "google.protobuf.StringValue": ScalarType.STRING,
  "google.protobuf.BytesValue": ScalarType.BYTES,
};
