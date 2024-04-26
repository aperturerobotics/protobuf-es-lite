import { FieldList, resolveMessageType } from "./field.js";
import { AnyMessage, Message } from "./message.js";
import { isCompleteMessage } from "./is-message.js";
import { ScalarType } from "./scalar.js";

// applyPartialMessage applies a partial message to a message.
export function applyPartialMessage<T extends Message<T>>(
  source: Message<T> | undefined,
  target: Message<T>,
  fields: FieldList,
): void {
  if (source === undefined) {
    return;
  }
  for (const member of fields.byMember()) {
    const localName = member.localName,
      t = target as AnyMessage,
      s = source as Message<AnyMessage>;
    if (s[localName] === undefined) {
      // TODO if source is a Message instance, we should use isFieldSet() here to support future field presence
      continue;
    }
    switch (member.kind) {
      case "oneof":
        const sk = s[localName].case;
        if (sk === undefined) {
          continue;
        }
        const sourceField = member.findField(sk);
        let val = s[localName].value;
        if (sourceField?.kind == "message") {
          const messageType = resolveMessageType(sourceField.T);
          if (!isCompleteMessage(val, messageType.fields.list())) {
            val = messageType.create(val);
          }
        } else if (
          sourceField &&
          sourceField.kind === "scalar" &&
          sourceField.T === ScalarType.BYTES
        ) {
          val = toU8Arr(val);
        }
        t[localName] = { case: sk, value: val };
        break;
      case "scalar":
      case "enum":
        let copy = s[localName];
        if (member.T === ScalarType.BYTES) {
          copy =
            member.repeated ?
              (copy as ArrayLike<number>[]).map(toU8Arr)
            : toU8Arr(copy);
        }
        t[localName] = copy;
        break;
      case "map":
        switch (member.V.kind) {
          case "scalar":
          case "enum":
            if (member.V.T === ScalarType.BYTES) {
              for (const [k, v] of Object.entries(s[localName])) {
                t[localName][k] = toU8Arr(v as ArrayLike<number>);
              }
            } else {
              Object.assign(t[localName], s[localName]);
            }
            break;
          case "message":
            const messageType = resolveMessageType(member.V.T);
            for (const k of Object.keys(s[localName])) {
              let val = s[localName][k];
              if (!messageType.fieldWrapper) {
                // We only take partial input for messages that are not a wrapper type.
                // For those messages, we recursively normalize the partial input.
                val = messageType.create(val);
              }
              t[localName][k] = val;
            }
            break;
        }
        break;
      case "message":
        const mt = resolveMessageType(member.T);
        if (member.repeated) {
          t[localName] = (s[localName] as any[]).map((val) =>
            isCompleteMessage(val, mt.fields.list()) ? val : mt.create(val),
          );
        } else {
          const val = s[localName];
          if (mt.fieldWrapper) {
            if (
              // We can't use BytesValue.typeName as that will create a circular import
              mt.typeName === "google.protobuf.BytesValue"
            ) {
              t[localName] = toU8Arr(val);
            } else {
              t[localName] = val;
            }
          } else {
            const messageType = mt;
            t[localName] =
              isCompleteMessage(val, messageType.fields.list()) ? val : (
                messageType.create(val)
              );
          }
        }
        break;
    }
  }
}

// converts any ArrayLike<number> to Uint8Array if necessary.
function toU8Arr(input: ArrayLike<number>) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}
