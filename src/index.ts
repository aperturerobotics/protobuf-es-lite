export {
  Message,
  AnyMessage,
  PartialMessage,
  MessageType,
  compareMessages,
} from "./message.js";
export {
  newFieldList,
  FieldList,
  PartialFieldInfo,
  FieldInfo,
  OneofInfo,
  fieldJsonName,
  localFieldName,
  localOneofName,
} from "./field.js";
export { scalarEquals, scalarZeroValue, isScalarZeroValue } from "./scalar.js";
