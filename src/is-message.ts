import { FieldInfo } from "./field.js";
import {
  AnyMessage,
  Message,
  PartialMessage,
  PartialField,
} from "./message.js";

/**
 * Check whether the given partial has all fields present recursively.
 */
export function isCompleteMessage<T extends Message<T> = AnyMessage>(
  arg: PartialMessage<T>,
  fields: readonly FieldInfo[],
): arg is T {
  if (arg == null || typeof arg !== "object") {
    return false;
  }
  return fields.every((fi) => {
    // eslint-disable-line @typescript-eslint/no-explicit-any -- `any` is the best choice for dynamic access
    const value = (arg as any)[fi.localName];

    if (fi.repeated) {
      return (
        Array.isArray(value) && value.every((item) => isCompleteField(item, fi))
      );
    } else {
      return isCompleteField(value, fi);
    }
  });
}

/**
 * Check whether the given partial field has a full value present recursively.
 */
function isCompleteField<F>(value: PartialField<F>, field: FieldInfo): boolean {
  if (field.oneof) {
    // For oneof fields, only one field should be set
    const oneofFields = field.oneof.fields;
    const setField = oneofFields.find(
      (f) => (value as any)[f.localName] !== undefined,
    );
    return setField === field;
  }

  if (value === undefined) {
    return false;
  }

  const fieldKind = field.kind;
  switch (fieldKind) {
    case "scalar":
      return true;
    case "message":
      return isCompleteMessage(
        value as PartialMessage<AnyMessage>,
        field.T.fields.list(),
      );
    case "enum":
      return typeof value === "number";
    case "map":
      return Object.values(
        value as Record<string, PartialField<unknown>>,
      ).every((val) => {
        const valueKind = field.V.kind;
        switch (valueKind) {
          case "scalar":
            return true;
          case "enum":
            return typeof val === "number";
          case "message":
            return isCompleteMessage(
              val as PartialMessage<AnyMessage>,
              field.V.T.fields.list(),
            );
          default:
            return valueKind satisfies never;
        }
      });

    default:
      return fieldKind satisfies never;
  }
}
