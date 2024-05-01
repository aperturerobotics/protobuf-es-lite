import { normalizeEnumValue } from "./enum.js";
import { FieldList, MapValueInfo, resolveMessageType } from "./field.js";
import { AnyMessage, Message, createCompleteMessage } from "./message.js";
import { throwSanitizeKey } from "./names.js";
import { normalizeScalarValue } from "./scalar.js";

// applyPartialMessage applies a partial source message to a target message.
export function applyPartialMessage<T extends Message<T>>(
  source: Message<T> | undefined,
  target: Message<T>,
  fields: FieldList,
): void {
  if (source == null || target == null) {
    return;
  }
  const t = target as AnyMessage,
    s = source as Message<AnyMessage>;
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
      case "oneof":
        if (typeof sourceValue !== "object") {
          throw new Error(`field ${localName}: invalid oneof: must be an object with case and value`);
        }
        // sk, sk are the source case and value
        const { case: sk, value: sv } = sourceValue;
        // sourceField is the field set by the source case, if any.
        const sourceField = sk != null ? member.findField(sk) : null;
        // dv is the destination oneof object
        let dv = localName in t ? t[localName] : undefined;
        if (typeof dv !== "object") {
          dv = Object.create(null);
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
            dest = dv.value = Object.create(null);
          }
          // skip zero or null value
          if (sv != null) {
            const sourceFieldMt = resolveMessageType(sourceField.T);
            applyPartialMessage(sv, dest, sourceFieldMt.fields);
          }
        } else if (sourceField.kind === "scalar") {
          dv.value = normalizeScalarValue(sourceField.T, sv);
        } else {
          dv.value = sv;
        }
        break;
      case "scalar":
        if (member.repeated) {
          if (!Array.isArray(sourceValue)) {
            throw new Error(`field ${localName}: invalid value: must be array`);
          }
          let dst = localName in t ? t[localName] : null;
          if (dst == null || !Array.isArray(dst)) {
            dst = t[localName] = [];
          }
          dst.push(...sourceValue.map((v) => normalizeScalarValue(member.T, v)));
          break;
        }

        t[localName] = normalizeScalarValue(member.T, sourceValue);
        break;
      case "enum":
        t[localName] = normalizeEnumValue(member.T, sourceValue);
        break;
      case "map":
        if (typeof sourceValue !== "object") {
          throw new Error(`field ${member.localName}: invalid value: must be object`);
        }
        let tMap = t[localName]
        if (typeof tMap !== "object") {
          tMap = t[localName] = Object.create(null);
        }
        applyPartialMap(sourceValue, tMap, member.V);
        break;
      case "message":
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
                tArr.push(mt.fieldWrapper.unwrapField(mt.fieldWrapper.wrapField(v)))
              } else {
                tArr.push(mt.create(v));
              }
            }
          }
          break;
        }

        if (mt.fieldWrapper) {
          t[localName] = mt.fieldWrapper.unwrapField(mt.fieldWrapper.wrapField(sourceValue))
        } else {
          if (typeof sourceValue !== "object") {
            throw new Error(`field ${member.localName}: invalid value: must be object`);
          }
          let destMsg = t[localName]
          if (typeof destMsg !== "object") {
            destMsg = t[localName] = Object.create(null);
          }
          applyPartialMessage(sourceValue, destMsg, mt.fields);
        }
        break;
    }
  }
}
// applyPartialMap applies a partial source map to a target map.
export function applyPartialMap(
  sourceMap: Record<string, any> | undefined,
  targetMap: Record<string, any>,
  value: MapValueInfo,
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
          targetMap[k] = normalizeScalarValue(value.T, v);
        } else {
          delete targetMap[k];
        }
      }
      break;
    case "enum":
      for (const [k, v] of Object.entries(sourceMap)) {
        throwSanitizeKey(k);
        if (v !== undefined) {
          targetMap[k] = normalizeEnumValue(value.T, v);
        } else {
          delete targetMap[k];
        }
      }
      break;
    case "message":
      const messageType = resolveMessageType(value.T);
      for (const [k, v] of Object.entries(sourceMap)) {
        throwSanitizeKey(k);
        if (v === undefined) {
          delete targetMap[k];
          continue;
        }
        if (typeof v !== "object") {
          throw new Error(
            `invalid value: must be object`,
          );
        }
        let val: AnyMessage = targetMap[k];
        if (!!messageType.fieldWrapper) {
          // For wrapper type messages, call createCompleteMessage.
          val = targetMap[k] = createCompleteMessage(messageType.fields);
        } else if (typeof val !== "object") {
          // Otherwise apply the partial to the existing value, if any.
          val = targetMap[k] = Object.create(null);
        }
        applyPartialMessage(v, val, messageType.fields);
      }
      break;
  }
}
