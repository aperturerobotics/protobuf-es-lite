import { WireType } from "./binary-encoding.js";
import type { MessageRecord } from "./message-access.js";

type UnknownField = { no: number; wireType: WireType; data: Uint8Array };
type UnknownFieldRecord = {
  [unknownFieldsSymbol]?: UnknownField[] | undefined;
};

// unknownFieldsSymbol is the symbol used for unknown fields.
export const unknownFieldsSymbol = Symbol(
  "@aptre/protobuf-es-lite/unknown-fields",
);

export function listUnknownFields(
  message: MessageRecord,
): ReadonlyArray<UnknownField> {
  return (message as UnknownFieldRecord)[unknownFieldsSymbol] ?? [];
}

// handleUnknownField stores an unknown field.
export function handleUnknownField(
  message: MessageRecord,
  no: number,
  wireType: WireType,
  data: Uint8Array,
): void {
  if (typeof message !== "object") {
    return;
  }
  const m = message as UnknownFieldRecord;
  if (!Array.isArray(m[unknownFieldsSymbol])) {
    m[unknownFieldsSymbol] = [];
  }
  m[unknownFieldsSymbol].push({ no, wireType, data });
}
