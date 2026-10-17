import { BinaryReader } from "./binary-encoding.js";
import type {
  JsonObject,
  JsonReadOptions,
  JsonValue,
  JsonWriteOptions,
} from "./json.js";
import { jsonEntries } from "./json.js";
import type { AnyMessage, MessageType } from "./message.js";
import type { IMessageTypeRegistry } from "./type-registry.js";

// The generated codecs of the well-known types call these functions for the
// conversions their JSON form or their extra methods need. Each takes the
// fields of its type structurally, so it serves every generated copy of the
// type.

/** AnyFields holds the fields of google.protobuf.Any. */
export interface AnyFields {
  typeUrl?: string;
  value?: Uint8Array;
}

/** SecondsFields holds the fields of google.protobuf.Timestamp and Duration. */
export interface SecondsFields {
  seconds?: bigint;
  nanos?: number;
}

/**
 * anyMethods are the methods google.protobuf.Any adds to its message type. The
 * type URL holds the packed message's type name, without a URL prefix.
 */
export const anyMethods = {
  /** Pack message of type into out. */
  packFrom: <T>(out: AnyFields, message: T, type: MessageType<T>): void => {
    out.value = type.toBinary(message);
    out.typeUrl = type.typeName;
  },

  /**
   * Merge the packed message into target and return true, when it is of
   * type; return false otherwise.
   */
  unpackTo: <T>(msg: AnyFields, target: T, type: MessageType<T>): boolean => {
    if (msg.typeUrl !== type.typeName) {
      return false;
    }
    const value = msg.value ?? new Uint8Array(0);
    type.decode(new BinaryReader(value), value.length, target);
    return true;
  },

  /** Decode the packed message with its type from registry, if found. */
  unpack: <T = AnyMessage>(
    msg: AnyFields,
    registry: IMessageTypeRegistry,
  ): { message: T; messageType: MessageType<T> } | undefined => {
    const type = msg.typeUrl ? registry.findMessage<T>(msg.typeUrl) : undefined;
    return type ?
        { message: type.fromBinary(msg.value), messageType: type }
      : undefined;
  },

  /** Report whether the packed message is of type, given or named. */
  is: <T>(msg: AnyFields, type: MessageType<T> | string): boolean =>
    !!msg.typeUrl &&
    msg.typeUrl === (typeof type === "string" ? type : type.typeName),
};

/**
 * anyWriteJson writes an Any as the JSON of the packed message with an
 * "@type" key, looking its type up in the options' registry.
 */
export function anyWriteJson(m: AnyFields, o: JsonWriteOptions): JsonValue {
  const typeName = m.typeUrl;
  if (!typeName) {
    return {};
  }
  const type = o.typeRegistry?.findMessage(typeName);
  if (!type) {
    throw new Error(
      `cannot encode google.protobuf.Any to JSON: "${typeName}" is not in the type registry`,
    );
  }
  const json = type.toJson(type.fromBinary(m.value), o);
  const out: JsonObject =
    (
      typeName.startsWith("google.protobuf.") ||
      json === null ||
      typeof json !== "object" ||
      Array.isArray(json)
    ) ?
      { value: json }
    : { ...json };
  out["@type"] = typeName;
  return out;
}

/** anyReadJson reads the JSON that anyWriteJson writes into m. */
export function anyReadJson(
  j: JsonValue,
  o: JsonReadOptions,
  m: AnyFields,
): AnyFields {
  const rest: JsonObject = {};
  let typeName: JsonValue = null;
  let empty = true;
  for (const [k, v] of jsonEntries(j, "google.protobuf.Any")) {
    empty = false;
    if (k === "@type") {
      typeName = v;
    } else {
      rest[k] = v;
    }
  }
  if (empty) {
    return m;
  }
  if (typeof typeName !== "string" || typeName === "") {
    throw new Error(`"@type" is empty`);
  }
  const type = o.typeRegistry?.findMessage(typeName);
  if (!type) {
    throw new Error(`"${typeName}" is not in the type registry`);
  }
  const message =
    typeName.startsWith("google.protobuf.") && "value" in rest ?
      type.fromJson(rest["value"], o)
    : type.fromJson(rest, o);
  m.typeUrl = typeName;
  m.value = type.toBinary(message);
  return m;
}

/** timestampMethods are the methods google.protobuf.Timestamp adds. */
export const timestampMethods = {
  /** Return the current time. */
  now: (): SecondsFields => timestampMethods.fromDate(new Date()),

  /** Convert a Timestamp to a Date, rounding nanoseconds up to milliseconds. */
  toDate: (msg: SecondsFields): Date =>
    new Date(
      Number(msg.seconds ?? 0n) * 1000 + Math.ceil((msg.nanos ?? 0) / 1e6),
    ),

  /** Convert a Date to a Timestamp. */
  fromDate: (value: Date): SecondsFields => {
    const ms = value.getTime();
    const seconds = Math.floor(ms / 1000);
    return { seconds: BigInt(seconds), nanos: (ms - seconds * 1000) * 1e6 };
  },
};

const minTimestamp = Date.parse("0001-01-01T00:00:00Z");
const maxTimestamp = Date.parse("9999-12-31T23:59:59Z");

/**
 * timestampWriteJson writes a Timestamp as an RFC 3339 string in UTC, with 0,
 * 3, 6 or 9 fractional digits.
 */
export function timestampWriteJson(m: SecondsFields): JsonValue {
  const ms = Number(m.seconds ?? 0n) * 1000;
  if (ms < minTimestamp || ms > maxTimestamp) {
    throw new Error(
      "cannot encode google.protobuf.Timestamp to JSON: must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive",
    );
  }
  const nanos = m.nanos ?? 0;
  if (nanos < 0) {
    throw new Error(
      "cannot encode google.protobuf.Timestamp to JSON: nanos must not be negative",
    );
  }
  return new Date(ms).toISOString().replace(".000Z", fraction(nanos) + "Z");
}

/** timestampReadJson reads an RFC 3339 string into m. */
export function timestampReadJson(
  j: JsonValue,
  _o: JsonReadOptions,
  m: SecondsFields,
): SecondsFields {
  const match =
    typeof j === "string" ?
      /^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(?:\.([0-9]{1,9}))?(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(
        j,
      )
    : null;
  const ms = match ? Date.parse(match[1] + match[3]) : NaN;
  if (!match || Number.isNaN(ms)) {
    throw new Error("invalid RFC 3339 string");
  }
  if (ms < minTimestamp || ms > maxTimestamp) {
    throw new Error(
      "must be from 0001-01-01T00:00:00Z to 9999-12-31T23:59:59Z inclusive",
    );
  }
  m.seconds = BigInt(ms / 1000);
  m.nanos = readNanos(match[2]);
  return m;
}

const maxDurationSeconds = 315576000000;

/**
 * durationWriteJson writes a Duration as decimal seconds with an "s" suffix,
 * such as "1.5s", with 0, 3, 6 or 9 fractional digits.
 */
export function durationWriteJson(m: SecondsFields): JsonValue {
  const seconds = Number(m.seconds ?? 0n);
  const nanos = m.nanos ?? 0;
  if (Math.abs(seconds) > maxDurationSeconds) {
    throw new Error(
      "cannot encode google.protobuf.Duration to JSON: value out of range",
    );
  }
  const sign = seconds < 0 || nanos < 0 ? "-" : "";
  return sign + Math.abs(seconds).toString() + fraction(Math.abs(nanos)) + "s";
}

/** durationReadJson reads the JSON that durationWriteJson writes into m. */
export function durationReadJson(
  j: JsonValue,
  _o: JsonReadOptions,
  m: SecondsFields,
): SecondsFields {
  const match =
    typeof j === "string" ? /^(-?)([0-9]+)(?:\.([0-9]{1,9}))?s$/.exec(j) : null;
  const seconds = match ? Number(match[2]) : NaN;
  if (!match || !(seconds <= maxDurationSeconds)) {
    throw new Error("invalid duration string");
  }
  const sign = match[1] === "-" ? -1 : 1;
  m.seconds = BigInt(sign * seconds);
  m.nanos = sign * readNanos(match[3]);
  return m;
}

// fraction formats nanoseconds as a fraction of a second with 3, 6 or 9
// digits, or as nothing when they are zero.
function fraction(nanos: number): string {
  if (nanos === 0) {
    return "";
  }
  const digits = (nanos + 1e9).toString().substring(1);
  if (digits.endsWith("000000")) {
    return "." + digits.substring(0, 3);
  }
  if (digits.endsWith("000")) {
    return "." + digits.substring(0, 6);
  }
  return "." + digits;
}

// readNanos reads the fractional digits of a second as nanoseconds.
function readNanos(digits: string | undefined): number {
  return digits ? Number(digits + "0".repeat(9 - digits.length)) : 0;
}
