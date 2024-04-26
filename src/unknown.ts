import { WireType } from "./binary-encoding.js";

// unknownFieldsSymbol is the symbol used for unknown fields.
export const unknownFieldsSymbol = Symbol(
  "@aptre/protobuf-es-lite/unknown-fields",
);

export function listUnknownFields(
  message: any,
): ReadonlyArray<{ no: number; wireType: WireType; data: Uint8Array }> {
  return message[unknownFieldsSymbol] ?? [];
}

// handleUnknownField stores an unknown field.
export function handleUnknownField(
  message: any,
  no: number,
  wireType: WireType,
  data: Uint8Array,
): void {
  if (typeof message !== "object") {
    return;
  }
  const m = message as any;
  if (!Array.isArray(m[unknownFieldsSymbol])) {
    m[unknownFieldsSymbol] = [];
  }
  m[unknownFieldsSymbol].push({ no, wireType, data });
}
