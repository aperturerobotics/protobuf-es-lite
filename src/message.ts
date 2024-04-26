// Copyright 2021-2024 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  BinaryReadOptions,
  JsonReadOptions,
  JsonValue,
  MessageType as BufMessageType,
  BinaryWriteOptions,
  JsonWriteOptions,
  JsonWriteStringOptions,
  ScalarType,
} from "@bufbuild/protobuf";
import {
  FieldInfo,
  FieldList,
  FieldListSource,
  OneofInfo,
  newFieldList,
} from "./field.js";
import { applyPartialMessage } from "./partial.js";
import { scalarEquals } from "./scalar.js";
import {
  makeReadOptions as makeBinaryReadOptions,
  readMessage as readBinaryMessage,
  makeWriteOptions as makeBinaryWriteOptions,
  writeMessage as writeBinaryMessage,
} from "./binary.js";
import {
  makeReadOptions as makeJsonReadOptions,
  readMessage as readJsonMessage,
  makeWriteOptions as makeJsonWriteOptions,
  writeMessage as writeJsonMessage,
} from "./json.js";

/**
 * PartialMessage<T> constructs a type from a message. The resulting type
 * only contains the protobuf field members of the message, and all of them
 * are optional.
 *
 * Note that the optionality of the fields is the only difference between
 * PartialMessage and PlainMessage.
 *
 * PartialMessage is similar to the built-in type Partial<T>, but recursive,
 * and respects `oneof` groups.
 */
export type Message<T extends Message<T>> = {
  [k: string]: Field<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- `any` is the best choice for dynamic access
};

/**
 * AnyMessage is an interface implemented by all messages. If you need to
 * handle messages of unknown type, this interface provides a convenient
 * index signature to access fields with message["fieldname"].
 */
export interface AnyMessage extends Message<AnyMessage> {
  [k: string]: Field<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- `any` is the best choice for dynamic access
}

export type Field<F> = F extends
  | Date
  | Uint8Array
  | bigint
  | boolean
  | string
  | number
  ? F
  : F extends Array<infer U>
    ? Array<Field<U>>
    : F extends ReadonlyArray<infer U>
      ? ReadonlyArray<Field<U>>
      : F extends CompleteMessage<infer U>
        ? Message<U>
        : F extends OneofSelectedMessage<infer C, infer V>
          ? { case: C; value: Message<V> }
          : F extends { case: string | undefined; value?: unknown }
            ? F
            : F extends { [key: string | number]: CompleteMessage<infer U> }
              ? { [key: string | number]: Message<U> }
              : F;

/**
 * CompleteMessage<T> constructs a type from a message which requires all fields
 * be present in the object recursively (including zero values if unset).
 *
 * This type corresponds to Message in protobuf-es.
 */
export type CompleteMessage<T extends Message<T>> = {
  // eslint-disable-next-line @typescript-eslint/ban-types -- we use `Function` to identify methods
  [P in keyof T as T[P] extends Function ? never : P]?: CompleteField<T[P]>;
};

export type CompleteField<F> = F extends
  | Date
  | Uint8Array
  | bigint
  | boolean
  | string
  | number
  ? F
  : F extends Array<infer U>
    ? Array<Field<U>>
    : F extends ReadonlyArray<infer U>
      ? ReadonlyArray<Field<U>>
      : F extends CompleteMessage<infer U>
        ? CompleteMessage<U>
        : F extends OneofSelectedMessage<infer C, infer V>
          ? { case: C; value: CompleteMessage<V> }
          : F extends { case: string | undefined; value?: unknown }
            ? F
            : F extends { [key: string | number]: CompleteMessage<infer U> }
              ? { [key: string | number]: CompleteMessage<U> }
              : F;

type OneofSelectedMessage<K extends string, M extends Message<M>> = {
  case: K;
  value: M;
};

/**
 * MessageType represents a protobuf message declaration. It provides:
 * - a constructor that produces an instance of the message
 * - metadata for reflection-based operations
 * - common functionality like serialization
 */
export interface MessageType<T extends Message<T> = AnyMessage>
  extends Pick<BufMessageType, "fieldWrapper"> {
  /**
   * The fully qualified name of the message.
   */
  readonly typeName: string;

  /**
   * Field metadata.
   */
  readonly fields: FieldList;

  /**
   * Create a new instance of this message with zero values for fields.
   */
  create(partial?: Message<T>): T;

  /**
   * Create a deep copy.
   */
  clone(a: T | undefined | null): T | undefined | null;

  /**
   * Parse from binary data, merging fields.
   *
   * Repeated fields are appended. Map entries are added, overwriting
   * existing keys.
   *
   * If a message field is already present, it will be merged with the
   * new data.
   */
  fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): T;

  /**
   * Parse a message from a JSON value.
   */
  fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): T;

  /**
   * Parse a message from a JSON string.
   */
  fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): T;

  /**
   * Returns true if the given arguments have equal field values, recursively.
   * Will also return true if both messages are `undefined` or `null`.
   */
  equals(a: T | undefined | null, b: T | undefined | null): boolean;

  /**
   * Serialize the message to binary data.
   */
  toBinary(a: T, options?: Partial<BinaryWriteOptions>): Uint8Array;

  /**
   * Serialize the message to a JSON value, a JavaScript value that can be
   * passed to JSON.stringify().
   */
  toJson(a: T, options?: Partial<JsonWriteOptions>): JsonValue;

  /**
   * Serialize the message to a JSON string.
   */
  toJsonString(a: T, options?: Partial<JsonWriteStringOptions>): string;
}

// MessageTypeParams are parameters passed to the message type constructor.
export interface MessageTypeParams<T extends Message<T>>
  extends Pick<MessageType<T>, "typeName" | "fieldWrapper"> {
  /**
   * Fields contains the list of message fields.
   */
  fields: FieldListSource;
  /**
   * `packedByDefault` specifies whether fields that do not specify `packed`
   * should be packed (proto3) or unpacked (proto2).
   */
  packedByDefault: boolean;
  /**
   * `delimitedMessageEncoding` specifies whether fields are encoded without
   * delimited fields (proto3) or with (proto2 legacy).
   */
  delimitedMessageEncoding?: boolean;
  /**
   * Serialize the message to a JSON value, a JavaScript value that can be
   * passed to JSON.stringify().
   *
   * When passed as MessageTypeParams this will override the default serializer behavior.
   */
  toJson?: MessageType<T>["toJson"];
}

// compareMessages compares two messages for equality.
export function compareMessages<T extends Message<T>>(
  fields: FieldList,
  a: T | undefined | null,
  b: T | undefined | null,
): boolean {
  if (a == null && b == null) {
    return true;
  }
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return fields.byMember().every((m) => {
    const va = (a as any)[m.localName];
    const vb = (b as any)[m.localName];
    if (m.repeated) {
      if (va.length !== vb.length) {
        return false;
      }
      // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- repeated fields are never "map"
      switch (m.kind) {
        case "message":
          const messageType = typeof m.T === "function" ? m.T() : m.T;
          return (va as any[]).every((a, i) => messageType.equals(a, vb[i]));
        case "scalar":
          return (va as any[]).every((a: any, i: number) =>
            scalarEquals(m.T, a, vb[i]),
          );
        case "enum":
          return (va as any[]).every((a: any, i: number) =>
            scalarEquals(ScalarType.INT32, a, vb[i]),
          );
      }
      throw new Error(`repeated cannot contain ${m.kind}`);
    }
    switch (m.kind) {
      case "message":
        return (typeof m.T === "function" ? m.T() : m.T).equals(va, vb);
      case "enum":
        return scalarEquals(ScalarType.INT32, va, vb);
      case "scalar":
        return scalarEquals(m.T, va, vb);
      case "oneof":
        if (va.case !== vb.case) {
          return false;
        }
        const s = m.findField(va.case);
        if (s === undefined) {
          return true;
        }
        // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- oneof fields are never "map"
        switch (s.kind) {
          case "message":
            const messageType = typeof s.T === "function" ? s.T() : s.T;
            return messageType.equals(va.value, vb.value);
          case "enum":
            return scalarEquals(ScalarType.INT32, va.value, vb.value);
          case "scalar":
            return scalarEquals(s.T, va.value, vb.value);
        }
        throw new Error(`oneof cannot contain ${s.kind}`);
      case "map":
        const keys = Object.keys(va).concat(Object.keys(vb));
        switch (m.V.kind) {
          case "message":
            const messageType = typeof m.V.T === "function" ? m.V.T() : m.V.T;
            return keys.every((k) => messageType.equals(va[k], vb[k]));
          case "enum":
            return keys.every((k) =>
              scalarEquals(ScalarType.INT32, va[k], vb[k]),
            );
          case "scalar":
            const scalarType = m.V.T;
            return keys.every((k) => scalarEquals(scalarType, va[k], vb[k]));
        }
    }
  });
}

// clone a single field value - i.e. the element type of repeated fields, the value type of maps
function cloneSingularField(value: any, fieldInfo: FieldInfo | OneofInfo): any {
  if (value === undefined) {
    return value;
  }
  if (fieldInfo.kind === "message") {
    const messageType =
      typeof fieldInfo.T === "function" ? fieldInfo.T() : fieldInfo.T;
    return cloneMessage(value, messageType.fields);
  }
  if (fieldInfo.kind === "oneof") {
    if (value.case === undefined) {
      return undefined;
    }
    const selectedField = fieldInfo.findField(value.case);
    if (!selectedField) {
      throw new Error(
        `Invalid oneof case "${value.case}" for ${fieldInfo.name}`,
      );
    }
    return {
      case: value.case,
      value: cloneSingularField(value.value, selectedField),
    };
  }
  if (value instanceof Uint8Array) {
    const c = new Uint8Array(value.byteLength);
    c.set(value);
    return c;
  }
  return value;
}

// TODO use isFieldSet() here to support future field presence
export function cloneMessage<T extends Message<T>>(
  message: T,
  fields: FieldList,
): T {
  const clone = {} as T;
  for (const member of fields.byMember()) {
    const source = (message as AnyMessage)[member.localName];
    let copy: any;
    if (member.repeated) {
      copy = (source as any[]).map((v) => cloneSingularField(v, member));
    } else if (member.kind == "map") {
      copy = {};
      for (const [key, v] of Object.entries(source)) {
        copy[key] = cloneSingularField(v, member);
      }
    } else if (member.kind == "oneof") {
      const f = member.findField(source.case);
      copy = f
        ? { case: source.case, value: cloneSingularField(source.value, member) }
        : { case: undefined };
    } else {
      copy = cloneSingularField(source, member);
    }
    (clone as AnyMessage)[member.localName] = copy;
  }
  return clone;
}

/**
 * createMessageType creates a new message type.
 *
 * The argument `packedByDefault` specifies whether fields that do not specify
 * `packed` should be packed (proto3) or unpacked (proto2).
 */
export function createMessageType<T extends Message<T>>(
  params: MessageTypeParams<T>,
): MessageType<T> {
  const {
    fields: fieldsSource,
    typeName,
    packedByDefault,
    delimitedMessageEncoding,
    fieldWrapper,
  } = params;
  const fields = newFieldList(fieldsSource, packedByDefault);

  const mt = {
    typeName,
    fields,
    fieldWrapper,

    create(partial?: Message<T>): T {
      const message = createMessage<T>(fields);
      applyPartialMessage(partial, message, fields);
      return message;
    },

    equals(a: T | undefined | null, b: T | undefined | null): boolean {
      return compareMessages(fields, a, b);
    },

    clone(a: T | undefined | null): T | undefined | null {
      if (a == null) {
        return a;
      }
      return cloneMessage(a, fields);
    },

    fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): T {
      const message = this.create();
      const opt = makeBinaryReadOptions(options);
      readBinaryMessage(
        message,
        fields,
        opt.readerFactory(bytes),
        bytes.byteLength,
        opt,
        delimitedMessageEncoding,
      );
      return message;
    },

    fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): T {
      const message = this.create();
      const opts = makeJsonReadOptions(options);
      readJsonMessage(fields, typeName, jsonValue, opts, message);
      return message;
    },

    fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): T {
      let json: JsonValue;
      try {
        json = JSON.parse(jsonString) as JsonValue;
      } catch (e) {
        throw new Error(
          `cannot decode ${typeName} from JSON: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
      return this.fromJson(json, options);
    },

    toBinary(a: T, options?: Partial<BinaryWriteOptions>): Uint8Array {
      const opt = makeBinaryWriteOptions(options);
      const writer = opt.writerFactory();
      writeBinaryMessage(a, fields, writer, opt);
      return writer.finish();
    },

    toJson(a: T, options?: Partial<JsonWriteOptions>): JsonValue {
      const opt = makeJsonWriteOptions(options);
      return writeJsonMessage(a, fields, opt);
    },

    toJsonString(a: T, options?: Partial<JsonWriteStringOptions>): string {
      const value = this.toJson(a, options);
      return JSON.stringify(value, null, options?.prettySpaces ?? 0);
    },
  };

  if (params.toJson) {
    mt.toJson = params.toJson;
  }

  return mt;
}

/**
 * createMessage recursively builds a message filled with zero values based on the given FieldList.
 */
function createMessage<T extends Message<T>>(fields: FieldList): T {
  const message = {} as T;
  for (const field of fields.list()) {
    const fieldKind = field.kind;
    switch (fieldKind) {
      case "scalar":
        message[field.localName as keyof T] = (
          field.T == ScalarType.BOOL ? false : 0
        ) as T[keyof T];
        break;
      case "enum":
        message[field.localName as keyof T] = 0 as T[keyof T];
        break;
      case "message":
        if (field.oneof) {
          // leave oneofs undefined
          message[field.localName as keyof T] = undefined as T[keyof T];
          continue;
        }
        const messageType = typeof field.T === "function" ? field.T() : field.T;
        message[field.localName as keyof T] = createMessage(
          messageType.fields,
        ) as T[keyof T];
        break;
      case "map":
        message[field.localName as keyof T] = {} as T[keyof T];
        break;
      default:
        field satisfies never;
    }
  }
  return message;
}
