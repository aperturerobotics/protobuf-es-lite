import {
  BinaryReadOptions,
  BinaryReader,
  BinaryWriteOptions,
  BinaryWriter,
  IBinaryReader,
  IBinaryWriter,
  LongType,
  ScalarType,
  ScalarValue,
  WireType,
} from "@bufbuild/protobuf";
import { FieldInfo, FieldList, isFieldSet } from "./field.js";
import { isCompleteMessage } from "./is-message.js";
import { handleUnknownField, unknownFieldsSymbol } from "./unknown.js";
import { wrapField } from "./field-wrapper.js";
import { scalarZeroValue } from "./scalar.js";
import { assert } from "./assert.js";

export function readField(
  target: Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- `any` is the best choice for dynamic access
  reader: IBinaryReader,
  field: FieldInfo,
  wireType: WireType,
  options: BinaryReadOptions,
): void {
  let { repeated, localName } = field;
  if (field.oneof) {
    var oneofMsg = target[field.oneof.localName];
    if (!oneofMsg) {
      oneofMsg = target[field.oneof.localName] = {};
    }
    target = oneofMsg;
    if (target.case != localName) {
      delete target.value;
    }
    target.case = localName;
    localName = "value";
  }
  switch (field.kind) {
    case "scalar":
    case "enum":
      const scalarType = field.kind == "enum" ? ScalarType.INT32 : field.T;
      let read = readScalar;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- acceptable since it's covered by tests
      if (field.kind == "scalar" && field.L > 0) {
        read = readScalarLTString;
      }
      if (repeated) {
        var tgtArr = target[localName];
        if (!Array.isArray(tgtArr)) {
          tgtArr = target[localName] = [];
        }
        const isPacked =
          wireType == WireType.LengthDelimited &&
          scalarType != ScalarType.STRING &&
          scalarType != ScalarType.BYTES;
        if (isPacked) {
          let e = reader.uint32() + reader.pos;
          while (reader.pos < e) {
            tgtArr.push(read(reader, scalarType));
          }
        } else {
          tgtArr.push(read(reader, scalarType));
        }
      } else {
        target[localName] = read(reader, scalarType);
      }
      break;
    case "message":
      const messageType = field.T;
      if (repeated) {
        var tgtArr = target[localName];
        if (!Array.isArray(tgtArr)) {
          tgtArr = target[localName] = [];
        }
        tgtArr.push(
          readMessageField(
            reader,
            messageType.create(),
            messageType.fields,
            options,
            field,
          ),
        );
      } else {
        if (isCompleteMessage(target[localName], messageType.fields.list())) {
          readMessageField(
            reader,
            target[localName],
            messageType.fields,
            options,
            field,
          );
        } else {
          target[localName] = readMessageField(
            reader,
            messageType.create(),
            messageType.fields,
            options,
            field,
          );
          if (messageType.fieldWrapper && !field.oneof && !field.repeated) {
            target[localName] = messageType.fieldWrapper.unwrapField(
              target[localName],
            );
          }
        }
      }
      break;
    case "map":
      let [mapKey, mapVal] = readMapEntry(field, reader, options);
      if (typeof target[localName] !== "object") {
        target[localName] = {};
      }
      // safe to assume presence of map object, oneof cannot contain repeated values
      target[localName][mapKey] = mapVal;
      break;
  }
}

/**
 * AnyMessage is an interface implemented by all messages. If you need to
 * handle messages of unknown type, this interface provides a convenient
 * index signature to access fields with message["fieldname"].
 */
type AnyMessage = {
  [k: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- `any` is the best choice for dynamic access
};

// Read a map field, expecting key field = 1, value field = 2
export function readMapEntry(
  field: FieldInfo & { kind: "map" },
  reader: IBinaryReader,
  options: BinaryReadOptions,
): [string | number, ScalarValue | AnyMessage] {
  const length = reader.uint32(),
    end = reader.pos + length;
  let key: ScalarValue | undefined, val: ScalarValue | AnyMessage | undefined;
  while (reader.pos < end) {
    const [fieldNo] = reader.tag();
    switch (fieldNo) {
      case 1:
        key = readScalar(reader, field.K);
        break;
      case 2:
        switch (field.V.kind) {
          case "scalar":
            val = readScalar(reader, field.V.T);
            break;
          case "enum":
            val = reader.int32();
            break;
          case "message":
            val = readMessageField(
              reader,
              field.V.T.create(),
              field.V.T.fields,
              options,
              undefined,
            );
            break;
        }
        break;
    }
  }
  if (key === undefined) {
    key = scalarZeroValue(field.K, LongType.BIGINT);
  }
  if (typeof key != "string" && typeof key != "number") {
    key = key.toString();
  }
  if (val === undefined) {
    switch (field.V.kind) {
      case "scalar":
        val = scalarZeroValue(field.V.T, LongType.BIGINT);
        break;
      case "enum":
        val = field.V.T.values[0].no;
        break;
      case "message":
        val = field.V.T.create();
        break;
    }
  }
  return [key, val];
}

export function readScalar(
  reader: IBinaryReader,
  type: ScalarType,
): ScalarValue {
  switch (type) {
    case ScalarType.STRING:
      return reader.string();
    case ScalarType.BOOL:
      return reader.bool();
    case ScalarType.DOUBLE:
      return reader.double();
    case ScalarType.FLOAT:
      return reader.float();
    case ScalarType.INT32:
      return reader.int32();
    case ScalarType.INT64:
      return reader.int64();
    case ScalarType.UINT64:
      return reader.uint64();
    case ScalarType.FIXED64:
      return reader.fixed64();
    case ScalarType.BYTES:
      return reader.bytes();
    case ScalarType.FIXED32:
      return reader.fixed32();
    case ScalarType.SFIXED32:
      return reader.sfixed32();
    case ScalarType.SFIXED64:
      return reader.sfixed64();
    case ScalarType.SINT64:
      return reader.sint64();
    case ScalarType.UINT32:
      return reader.uint32();
    case ScalarType.SINT32:
      return reader.sint32();
  }
}

// Read a scalar value, but return 64 bit integral types (int64, uint64,
// sint64, fixed64, sfixed64) as string instead of bigint.
export function readScalarLTString(
  reader: IBinaryReader,
  type: ScalarType,
): Exclude<ScalarValue, bigint> {
  const v = readScalar(reader, type);
  return typeof v == "bigint" ? v.toString() : v;
}

// Read a message, avoiding MessageType.fromBinary() to re-use the
// BinaryReadOptions and the IBinaryReader.
function readMessageField<T>(
  reader: IBinaryReader,
  message: T,
  fields: FieldList,
  options: BinaryReadOptions,
  field: { kind: "message"; no: number; delimited?: boolean } | undefined,
): T {
  const delimited = field?.delimited;
  readMessage(
    message,
    fields,
    reader,
    delimited ? field.no : reader.uint32(), // eslint-disable-line @typescript-eslint/strict-boolean-expressions
    options,
    delimited,
  );
  return message;
}

// Default options for parsing binary data.
const readDefaults: Readonly<BinaryReadOptions> = {
  readUnknownFields: true,
  readerFactory: (bytes) => new BinaryReader(bytes),
};

// Default options for serializing binary data.
const writeDefaults: Readonly<BinaryWriteOptions> = {
  writeUnknownFields: true,
  writerFactory: () => new BinaryWriter(),
};

export function makeReadOptions(
  options?: Partial<BinaryReadOptions>,
): Readonly<BinaryReadOptions> {
  return options ? { ...readDefaults, ...options } : readDefaults;
}

export function makeWriteOptions(
  options?: Partial<BinaryWriteOptions>,
): Readonly<BinaryWriteOptions> {
  return options ? { ...writeDefaults, ...options } : writeDefaults;
}

export function readMessage<T>(
  message: T,
  fields: FieldList,
  reader: IBinaryReader,
  lengthOrEndTagFieldNo: number,
  options: BinaryReadOptions,
  delimitedMessageEncoding?: boolean,
) {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  const end = delimitedMessageEncoding
    ? reader.len
    : reader.pos + lengthOrEndTagFieldNo;
  let fieldNo: number | undefined, wireType: WireType | undefined;
  while (reader.pos < end) {
    [fieldNo, wireType] = reader.tag();
    if (wireType == WireType.EndGroup) {
      break;
    }
    const field = fields.find(fieldNo);
    if (!field) {
      const data = reader.skip(wireType);
      if (options.readUnknownFields) {
        handleUnknownField(message as AnyMessage, fieldNo, wireType, data);
      }
      continue;
    }
    readField(message as AnyMessage, reader, field, wireType, options);
  }
  if (
    delimitedMessageEncoding && // eslint-disable-line @typescript-eslint/strict-boolean-expressions
    (wireType != WireType.EndGroup || fieldNo !== lengthOrEndTagFieldNo)
  ) {
    throw new Error(`invalid end group tag`);
  }
}

/**
 * Serialize a message to binary data.
 */
export function writeMessage<T>(
  message: T,
  fields: FieldList,
  writer: IBinaryWriter,
  options: BinaryWriteOptions,
) {
  for (const field of fields.byNumber()) {
    if (!isFieldSet(field, message as Record<string, any>)) {
      if (field.req) {
        throw new Error(
          `cannot encode field ${field.name} to binary: required field not set`,
        );
      }
      continue;
    }
    const value = field.oneof
      ? (message as AnyMessage)[field.oneof.localName].value
      : (message as AnyMessage)[field.localName];
    writeField(field, value, writer, options);
  }
  if (options.writeUnknownFields) {
    writeUnknownFields(message, writer);
  }
}

function writeField<T>(
  field: FieldInfo,
  value: T,
  writer: IBinaryWriter,
  options: BinaryWriteOptions,
) {
  assert(value !== undefined);
  const repeated = field.repeated;
  switch (field.kind) {
    case "scalar":
    case "enum":
      let scalarType = field.kind == "enum" ? ScalarType.INT32 : field.T;
      if (repeated) {
        assert(Array.isArray(value));
        if (field.packed) {
          writePacked(writer, scalarType, field.no, value);
        } else {
          for (const item of value) {
            writeScalar(writer, scalarType, field.no, item);
          }
        }
      } else {
        writeScalar(writer, scalarType, field.no, value);
      }
      break;
    case "message":
      if (repeated) {
        assert(Array.isArray(value));
        for (const item of value) {
          writeMessageField(writer, options, field, item);
        }
      } else {
        writeMessageField<T>(writer, options, field, value);
      }
      break;
    case "map":
      assert(typeof value == "object" && value != null);
      for (const [key, val] of Object.entries(value)) {
        writeMapEntry(writer, options, field, key, val);
      }
      break;
  }
}

function writeUnknownFields<T>(message: T, writer: IBinaryWriter): void {
  const m = message as any;
  const c = m[unknownFieldsSymbol] as any[] | undefined;
  if (c) {
    for (const f of c) {
      writer.tag(f.no, f.wireType).raw(f.data);
    }
  }
}

// Value must not be undefined
function writeMessageField<T>(
  writer: IBinaryWriter,
  options: BinaryWriteOptions,
  field: FieldInfo & { kind: "message" },
  value: T,
): void {
  const message = wrapField(field.T.fieldWrapper, value);
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (field.delimited)
    writer
      .tag(field.no, WireType.StartGroup)
      .raw(field.T.toBinary(message, options))
      .tag(field.no, WireType.EndGroup);
  else
    writer
      .tag(field.no, WireType.LengthDelimited)
      .bytes(field.T.toBinary(message, options));
}

function writeScalar(
  writer: IBinaryWriter,
  type: ScalarType,
  fieldNo: number,
  value: unknown,
): void {
  assert(value !== undefined);
  let [wireType, method] = scalarTypeInfo(type);
  (writer.tag(fieldNo, wireType)[method] as any)(value);
}

function writePacked<T>(
  writer: IBinaryWriter,
  type: ScalarType,
  fieldNo: number,
  value: T[],
): void {
  if (!value.length) {
    return;
  }
  writer.tag(fieldNo, WireType.LengthDelimited).fork();
  let [, method] = scalarTypeInfo(type);
  for (let i = 0; i < value.length; i++) {
    (writer[method] as any)(value[i]);
  }
  writer.join();
}

/**
 * Get information for writing a scalar value.
 *
 * Returns tuple:
 * [0]: appropriate WireType
 * [1]: name of the appropriate method of IBinaryWriter
 * [2]: whether the given value is a default value for proto3 semantics
 *
 * If argument `value` is omitted, [2] is always false.
 */
// TODO replace call-sites writeScalar() and writePacked(), then remove
function scalarTypeInfo(
  type: ScalarType,
): [
  WireType,
  Exclude<keyof IBinaryWriter, "tag" | "raw" | "fork" | "join" | "finish">,
] {
  let wireType = WireType.Varint;
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- INT32, UINT32, SINT32 are covered by the defaults
  switch (type) {
    case ScalarType.BYTES:
    case ScalarType.STRING:
      wireType = WireType.LengthDelimited;
      break;
    case ScalarType.DOUBLE:
    case ScalarType.FIXED64:
    case ScalarType.SFIXED64:
      wireType = WireType.Bit64;
      break;
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
    case ScalarType.FLOAT:
      wireType = WireType.Bit32;
      break;
  }
  const method = ScalarType[type].toLowerCase() as Exclude<
    keyof IBinaryWriter,
    "tag" | "raw" | "fork" | "join" | "finish"
  >;
  return [wireType, method];
}

export function writeMapEntry(
  writer: IBinaryWriter,
  options: BinaryWriteOptions,
  field: FieldInfo & { kind: "map" },
  key: string,
  value: any,
): void {
  writer.tag(field.no, WireType.LengthDelimited);
  writer.fork();

  // javascript only allows number or string for object properties
  // we convert from our representation to the protobuf type
  let keyValue: ScalarValue = key;
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- we deliberately handle just the special cases for map keys
  switch (field.K) {
    case ScalarType.INT32:
    case ScalarType.FIXED32:
    case ScalarType.UINT32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
      keyValue = Number.parseInt(key);
      break;
    case ScalarType.BOOL:
      assert(key == "true" || key == "false");
      keyValue = key == "true";
      break;
  }

  // write key, expecting key field number = 1
  writeScalar(writer, field.K, 1, keyValue);

  // write value, expecting value field number = 2
  switch (field.V.kind) {
    case "scalar":
      writeScalar(writer, field.V.T, 2, value);
      break;
    case "enum":
      writeScalar(writer, ScalarType.INT32, 2, value);
      break;
    case "message":
      assert(value !== undefined);
      writer
        .tag(2, WireType.LengthDelimited)
        .bytes(field.V.T.toBinary(value, options));
      break;
  }

  writer.join();
}
