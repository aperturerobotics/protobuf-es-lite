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

import type { FieldListSource } from "./field.js";
import { FieldList, newFieldList, resolveMessageType } from "./field.js";
import { applyPartialMessage } from "./partial.js";
import {
  LongType,
  ScalarType,
  scalarEquals,
  scalarZeroValue,
} from "./scalar.js";
import type { BinaryReadOptions, BinaryWriteOptions } from "./binary.js";
import {
  binaryMakeReadOptions,
  binaryMakeWriteOptions,
  binaryReadMessage,
  binaryWriteMessage,
} from "./binary.js";
import type {
  JsonReadOptions,
  JsonValue,
  JsonWriteOptions,
  JsonWriteStringOptions,
} from "./json.js";
import {
  jsonMakeReadOptions,
  jsonMakeWriteOptions,
  jsonReadMessage,
  jsonWriteMessage,
} from "./json.js";
import type { FieldWrapper } from "./field-wrapper.js";
import type { MessageRecord } from "./message-access.js";
import { asMessageRecord, createMessageRecord } from "./message-access.js";
import { throwSanitizeKey } from "./names.js";
import { enumZeroValue } from "./enum.js";

type ScalarComparable = Parameters<typeof scalarEquals>[1];
type OneofRuntimeValue = {
  case?: string;
  value?: any;
};

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

// AnyMessage is a type that represents a message with arbitrary field names and values.
// It allows accessing fields dynamically using string keys.
export type AnyMessage = {
  [key: string]: any | undefined;
};

/**
 * MessageType represents a protobuf message declaration. It provides:
 * - a constructor that produces an instance of the message
 * - metadata for reflection-based operations
 * - common functionality like serialization
 */
export interface MessageType<T extends Message<T> = AnyMessage> {
  /**
   * The fully qualified name of the message.
   */
  readonly typeName: string;

  /**
   * Field metadata.
   */
  readonly fields: FieldList;

  /**
   * When used as a field, unwrap this message to a simple value.
   */
  readonly fieldWrapper?: FieldWrapper<T>;

  /**
   * Create a new empty instance of this message applying the partial message.
   */
  create(partial?: Message<T>): Message<T>;

  /**
   * Create a new instance of this message with zero values for fields.
   */
  createComplete(partial?: Message<T>): CompleteMessage<T>;

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
  fromBinary(
    bytes: Uint8Array | null | undefined,
    options?: Partial<BinaryReadOptions>,
  ): T;

  /**
   * Parse a message from a JSON value.
   */
  fromJson(
    jsonValue: JsonValue | null | undefined,
    options?: Partial<JsonReadOptions>,
  ): T;

  /**
   * Parse a message from a JSON string.
   */
  fromJsonString(
    jsonString: string | null | undefined,
    options?: Partial<JsonReadOptions>,
  ): T;

  /**
   * Returns true if the given arguments have equal field values, recursively.
   * Will also return true if both messages are `undefined` or `null`.
   */
  equals(a: T | undefined | null, b: T | undefined | null): boolean;

  /**
   * Serialize the message to binary data.
   */
  toBinary(
    a: Message<T> | undefined | null,
    options?: Partial<BinaryWriteOptions>,
  ): Uint8Array;

  /**
   * Serialize the message to a JSON value, a JavaScript value that can be
   * passed to JSON.stringify().
   */
  toJson(a: Message<T>, options?: Partial<JsonWriteOptions>): JsonValue;

  /**
   * Serialize the message to a JSON string.
   */
  toJsonString(
    a: Message<T>,
    options?: Partial<JsonWriteStringOptions>,
  ): string;
}

// MessageTypeParams are parameters passed to the message type constructor.
export type MessageTypeParams<T extends Message<T>> = Pick<
  MessageType<T>,
  "fieldWrapper" | "typeName"
> & {
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
};

/**
 * createMessageType creates a new message type.
 *
 * The argument `packedByDefault` specifies whether fields that do not specify
 * `packed` should be packed (proto3) or unpacked (proto2).
 */
export function createMessageType<
  T extends Message<T>,
  E extends Partial<MessageType<T>> = Partial<MessageType<T>>,
>(params: MessageTypeParams<T>, exts?: E): MessageType<T> & E {
  const {
    fields: fieldsSource,
    typeName,
    packedByDefault,
    delimitedMessageEncoding,
    fieldWrapper,
  } = params;
  const fields = newFieldList(fieldsSource as FieldListSource, packedByDefault);

  const mt: MessageType<T> = {
    typeName,
    fields,
    fieldWrapper,

    create(partial?: Message<T>): Message<T> {
      const message = Object.create(null) as Message<T>;
      applyPartialMessage(partial, message, fields);
      return message;
    },

    createComplete(partial?: Message<T>): CompleteMessage<T> {
      const message = createCompleteMessage<T>(fields);
      applyPartialMessage(partial, message as Message<T>, fields);
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

    fromBinary(
      bytes: Uint8Array | null | undefined,
      options?: Partial<BinaryReadOptions>,
    ): T {
      const message = {} as T;
      if (bytes && bytes.length) {
        const opt = binaryMakeReadOptions(options);
        binaryReadMessage(
          message,
          fields,
          opt.readerFactory(bytes),
          bytes.byteLength,
          opt,
          delimitedMessageEncoding ?? false,
        );
      }
      return message;
    },

    fromJson(
      jsonValue: JsonValue | null | undefined,
      options?: Partial<JsonReadOptions>,
    ): T {
      const message = {} as T;
      if (jsonValue != null) {
        const opts = jsonMakeReadOptions(options);
        jsonReadMessage(fields, typeName, jsonValue, opts, message);
      }
      return message;
    },

    fromJsonString(
      jsonString: string | null | undefined,
      options?: Partial<JsonReadOptions>,
    ) {
      let json: JsonValue | null = null;
      if (jsonString) {
        try {
          json = JSON.parse(jsonString) as JsonValue;
        } catch (e) {
          throw new Error(
            `cannot decode ${typeName} from JSON: ${
              e instanceof Error ? e.message : String(e)
            }`,
            { cause: e },
          );
        }
      }
      return mt.fromJson(json, options);
    },

    toBinary(
      a: T | undefined | null,
      options?: Partial<BinaryWriteOptions>,
    ): Uint8Array {
      if (a == null) return new Uint8Array(0);
      const opt = binaryMakeWriteOptions(options);
      const writer = opt.writerFactory();
      binaryWriteMessage(a, fields, writer, opt);
      return writer.finish();
    },

    toJson(a: T, options?: Partial<JsonWriteOptions>): JsonValue {
      const opt = jsonMakeWriteOptions(options);
      return jsonWriteMessage(a, fields, opt);
    },

    toJsonString(a: T, options?: Partial<JsonWriteStringOptions>): string {
      const value = mt.toJson(a, options);
      return JSON.stringify(value, null, options?.prettySpaces ?? 0);
    },

    ...(exts ?? {}),
  };
  return mt as MessageType<T> & E;
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
    const va = asMessageRecord(a)[m.localName];
    const vb = asMessageRecord(b)[m.localName];
    if (m.repeated) {
      const vaArray = va as unknown[] | undefined;
      const vbArray = vb as unknown[] | undefined;
      if ((vaArray?.length ?? 0) !== (vbArray?.length ?? 0)) {
        return false;
      }
      if (!vaArray?.length) {
        return true;
      }

      switch (m.kind) {
        case "message": {
          const messageType = resolveMessageType(m.T) as MessageType<any>;
          const values = vaArray as Message<AnyMessage>[];
          const otherValues = vbArray as Message<AnyMessage>[];
          return values.every((a, i) => messageType.equals(a, otherValues[i]));
        }
        case "scalar":
          return vaArray.every((a, i) =>
            scalarEquals(
              m.T,
              a as ScalarComparable,
              vbArray?.[i] as ScalarComparable,
            ),
          );
        case "enum":
          return vaArray.every((a, i) =>
            scalarEquals(
              ScalarType.INT32,
              a as ScalarComparable,
              vbArray?.[i] as ScalarComparable,
            ),
          );
      }
      throw new Error(`repeated cannot contain ${m.kind}`);
    }
    switch (m.kind) {
      case "message":
        return (resolveMessageType(m.T) as MessageType<any>).equals(va, vb);
      case "enum":
        return scalarEquals(
          ScalarType.INT32,
          va as ScalarComparable,
          vb as ScalarComparable,
        );
      case "scalar":
        return scalarEquals(
          m.T,
          va as ScalarComparable,
          vb as ScalarComparable,
        );
      case "oneof": {
        const oneofA = va as OneofRuntimeValue | undefined;
        const oneofB = vb as OneofRuntimeValue | undefined;
        if (oneofA?.case !== oneofB?.case) {
          return false;
        }
        if (oneofA == null) {
          return true;
        }
        const oneofCase = oneofA.case;
        if (oneofCase === undefined) {
          return true;
        }
        const s = m.findField(oneofCase);
        if (s === undefined) {
          return true;
        }

        switch (s.kind) {
          case "message": {
            const messageType = resolveMessageType(s.T) as MessageType<any>;
            return messageType.equals(oneofA.value, oneofB?.value);
          }
          case "enum":
            return scalarEquals(
              ScalarType.INT32,
              oneofA.value as ScalarComparable,
              oneofB?.value as ScalarComparable,
            );
          case "scalar":
            return scalarEquals(
              s.T,
              oneofA.value as ScalarComparable,
              oneofB?.value as ScalarComparable,
            );
        }
        throw new Error(`oneof cannot contain ${s.kind}`);
      }
      case "map": {
        const ma = (va ?? {}) as MessageRecord;
        const mb = (vb ?? {}) as MessageRecord;
        const keys = Object.keys(ma).concat(Object.keys(mb));
        switch (m.V.kind) {
          case "message": {
            const messageType = resolveMessageType(m.V.T);
            return keys.every((k) => messageType.equals(ma[k], mb[k]));
          }
          case "enum":
            return keys.every((k) =>
              scalarEquals(
                ScalarType.INT32,
                ma[k] as ScalarComparable,
                mb[k] as ScalarComparable,
              ),
            );
          case "scalar": {
            const scalarType = m.V.T;
            return keys.every((k) =>
              scalarEquals(
                scalarType,
                ma[k] as ScalarComparable,
                mb[k] as ScalarComparable,
              ),
            );
          }
        }
      }
    }
  });
}

export function cloneMessage<T extends Message<T>>(
  message: T | null | undefined,
  fields: FieldList,
): T | null {
  if (message == null) {
    return null;
  }
  const clone = createMessageRecord() as T;
  applyPartialMessage(message, clone, fields, true);
  return clone;
}

/**
 * createCompleteMessage recursively builds a message filled with zero values based on the given FieldList.
 */
export function createCompleteMessage<T extends Message<T>>(
  fields: FieldList,
): CompleteMessage<T> {
  const message = {} as AnyMessage;
  for (const field of fields.byMember()) {
    const { localName, kind: fieldKind } = field;
    throwSanitizeKey(localName);
    switch (fieldKind) {
      case "oneof":
        message[localName] = createMessageRecord();
        (message[localName] as MessageRecord).case = undefined;
        break;
      case "scalar":
        if (field.repeated) {
          message[localName] = [] as T[keyof T];
        } else {
          message[localName] = scalarZeroValue(field.T, LongType.BIGINT);
        }
        break;
      case "enum":
        message[localName] = field.repeated ? [] : enumZeroValue(field.T);
        break;
      case "message": {
        // oneofs are handled above
        if (field.oneof) {
          break;
        }
        if (field.repeated) {
          message[localName] = [];
          break;
        }

        const messageType = resolveMessageType(field.T);
        message[localName] =
          messageType.fieldWrapper ?
            messageType.fieldWrapper.unwrapField(null)
          : createCompleteMessage(messageType.fields);
        break;
      }
      case "map":
        message[localName] = createMessageRecord();
        break;
      default:
        field satisfies never;
    }
  }
  return message as CompleteMessage<T>;
}
