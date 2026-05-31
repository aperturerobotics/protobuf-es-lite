import { normalizeEnumValue } from "./enum.js";
import type { MapValueInfo } from "./field.js";
import { FieldList, resolveMessageType } from "./field.js";
import type { AnyMessage, Message } from "./message.js";
import { createCompleteMessage } from "./message.js";
import type { MessageMap, MessageRecord } from "./message-access.js";
import { asMessageRecord, createMessageRecord } from "./message-access.js";
import { throwSanitizeKey } from "./names.js";
import { normalizeScalarValue } from "./scalar.js";

// applyPartialMessage applies a partial source message to a target message.
//
// if clone is set: values are deep-copied including Uint8Arrays.
export function applyPartialMessage<T extends Message<T>>(
  source: Message<T> | undefined,
  target: Message<T>,
  fields: FieldList,
  clone: boolean = false,
): void {
  if (source == null || target == null) {
    return;
  }
  const t = asMessageRecord(target),
    s = asMessageRecord(source);
  for (const member of fields.byMember()) {
    const localName = member.localName;
    throwSanitizeKey(localName);
    if (!(localName in s) || s[localName] === undefined) {
      continue;
    }

    const sourceValue = s[localName];
    if (sourceValue === null) {
      delete t[localName];
      continue;
    }

    switch (member.kind) {
      case "oneof": {
        if (typeof sourceValue !== "object") {
          throw new Error(
            `field ${localName}: invalid oneof: must be an object with case and value`,
          );
        }
        // sk, sk are the source case and value
        const { case: sk, value: sv } = sourceValue as {
          case?: string;
          value?: unknown;
        };
        // sourceField is the field set by the source case, if any.
        const sourceField = sk != null ? member.findField(sk) : null;
        // dv is the destination oneof object
        let dv = (localName in t ? t[localName] : undefined) as
          | MessageRecord
          | undefined;
        if (typeof dv !== "object") {
          dv = createMessageRecord();
        }
        // check the case is valid and throw if not
        if (sk != null && sourceField == null) {
          throw new Error(`field ${localName}: invalid oneof case: ${sk}`);
        }
        // update the case
        dv.case = sk;
        // if the case was different or null, clear the value.
        if (dv.case !== sk || sk == null) {
          delete dv.value;
        }
        t[localName] = dv;

        // stop here if there was no valid case selected
        if (!sourceField) {
          break;
        }

        if (sourceField.kind === "message") {
          // apply the partial to the value
          let dest = dv.value;
          if (typeof dest !== "object") {
            dest = dv.value = createMessageRecord();
          }
          // skip zero or null value
          if (sv != null) {
            const sourceFieldMt = resolveMessageType(sourceField.T);
            applyPartialMessage(
              sv as Message<AnyMessage>,
              dest as Message<AnyMessage>,
              sourceFieldMt.fields,
            );
          }
        } else if (sourceField.kind === "scalar") {
          dv.value = normalizeScalarValue(sourceField.T, sv, clone);
        } else {
          dv.value = sv;
        }
        break;
      }
      case "scalar": {
        if (member.repeated) {
          if (!Array.isArray(sourceValue)) {
            throw new Error(`field ${localName}: invalid value: must be array`);
          }
          let dst = localName in t ? t[localName] : null;
          if (dst == null || !Array.isArray(dst)) {
            dst = t[localName] = [];
          }
          (dst as unknown[]).push(
            ...sourceValue.map((v) => normalizeScalarValue(member.T, v, clone)),
          );
          break;
        }

        t[localName] = normalizeScalarValue(member.T, sourceValue, clone);
        break;
      }
      case "enum": {
        t[localName] = normalizeEnumValue(
          member.T,
          sourceValue as string | number | null | undefined,
        );
        break;
      }
      case "map": {
        if (typeof sourceValue !== "object") {
          throw new Error(
            `field ${member.localName}: invalid value: must be object`,
          );
        }
        let tMap = t[localName];
        if (typeof tMap !== "object") {
          tMap = t[localName] = createMessageRecord();
        }
        applyPartialMap(
          sourceValue as MessageMap,
          tMap as MessageMap,
          member.V,
          clone,
        );
        break;
      }
      case "message": {
        const mt = resolveMessageType(member.T);
        if (member.repeated) {
          // skip null or undefined values
          if (!Array.isArray(sourceValue)) {
            throw new Error(`field ${localName}: invalid value: must be array`);
          }
          let tArr = t[localName];
          if (!Array.isArray(tArr)) {
            tArr = t[localName] = [];
          }
          for (const v of sourceValue) {
            // skip null or undefined values
            if (v != null) {
              if (mt.fieldWrapper) {
                (tArr as unknown[]).push(
                  mt.fieldWrapper.unwrapField(mt.fieldWrapper.wrapField(v)),
                );
              } else {
                (tArr as unknown[]).push(mt.create(v));
              }
            }
          }
          break;
        }

        if (mt.fieldWrapper) {
          t[localName] = mt.fieldWrapper.unwrapField(
            mt.fieldWrapper.wrapField(sourceValue),
          );
        } else {
          if (typeof sourceValue !== "object") {
            throw new Error(
              `field ${member.localName}: invalid value: must be object`,
            );
          }
          let destMsg = t[localName];
          if (typeof destMsg !== "object") {
            destMsg = t[localName] = createMessageRecord();
          }
          applyPartialMessage(
            sourceValue,
            destMsg as Message<AnyMessage>,
            mt.fields,
          );
        }
        break;
      }
    }
  }
}
// applyPartialMap applies a partial source map to a target map.
export function applyPartialMap(
  sourceMap: MessageMap | undefined,
  targetMap: MessageMap,
  value: MapValueInfo,
  clone: boolean,
): void {
  if (sourceMap == null) {
    return;
  }
  if (typeof sourceMap !== "object") {
    throw new Error(`invalid map: must be object`);
  }
  switch (value.kind) {
    case "scalar":
      for (const [k, v] of Object.entries(sourceMap)) {
        throwSanitizeKey(k);
        if (v !== undefined) {
          targetMap[k] = normalizeScalarValue(value.T, v, clone);
        } else {
          delete targetMap[k];
        }
      }
      break;
    case "enum":
      for (const [k, v] of Object.entries(sourceMap)) {
        throwSanitizeKey(k);
        if (v !== undefined) {
          targetMap[k] = normalizeEnumValue(
            value.T,
            v as string | number | null | undefined,
          );
        } else {
          delete targetMap[k];
        }
      }
      break;
    case "message": {
      const messageType = resolveMessageType(value.T);
      for (const [k, v] of Object.entries(sourceMap)) {
        throwSanitizeKey(k);
        if (v === undefined) {
          delete targetMap[k];
          continue;
        }
        if (typeof v !== "object") {
          throw new Error(`invalid value: must be object`);
        }
        let val = targetMap[k] as AnyMessage;
        if (messageType.fieldWrapper) {
          // For wrapper type messages, call createCompleteMessage.
          val = targetMap[k] = createCompleteMessage(messageType.fields);
        } else if (typeof val !== "object") {
          // Otherwise apply the partial to the existing value, if any.
          val = targetMap[k] = createMessageRecord();
        }
        applyPartialMessage(v as Message<AnyMessage>, val, messageType.fields);
      }
      break;
    }
  }
}
