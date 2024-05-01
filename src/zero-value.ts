import { DescExtension, DescField } from "./descriptor-set.js";
import { enumDescZeroValue } from "./enum.js";
import { localName } from "./names.js";
import { scalarZeroValue } from "./scalar.js";

/**
 * Returns the zero value for a field.
 *
 * Returns either:
 * - empty array literal for repeated fields
 * - Object.create(null) for maps
 * - undefined for message fields
 * - an enums first value
 * - scalar zero value
 */
export function getFieldZeroValue(field: DescField | DescExtension) {
  if (field.repeated) {
    return [];
  }
  switch (field.fieldKind) {
    case "message":
      return undefined;
    case "map":
      return Object.create(null);
    case "enum": {
      return enumDescZeroValue(field.enum)
    }
    case "scalar": {
      return scalarZeroValue(field.scalar, field.longType);
    }
  }
}

/**
 * Returns true for a zero-value (all fields are zero).
 *
 * In proto3, zero-values are not written to the wire, unless the field is
 * optional or repeated.
 */
export function isMessageZeroValue<T extends Record<string, any>>(
  value: T | null | undefined,
  fields: (DescField | DescExtension)[],
): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value !== "object") {
    return false;
  }
  for (const field of fields) {
    const fieldLocalName = localName(field);
    if (
      fieldLocalName in value &&
      !compareFieldZeroValue(field, value[fieldLocalName])
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Compares if the value is considered a zero value for the field.
 */
export function compareFieldZeroValue<T>(
  field: DescField | DescExtension,
  value: T | null | undefined,
): boolean {
  if (value == null || value == 0) {
    return true;
  }
  if (field.repeated) {
    if (!Array.isArray(value) || typeof value.length !== "number") {
      throw new Error("invalid repeated field: must be an array");
    }
    return value.length === 0;
  }
  switch (field.fieldKind) {
    case "message":
      if (typeof value !== "object") {
        throw new Error("invalid message: must be an object");
      }
      // We need to check if all the fields are empty.
      return isMessageZeroValue(value, field.message.fields);
    case "map":
      return Object.create(null);
    case "enum": {
      // In proto3, the first enum value must be zero.
      // In proto2, protobuf-go returns the first value as the default.
      if (field.enum.values.length < 1) {
        throw new Error("invalid enum: missing at least one value");
      }
      const zeroValue = field.enum.values[0];
      return zeroValue.number === value;
    }
    case "scalar": {
      return scalarZeroValue(field.scalar, field.longType) === value;
    }
  }
}
