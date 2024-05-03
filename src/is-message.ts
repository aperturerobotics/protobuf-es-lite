import { FieldInfo, resolveMessageType } from "./field.js";
import { AnyMessage, Message, CompleteMessage, Field } from "./message.js";

/**
 * Check whether the given partial is a valid message.
 */
export function isMessage<T extends Message<T> = AnyMessage>(
  arg: any,
  fields: readonly FieldInfo[],
): arg is T {
  if (arg == null || typeof arg !== "object") {
    return false;
  }
  return fields.every((fi) => {
    // eslint-disable-line @typescript-eslint/no-explicit-any -- `any` is the best choice for dynamic access
    const value = (arg as any)[fi.localName];

    // if the value is null or undefined this is OK in isMessage.
    if (value == null) {
      return true;
    }

    if (fi.repeated) {
      return Array.isArray(value) && value.every((item) => isField(item, fi));
    } else {
      return isField(value, fi);
    }
  });
}

/**
 * Check whether the given partial field is a valid field value.
 */
export function isField<F>(value: any, field: FieldInfo): value is Field<F> {
  if (value == null) {
    return false;
  }
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
    case "message": {
      const messageType = resolveMessageType(field.T);
      return isMessage(value as Message<AnyMessage>, messageType.fields.list());
    }
    case "enum":
      return typeof value === "number";
    case "map":
      return Object.values(value as Record<string, Field<unknown>>).every(
        (val) => {
          const valueKind = field.V.kind;
          switch (valueKind) {
            case "scalar":
              return true;
            case "enum":
              return typeof val === "number";
            case "message": {
              const messageType = resolveMessageType(field.V.T);
              return isMessage(
                val as Message<AnyMessage>,
                messageType.fields.list(),
              );
            }
            default:
              return valueKind satisfies never;
          }
        },
      );

    default:
      return fieldKind satisfies never;
  }
}

/**
 * Check whether the given partial has all fields present recursively.
 */
export function isCompleteMessage<T extends Message<T> = AnyMessage>(
  arg: Message<T>,
  fields: readonly FieldInfo[],
): arg is CompleteMessage<T> {
  // arg is CompleteMessage<T> {
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
export function isCompleteField<F>(value: Field<F>, field: FieldInfo): boolean {
  // value is CompleteField<F> {
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
    case "message": {
      const messageType = resolveMessageType(field.T);
      return isCompleteMessage(
        value as Message<AnyMessage>,
        messageType.fields.list(),
      );
    }
    case "enum":
      return typeof value === "number";
    case "map":
      return Object.values(value as Record<string, Field<unknown>>).every(
        (val) => {
          const valueKind = field.V.kind;
          switch (valueKind) {
            case "scalar":
              return true;
            case "enum":
              return typeof val === "number";
            case "message": {
              const messageType = resolveMessageType(field.V.T);
              return isCompleteMessage(
                val as Message<AnyMessage>,
                messageType.fields.list(),
              );
            }
            default:
              return valueKind satisfies never;
          }
        },
      );

    default:
      return fieldKind satisfies never;
  }
}
