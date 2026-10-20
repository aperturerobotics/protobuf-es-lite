import {
  BinaryReader,
  BinaryWriter,
  WireType,
  type Writer,
} from "./binary-encoding.js";
import type { FieldDesc, Fields, MessageCodec, Obj } from "./codec.js";
import {
  cloneFields,
  decodeFields,
  encodeFields,
  equalsFields,
  readJsonFields,
  resolveFields,
  writeJsonFields,
} from "./codec.js";
import type {
  JsonReadOptions,
  JsonValue,
  JsonWriteOptions,
  JsonWriteStringOptions,
} from "./json.js";

export type Field<T> =
  T extends Date | Uint8Array | bigint | boolean | string | number ? T
  : T extends Array<infer U> ? Array<Field<U>>
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<Field<U>>
  : T extends { case: string; value: any } ?
    OneofSelectedMessage<T["case"], T["value"]>
  : T extends object ? Message<T>
  : never;

export type OneofSelectedMessage<C extends string, V> = {
  case: C;
  value: Field<V>;
};

export type Message<T extends object> = {
  [K in keyof T]?: Field<T[K]>;
};

export type CompleteMessage<T extends object> = {
  [K in keyof T]-?: Field<T[K]>;
};

// AnyMessage is a message with arbitrary field names and values.
export type AnyMessage = {
  [key: string]: any | undefined;
};

/**
 * MessageType is a generated message type: the codec its field descriptions
 * drive, and the conversions built on it. Every function works on a message
 * that may have any field unset.
 */
export interface MessageType<T = AnyMessage> {
  /** The fully qualified name of the message. */
  readonly typeName: string;

  /** The untyped form of this type, which field descriptions refer to. */
  readonly codec: MessageCodec;

  /** Write every set field of m to w, in field-number order. */
  encode(m: T, w: Writer): void;

  /**
   * Read fields from r into m until offset end or an end-group tag, and return
   * m. Repeated fields append, map entries overwrite, and message fields merge.
   */
  decode(r: BinaryReader, end: number, m: T): T;

  /** Convert m to its JSON value. */
  writeJson(m: T, o: JsonWriteOptions): JsonValue;

  /** Read the JSON value j into m and return m. */
  readJson(j: JsonValue, o: JsonReadOptions, m: T): T;

  /** Return a deep copy of partial, or an empty message. */
  create(partial?: T): T;

  /** Return a deep copy of a; null and undefined give an empty message. */
  clone(a: T | null | undefined): T;

  /**
   * Return true if a and b have equal field values, recursively. An unset
   * field equals its zero value and a null message equals an empty one, so a
   * message equals its own binary or JSON round trip.
   */
  equals(a: T | null | undefined, b: T | null | undefined): boolean;

  /** Encode a message to binary. Null and undefined encode as empty. */
  toBinary(a: T | null | undefined): Uint8Array;

  /**
   * Decode a message from binary. Decoded bytes fields are views into the
   * input, so they change if the input does.
   */
  fromBinary(bytes: Uint8Array | null | undefined): T;

  /** Convert a message to a JSON value that JSON.stringify accepts. */
  toJson(a: T | null | undefined, options?: JsonWriteOptions): JsonValue;

  /** Encode a message to a JSON string. */
  toJsonString(
    a: T | null | undefined,
    options?: JsonWriteStringOptions,
  ): string;

  /** Decode a message from a JSON value. */
  fromJson(json: JsonValue | null | undefined, options?: JsonReadOptions): T;

  /** Decode a message from a JSON string. */
  fromJsonString(json: string | null | undefined, options?: JsonReadOptions): T;

  /**
   * Write m as field fieldNo of an enclosing message, length-delimited. An
   * unset m writes nothing.
   */
  writeField(w: Writer, fieldNo: number, m: T | null | undefined): void;

  /** Write m as group field fieldNo of an enclosing message. */
  writeGroup(w: Writer, fieldNo: number, m: T | null | undefined): void;
}

/**
 * MessageOverrides replaces parts of a generated message type: a typed
 * encoder and decoder generated for the message, and the JSON form and plain
 * field value of a well-known type.
 */
export interface MessageOverrides<T> {
  encode?(m: T, w: Writer): void;
  decode?(r: BinaryReader, end: number, m: T): T;
  writeJson?(m: T, o: JsonWriteOptions): JsonValue;
  readJson?(j: JsonValue, o: JsonReadOptions, m: T): T;
  /** Convert the message to the value fields hold in its place. */
  unwrap?(m: T): unknown;
  /** Convert a value fields hold back to the message. */
  wrap?(v: unknown): T;
}

/**
 * createMessageType builds a message type from the descriptions of its
 * fields. fields is called once, on first use, so descriptions may refer to
 * types declared after this one.
 */
export function createMessageType<T>(
  typeName: string,
  fields: () => readonly FieldDesc[],
  overrides?: MessageOverrides<T>,
): MessageType<T> {
  let resolved: Fields | undefined;
  const fs = (): Fields => {
    let r = resolved;
    if (r === undefined) {
      r = resolveFields(fields());
      resolved = r;
    }
    return r;
  };
  const codec: MessageCodec = {
    typeName,
    fields: fs,
    unwrap:
      overrides?.unwrap ?
        (m: Obj): unknown => overrides.unwrap!(m as T)
      : undefined,
    wrap:
      overrides?.wrap ?
        (v: unknown): Obj => overrides.wrap!(v) as Obj
      : undefined,
    encode:
      overrides?.encode ?
        (m: Obj, w: Writer): void => overrides.encode!(m as T, w)
      : (m: Obj, w: Writer): void => encodeFields(fs(), m, w),
    decode:
      overrides?.decode ?
        (r: BinaryReader, end: number, m: Obj): Obj =>
          overrides.decode!(r, end, m as T) as Obj
      : (r: BinaryReader, end: number, m: Obj): Obj =>
          decodeFields(fs(), r, end, m),
    equals: (a: Obj, b: Obj): boolean => equalsFields(fs(), a, b),
    clone: (m: Obj): Obj => cloneFields(fs(), m),
    writeJson:
      overrides?.writeJson ?
        (m: Obj, o: JsonWriteOptions): JsonValue =>
          overrides.writeJson!(m as T, o)
      : (m: Obj, o: JsonWriteOptions): JsonValue => writeJsonFields(fs(), m, o),
    readJson:
      overrides?.readJson ?
        (j: JsonValue, o: JsonReadOptions, m: Obj): Obj =>
          overrides.readJson!(j, o, m as T) as Obj
      : (j: JsonValue, o: JsonReadOptions, m: Obj): Obj =>
          readJsonFields(fs(), typeName, j, o, m),
  };
  const empty = (): T => ({}) as T;
  const encode = (m: T, w: Writer): void => codec.encode(m as Obj, w);
  const decode = (r: BinaryReader, end: number, m: T): T =>
    codec.decode(r, end, m as Obj) as T;
  const writeJson = (m: T, o: JsonWriteOptions): JsonValue =>
    codec.writeJson(m as Obj, o);
  const readJson = (j: JsonValue, o: JsonReadOptions, m: T): T =>
    codec.readJson(j, o, m as Obj) as T;
  const toJson = (
    a: T | null | undefined,
    options?: JsonWriteOptions,
  ): JsonValue => writeJson(a ?? empty(), options ?? {});
  const fromJson = (
    json: JsonValue | null | undefined,
    options?: JsonReadOptions,
  ): T => {
    if (json == null) {
      return empty();
    }
    try {
      return readJson(json, options ?? {}, empty());
    } catch (e) {
      throw jsonError(typeName, e);
    }
  };
  const clone = (a: T | null | undefined): T =>
    a ? (codec.clone(a as Obj) as T) : empty();
  return {
    typeName,
    codec,
    encode,
    decode,
    writeJson,
    readJson,
    create: clone,
    clone,
    equals: (a: T | null | undefined, b: T | null | undefined): boolean =>
      a === b ||
      codec.equals(a == null ? {} : (a as Obj), b == null ? {} : (b as Obj)),
    toBinary: (a: T | null | undefined): Uint8Array => {
      const w = new BinaryWriter();
      if (a) {
        encode(a, w);
      }
      return w.finish();
    },
    fromBinary: (bytes: Uint8Array | null | undefined): T => {
      if (!bytes) {
        return empty();
      }
      const r = new BinaryReader(bytes);
      return decode(r, r.len, empty());
    },
    toJson,
    toJsonString: (
      a: T | null | undefined,
      options?: JsonWriteStringOptions,
    ): string =>
      JSON.stringify(toJson(a, options), null, options?.prettySpaces ?? 0),
    fromJson,
    fromJsonString: (
      json: string | null | undefined,
      options?: JsonReadOptions,
    ): T => {
      if (!json) {
        return empty();
      }
      let parsed: JsonValue;
      try {
        parsed = JSON.parse(json) as JsonValue;
      } catch (e) {
        throw jsonError(typeName, e);
      }
      return fromJson(parsed, options);
    },
    writeField: (w: Writer, fieldNo: number, m: T | null | undefined): void => {
      if (m == null) {
        return;
      }
      const start = w.tag(fieldNo, WireType.LengthDelimited).fork();
      encode(m, w);
      w.join(start);
    },
    writeGroup: (w: Writer, fieldNo: number, m: T | null | undefined): void => {
      if (m == null) {
        return;
      }
      w.tag(fieldNo, WireType.StartGroup);
      encode(m, w);
      w.tag(fieldNo, WireType.EndGroup);
    },
  };
}

// jsonError prefixes a JSON decoding error with the message's type name.
function jsonError(typeName: string, e: unknown): Error {
  const reason = e instanceof Error ? e.message : String(e);
  return new Error(`cannot decode ${typeName} from JSON: ${reason}`, {
    cause: e,
  });
}

export { newMap } from "./codec.js";
