/**
 * A field wrapper unwraps a message to a primitive value that is more
 * ergonomic for use as a message field.
 *
 * Note that this feature exists for google/protobuf/wrappers.proto
 * and cannot be used to arbitrarily modify types in generated code.
 */
export interface FieldWrapper<T = any, U = any> {
  wrapField(value: U): T;

  unwrapField(value: T): U;
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
