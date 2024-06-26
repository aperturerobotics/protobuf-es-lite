import { DescExtension, DescField, DescMessage } from "./descriptor-set.js";
import { ScalarType } from "./scalar.js";

/**
 * A field wrapper unwraps a message to a primitive value that is more
 * ergonomic for use as a message field.
 */
export interface FieldWrapper<T = any, U = any> {
  /**
   * Wrap a primitive message field value in its corresponding wrapper
   * message. This function is idempotent.
   */
  wrapField(value: U | null | undefined): T;

  /**
   * If the given field uses one of the well-known wrapper types, return
   * the primitive type it wraps.
   */
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
 * Wrap a primitive message field value in its corresponding wrapper
 * message. This function is idempotent.
 */
export function unwrapField<T, U = T>(
  fieldWrapper: FieldWrapper<T> | undefined,
  value: any,
): U {
  return fieldWrapper ? fieldWrapper.unwrapField(value) : value;
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
  if (field.message.typeName !== "google.protobuf.Timestamp") {
    if (field.repeated || field.oneof != null) {
      return undefined;
    }
  }
  return getUnwrappedMessageType(field.message);
}

/**
 * If the given field uses one of the well-known wrapper types, return
 * the primitive type it wraps.
 */
export function getUnwrappedMessageType(
  msg: DescMessage,
): ScalarType | undefined {
  if (msg.kind !== "message") {
    return undefined;
  }
  return wktWrapperToScalarType[msg.typeName];
}

const wktWrapperToScalarType: Record<string, ScalarType> = {
  "google.protobuf.Timestamp": ScalarType.DATE,
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
