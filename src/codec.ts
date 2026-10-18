import type { BinaryReader, Writer } from "./binary-encoding.js";
import type { EnumType } from "./enum.js";
import type {
  JsonObject,
  JsonReadOptions,
  JsonValue,
  JsonWriteOptions,
} from "./json.js";
import {
  jsonBytes,
  jsonDouble,
  jsonEntries,
  jsonEnum,
  jsonList,
  jsonUnknown,
  readBool,
  readBoolKey,
  readBytes,
  readDouble,
  readEnum,
  readFloat,
  readInt32,
  readInt64,
  readStr,
  readUint32,
  readUint64,
} from "./json.js";
import { protoCamelCase } from "./names.js";

/**
 * FieldDesc is the generated description of one field:
 *
 *   [number, proto name, type, flags, value type, oneof, local name, JSON name]
 *
 * type is the field type of the protobuf descriptor, 1 to 18: 10 is a
 * delimited message, 11 a message and 14 an enum. A map's type is the type of
 * its values. flags holds the FieldFlag bits, and the scalar type of a map's
 * key from bit 6 up. The value type is the codec of a message field's type,
 * or the EnumType of an enum field. The local name and the JSON name default
 * to the protoCamelCase of the proto name. Trailing slots that hold their
 * defaults are left out, and 0 fills a slot left out before a later one.
 */
export type FieldDesc = readonly (number | string | MessageCodec | EnumType)[];

/**
 * MessageCodec is the untyped form of a message type, which field
 * descriptions refer to. Each function works on a message as a record of its
 * fields.
 */
export interface MessageCodec {
  readonly typeName: string;
  /**
   * unwrap and wrap convert between the message and the plain value that
   * fields of a well-known type hold in its place. A Timestamp field holds a
   * Date in every shape; a wrapper field holds its scalar when singular
   * outside a oneof, and as a map value.
   */
  readonly unwrap: ((m: Obj) => unknown) | undefined;
  readonly wrap: ((v: unknown) => Obj) | undefined;
  encode(m: Obj, w: Writer): void;
  decode(r: BinaryReader, end: number, m: Obj): Obj;
  equals(a: Obj, b: Obj): boolean;
  clone(m: Obj): Obj;
  writeJson(m: Obj, o: JsonWriteOptions): JsonValue;
  readJson(j: JsonValue, o: JsonReadOptions, m: Obj): Obj;
  /**
   * fields returns the message's fields, resolved from their descriptions on
   * first use, for code that converts messages to another representation.
   */
  fields(): Fields;
}

/** FieldFlag holds the bits of a FieldDesc's flags. */
export const FieldFlag = {
  /** A repeated field. */
  REPEATED: 1,
  /** A repeated scalar field written packed. */
  PACKED: 2,
  /** A singular scalar or enum field that distinguishes unset from zero. */
  PRESENCE: 4,
  /** A map field. */
  MAP: 8,
  /** A 64-bit integer field held as a string, with jstype JS_STRING. */
  LONG_STRING: 16,
  /** A string field whose decoding rejects invalid UTF-8. */
  UTF8: 32,
} as const;

/** The bit where a map key's scalar type starts in a FieldDesc's flags. */
export const MAP_KEY_SHIFT = 6;

/** FieldShape is how a message holds the values of a field. */
export const FieldShape = {
  /** A singular field whose zero value means unset. */
  IMPLICIT: 0,
  /** A singular field that distinguishes unset from zero. */
  EXPLICIT: 1,
  /** A repeated field, held as an array. */
  LIST: 2,
  /** A map field, held as a record. */
  MAP: 3,
  /** A member of a oneof, held as { case, value } under the oneof's name. */
  ONEOF: 4,
} as const;

/** FieldKind is what one value of a field is; for a map, one map value. */
export const FieldKind = {
  SCALAR: 0,
  ENUM: 1,
  MESSAGE: 2,
  /**
   * A message that fields hold as a plain value: a Date for a Timestamp, the
   * wrapped scalar for a wrapper.
   */
  VALUE: 3,
} as const;

const { IMPLICIT, EXPLICIT, LIST, MAP, ONEOF } = FieldShape;
const { SCALAR, ENUM, MESSAGE, VALUE } = FieldKind;

// Scalar types, as numbered in the protobuf descriptor.
const DOUBLE = 1;
const FLOAT = 2;
const INT64 = 3;
const UINT64 = 4;
const INT32 = 5;
const FIXED64 = 6;
const FIXED32 = 7;
const BOOL = 8;
const STRING = 9;
const BYTES = 12;
const UINT32 = 13;
const SFIXED32 = 15;
const SFIXED64 = 16;
const SINT32 = 17;
const SINT64 = 18;

/** FieldInfo is a FieldDesc resolved for the walkers. */
export interface FieldInfo {
  /** The field number. */
  readonly no: number;
  /** The proto name. */
  readonly name: string;
  /** The property name in the message, or in its oneof's value. */
  readonly local: string;
  /** The JSON name. */
  readonly json: string;
  /** How the message holds the field's values, a FieldShape. */
  readonly shape: number;
  /** What one value is, a FieldKind. */
  readonly kind: number;
  /** The scalar type of a scalar's value, and INT32 for an enum. */
  readonly scalar: number;
  /** Whether a 64-bit integer is held as a string. */
  readonly str: boolean;
  readonly utf8: boolean;
  readonly packed: boolean;
  readonly group: boolean;
  /** The scalar type of a map's keys, and 0 for other shapes. */
  readonly key: number;
  /** The oneof's local name, for a oneof member. */
  readonly oneof: string;
  /** The codec of a message or VALUE kind. */
  readonly msg: MessageCodec | undefined;
  /** The enum type of an enum kind. */
  readonly enm: EnumType | undefined;
}

/**
 * Fields holds the resolved fields of one message type: in field-number
 * order, by number, and by JSON and proto name.
 */
export interface Fields {
  readonly list: readonly FieldInfo[];
  readonly byNo: Map<number, FieldInfo>;
  readonly byJson: Map<string, FieldInfo>;
}

/** Obj is a message, or a map field, as a record of its properties. */
export type Obj = { [k: string]: unknown };
type OneofValue = { case?: string; value?: unknown } | undefined;

/** resolveFields resolves the generated descriptions of a message's fields. */
export function resolveFields(descs: readonly FieldDesc[]): Fields {
  const list = descs.map(resolveField).sort((a, b) => a.no - b.no);
  const byNo = new Map<number, FieldInfo>();
  const byJson = new Map<string, FieldInfo>();
  for (const f of list) {
    byNo.set(f.no, f);
    if (!byJson.has(f.json)) {
      byJson.set(f.json, f);
    }
    if (!byJson.has(f.name)) {
      byJson.set(f.name, f);
    }
  }
  return { list, byNo, byJson };
}

// num and str read slot i of d, or its default when the slot is left out or
// holds 0.
function num(d: FieldDesc, i: number): number {
  const v = i < d.length ? d[i] : 0;
  return typeof v === "number" ? v : 0;
}

function str(d: FieldDesc, i: number, def: string): string {
  const v = i < d.length ? d[i] : 0;
  return typeof v === "string" ? v : def;
}

function resolveField(d: FieldDesc): FieldInfo {
  const no = num(d, 0);
  const name = str(d, 1, "");
  const type = num(d, 2);
  const flags = num(d, 3);
  const t = d.length > 4 ? d[4] : 0;
  const oneof = str(d, 5, "");
  const camel = protoCamelCase(name);
  const map = (flags & FieldFlag.MAP) !== 0;
  let kind: number = SCALAR;
  let scalar = type;
  let msg: MessageCodec | undefined;
  let enm: EnumType | undefined;
  if (type === 14) {
    kind = ENUM;
    scalar = INT32;
    enm = t as EnumType;
  } else if (type === 10 || type === 11) {
    msg = t as MessageCodec;
    kind = MESSAGE;
    if (
      msg.unwrap !== undefined &&
      (msg.typeName === "google.protobuf.Timestamp" ||
        map ||
        ((flags & FieldFlag.REPEATED) === 0 && oneof === ""))
    ) {
      kind = VALUE;
    }
  }
  let shape: number = IMPLICIT;
  if (map) {
    shape = MAP;
  } else if ((flags & FieldFlag.REPEATED) !== 0) {
    shape = LIST;
  } else if (oneof !== "") {
    shape = ONEOF;
  } else if (kind > ENUM || (flags & FieldFlag.PRESENCE) !== 0) {
    shape = EXPLICIT;
  }
  return {
    no,
    name,
    local: str(d, 6, camel),
    json: str(d, 7, camel),
    shape,
    kind,
    scalar,
    str: (flags & FieldFlag.LONG_STRING) !== 0,
    utf8: (flags & FieldFlag.UTF8) !== 0,
    packed: (flags & FieldFlag.PACKED) !== 0,
    group: type === 10,
    key: flags >>> MAP_KEY_SHIFT,
    oneof,
    msg,
    enm,
  };
}

// --- binary encoding

function wireType(scalar: number): number {
  switch (scalar) {
    case DOUBLE:
    case FIXED64:
    case SFIXED64:
      return 1;
    case FLOAT:
    case FIXED32:
    case SFIXED32:
      return 5;
    case STRING:
    case BYTES:
      return 2;
    default:
      return 0;
  }
}

function writeScalar(w: Writer, scalar: number, str: boolean, v: unknown) {
  switch (scalar) {
    case DOUBLE:
      w.double(v as number);
      break;
    case FLOAT:
      w.float(v as number);
      break;
    case INT64:
      w.int64(str ? BigInt(v as string) : (v as bigint));
      break;
    case UINT64:
      w.uint64(str ? BigInt(v as string) : (v as bigint));
      break;
    case FIXED64:
      w.fixed64(str ? BigInt(v as string) : (v as bigint));
      break;
    case SFIXED64:
      w.sfixed64(str ? BigInt(v as string) : (v as bigint));
      break;
    case SINT64:
      w.sint64(str ? BigInt(v as string) : (v as bigint));
      break;
    case FIXED32:
      w.fixed32(v as number);
      break;
    case SFIXED32:
      w.sfixed32(v as number);
      break;
    case UINT32:
      w.uint32(v as number);
      break;
    case SINT32:
      w.sint32(v as number);
      break;
    case BOOL:
      w.bool(v as boolean);
      break;
    case STRING:
      w.string(v as string);
      break;
    case BYTES:
      w.bytes(v as Uint8Array);
      break;
    default:
      w.int32(v as number);
  }
}

// writeValue writes one value of f as field no.
function writeValue(f: FieldInfo, w: Writer, no: number, v: unknown) {
  switch (f.kind) {
    case MESSAGE:
      if (f.group) {
        w.tag(no, 3);
        f.msg!.encode(v as Obj, w);
        w.tag(no, 4);
      } else {
        writeMessage(f.msg!, w, no, v as Obj);
      }
      break;
    case VALUE:
      writeMessage(f.msg!, w, no, f.msg!.wrap!(v));
      break;
    default:
      w.tag(no, wireType(f.scalar));
      writeScalar(w, f.scalar, f.str, v);
  }
}

function writeMessage(c: MessageCodec, w: Writer, no: number, m: Obj) {
  const s = w.tag(no, 2).fork();
  c.encode(m, w);
  w.join(s);
}

// isZero reports whether v is the zero value of an implicit-presence field.
function isZero(f: FieldInfo, v: unknown): boolean {
  if (v == null) {
    return true;
  }
  switch (f.scalar) {
    case DOUBLE:
    case FLOAT:
      return v === 0;
    case BYTES:
      return (v as Uint8Array).length === 0;
    default:
      return f.str ? !v || v === "0" : !v;
  }
}

/** encodeFields writes every set field of m to w, in field-number order. */
export function encodeFields(fs: Fields, m: Obj, w: Writer): void {
  for (const f of fs.list) {
    if (f.shape === ONEOF) {
      const o = m[f.oneof] as OneofValue;
      if (o?.case === f.local && o.value != null) {
        writeValue(f, w, f.no, o.value);
      }
      continue;
    }
    const v = m[f.local];
    if (v == null) {
      continue;
    }
    switch (f.shape) {
      case IMPLICIT:
        if (!isZero(f, v)) {
          writeValue(f, w, f.no, v);
        }
        break;
      case LIST: {
        const a = v as unknown[];
        if (f.packed && a.length > 0) {
          const s = w.tag(f.no, 2).fork();
          for (const e of a) {
            writeScalar(w, f.scalar, f.str, e);
          }
          w.join(s);
        } else {
          for (const e of a) {
            writeValue(f, w, f.no, e);
          }
        }
        break;
      }
      case MAP: {
        const map = v as Obj;
        for (const k in map) {
          const s = w.tag(f.no, 2).fork();
          w.tag(1, wireType(f.key));
          writeScalar(w, f.key, false, mapKey(f.key, k));
          writeValue(f, w, 2, map[k]);
          w.join(s);
        }
        break;
      }
      default:
        writeValue(f, w, f.no, v);
    }
  }
}

// mapKey converts the property name k of a map to the value of its key.
function mapKey(scalar: number, k: string): unknown {
  switch (scalar) {
    case BOOL:
      return k === "true";
    case STRING:
      return k;
    case INT64:
    case UINT64:
    case SINT64:
    case FIXED64:
    case SFIXED64:
      return BigInt(k);
    default:
      return Number(k);
  }
}

// --- binary decoding

function readScalar(
  r: BinaryReader,
  scalar: number,
  str: boolean,
  utf8: boolean,
): unknown {
  switch (scalar) {
    case DOUBLE:
      return r.double();
    case FLOAT:
      return r.float();
    case INT64:
      return str ? r.int64().toString() : r.int64();
    case UINT64:
      return str ? r.uint64().toString() : r.uint64();
    case FIXED64:
      return str ? r.fixed64().toString() : r.fixed64();
    case SFIXED64:
      return str ? r.sfixed64().toString() : r.sfixed64();
    case SINT64:
      return str ? r.sint64().toString() : r.sint64();
    case FIXED32:
      return r.fixed32();
    case SFIXED32:
      return r.sfixed32();
    case UINT32:
      return r.uint32();
    case SINT32:
      return r.sint32();
    case BOOL:
      return r.bool();
    case STRING:
      return utf8 ? r.utf8() : r.string();
    case BYTES:
      return r.bytes();
    default:
      return r.int32();
  }
}

// readValue reads one value of f, merging a message into prev when given.
function readValue(f: FieldInfo, r: BinaryReader, prev: unknown): unknown {
  switch (f.kind) {
    case MESSAGE: {
      const end = f.group ? r.len : r.delimited();
      return f.msg!.decode(r, end, prev === undefined ? {} : (prev as Obj));
    }
    case VALUE:
      return f.msg!.unwrap!(f.msg!.decode(r, r.delimited(), {}));
    default:
      return readScalar(r, f.scalar, f.str, f.utf8);
  }
}

// zero returns the zero value of a scalar type.
function zero(scalar: number, str: boolean): unknown {
  switch (scalar) {
    case STRING:
      return "";
    case BOOL:
      return false;
    case BYTES:
      return new Uint8Array(0);
    case INT64:
    case UINT64:
    case SINT64:
    case FIXED64:
    case SFIXED64:
      return str ? "0" : BigInt(0);
    default:
      return 0;
  }
}

// valueZero is the value of a map entry that has no value field.
function valueZero(f: FieldInfo): unknown {
  switch (f.kind) {
    case ENUM:
      return f.enm!.values[0]?.no ?? 0;
    case MESSAGE:
      return {};
    case VALUE:
      return f.msg!.unwrap!({});
    default:
      return zero(f.scalar, false);
  }
}

// readKey reads a map key as the property name of the generated interface:
// 32-bit integer keys are numbers, the rest strings.
function readKey(f: FieldInfo, r: BinaryReader): string | number {
  const k = readScalar(r, f.key, false, f.utf8);
  switch (f.key) {
    case STRING:
      return k as string;
    case BOOL:
      return k ? "true" : "false";
    case INT64:
    case UINT64:
    case SINT64:
    case FIXED64:
    case SFIXED64:
      return (k as bigint).toString();
    default:
      return k as number;
  }
}

function keyZero(scalar: number): string | number {
  switch (scalar) {
    case STRING:
      return "";
    case BOOL:
      return "false";
    case INT64:
    case UINT64:
    case SINT64:
    case FIXED64:
    case SFIXED64:
      return "0";
    default:
      return 0;
  }
}

/**
 * decodeFields reads fields from r into m until offset end or an end-group
 * tag, and returns m. Repeated fields append, map entries overwrite, and
 * message fields merge.
 */
export function decodeFields(
  fs: Fields,
  r: BinaryReader,
  end: number,
  m: Obj,
): Obj {
  while (r.pos < end) {
    const t = r.tag();
    if ((t & 7) === 4) {
      return m;
    }
    const f = fs.byNo.get(t >>> 3);
    if (f === undefined) {
      r.skip(t);
      continue;
    }
    switch (f.shape) {
      case LIST: {
        const a = listOf(m, f.local);
        if (f.kind <= ENUM && f.scalar !== STRING && f.scalar !== BYTES) {
          for (const e = r.run(t); r.pos < e; ) {
            a.push(readScalar(r, f.scalar, f.str, f.utf8));
          }
        } else {
          a.push(readValue(f, r, undefined));
        }
        break;
      }
      case MAP: {
        const map = mapOf(m, f.local);
        const e = r.delimited();
        let k = keyZero(f.key);
        let v = valueZero(f);
        while (r.pos < e) {
          const et = r.tag();
          switch (et >>> 3) {
            case 1:
              k = readKey(f, r);
              break;
            case 2:
              v = readValue(f, r, undefined);
              break;
            default:
              r.skip(et);
          }
        }
        map[k] = v;
        break;
      }
      case ONEOF: {
        const o = m[f.oneof] as OneofValue;
        const prev = o?.case === f.local ? o.value : undefined;
        m[f.oneof] = { case: f.local, value: readValue(f, r, prev) };
        break;
      }
      default:
        m[f.local] = readValue(f, r, m[f.local]);
    }
  }
  return m;
}

// --- equality and copies

function eqValue(f: FieldInfo, x: unknown, y: unknown): boolean {
  switch (f.kind) {
    case MESSAGE:
      return (
        x === y ||
        f.msg!.equals(x == null ? {} : (x as Obj), y == null ? {} : (y as Obj))
      );
    case VALUE:
      return x == null || y == null ?
          x == y
        : f.msg!.equals(f.msg!.wrap!(x), f.msg!.wrap!(y));
    default:
      return f.scalar === BYTES ?
          (x == null) === (y == null) &&
            eqBytes(x as Uint8Array, y as Uint8Array)
        : x === y;
  }
}

function eqImplicit(f: FieldInfo, x: unknown, y: unknown): boolean {
  switch (f.scalar) {
    case BYTES:
      return eqBytes(x as Uint8Array, y as Uint8Array);
    case BOOL:
      return !x === !y;
    default:
      if (f.str) {
        return (x || "0") === (y || "0");
      }
      return (x ?? zero(f.scalar, false)) === (y ?? zero(f.scalar, false));
  }
}

/**
 * equalsFields compares a and b field by field. An unset implicit field
 * equals its zero value, and an unset message field an empty one.
 */
export function equalsFields(fs: Fields, a: Obj, b: Obj): boolean {
  for (const f of fs.list) {
    switch (f.shape) {
      case IMPLICIT:
        if (!eqImplicit(f, a[f.local], b[f.local])) {
          return false;
        }
        break;
      case LIST: {
        const x = (a[f.local] ?? []) as unknown[];
        const y = (b[f.local] ?? []) as unknown[];
        if (x.length !== y.length) {
          return false;
        }
        for (let i = 0; i < x.length; i++) {
          if (!eqValue(f, x[i], y[i])) {
            return false;
          }
        }
        break;
      }
      case MAP: {
        const x = (a[f.local] ?? {}) as Obj;
        const y = (b[f.local] ?? {}) as Obj;
        for (const k in x) {
          if (y[k] === undefined || !eqValue(f, x[k], y[k])) {
            return false;
          }
        }
        for (const k in y) {
          if (x[k] === undefined) {
            return false;
          }
        }
        break;
      }
      case ONEOF: {
        const x = a[f.oneof] as OneofValue;
        const y = b[f.oneof] as OneofValue;
        const inX = x?.case === f.local;
        if (inX !== (y?.case === f.local)) {
          return false;
        }
        if (inX && !eqValue(f, x!.value, y!.value)) {
          return false;
        }
        break;
      }
      default:
        if (!eqValue(f, a[f.local], b[f.local])) {
          return false;
        }
    }
  }
  return true;
}

function eqBytes(x: Uint8Array | undefined, y: Uint8Array | undefined) {
  const a = x ?? noBytes;
  const b = y ?? noBytes;
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

const noBytes = new Uint8Array(0);

function copyValue(f: FieldInfo, v: unknown): unknown {
  switch (f.kind) {
    case MESSAGE:
      return f.msg!.clone(v as Obj);
    case VALUE:
      return f.msg!.unwrap!(f.msg!.clone(f.msg!.wrap!(v)));
    default:
      return f.scalar === BYTES ? (v as Uint8Array).slice() : v;
  }
}

/** cloneFields returns a deep copy of the set fields of m. */
export function cloneFields(fs: Fields, m: Obj): Obj {
  const out: Obj = {};
  for (const f of fs.list) {
    if (f.shape === ONEOF) {
      const o = m[f.oneof] as OneofValue;
      if (o?.case === f.local) {
        out[f.oneof] = { case: f.local, value: copyValue(f, o.value) };
      }
      continue;
    }
    const v = m[f.local];
    if (v == null) {
      continue;
    }
    switch (f.shape) {
      case LIST: {
        const a = v as unknown[];
        const copy: unknown[] = [];
        for (const e of a) {
          copy.push(copyValue(f, e));
        }
        out[f.local] = copy;
        break;
      }
      case MAP: {
        const map = v as Obj;
        const copy = newMap();
        for (const k in map) {
          copy[k] = copyValue(f, map[k]);
        }
        out[f.local] = copy;
        break;
      }
      default:
        out[f.local] = copyValue(f, v);
    }
  }
  return out;
}

// listOf and mapOf return the array or map in property k of m, creating it
// when unset. They read the property back after setting it: an ahead-of-time
// compiler may store a copy of a value assigned to an index signature, and
// later writes must reach the stored one.
function listOf(m: Obj, k: string): unknown[] {
  if (m[k] === undefined) {
    m[k] = [];
  }
  return m[k] as unknown[];
}

function mapOf(m: Obj, k: string): Obj {
  if (m[k] === undefined) {
    m[k] = newMap();
  }
  return m[k] as Obj;
}

/**
 * newMap returns an empty map with no prototype, so a key such as __proto__
 * is an ordinary entry. Decoding and copying create maps with it.
 */
export function newMap<V = unknown>(): { [key: string]: V } {
  return Object.create(null) as { [key: string]: V };
}

// --- JSON

function valueJson(f: FieldInfo, v: unknown, o: JsonWriteOptions): JsonValue {
  switch (f.kind) {
    case ENUM:
      return jsonEnum(v as number, f.enm!, o);
    case MESSAGE:
      return f.msg!.writeJson(v as Obj, o);
    case VALUE:
      return f.msg!.writeJson(f.msg!.wrap!(v), o);
  }
  switch (f.scalar) {
    case DOUBLE:
    case FLOAT:
      return jsonDouble(v as number);
    case BYTES:
      return jsonBytes(v as Uint8Array);
    case INT64:
    case UINT64:
    case SINT64:
    case FIXED64:
    case SFIXED64:
      return f.str ? (v as string) : (v as bigint).toString();
    default:
      return v as JsonValue;
  }
}

/** writeJsonFields converts the fields of m to a JSON object. */
export function writeJsonFields(
  fs: Fields,
  m: Obj,
  o: JsonWriteOptions,
): JsonValue {
  const out: JsonObject = {};
  const emit = o.emitDefaultValues === true;
  for (const f of fs.list) {
    const key = o.useProtoFieldName ? f.name : f.json;
    if (f.shape === ONEOF) {
      const x = m[f.oneof] as OneofValue;
      if (x?.case === f.local && x.value != null) {
        out[key] = valueJson(f, x.value, o);
      }
      continue;
    }
    const v = m[f.local];
    switch (f.shape) {
      case IMPLICIT:
        if (!isZero(f, v)) {
          out[key] = valueJson(f, v, o);
        } else if (emit) {
          out[key] = valueJson(
            f,
            f.kind === ENUM ? 0 : zero(f.scalar, f.str),
            o,
          );
        }
        break;
      case LIST: {
        const a = (v ?? []) as unknown[];
        if (a.length > 0 || emit) {
          const js: JsonValue[] = [];
          for (const e of a) {
            js.push(valueJson(f, e, o));
          }
          out[key] = js;
        }
        break;
      }
      case MAP: {
        const map = (v ?? {}) as Obj;
        const js: JsonObject = {};
        let set = emit;
        for (const k in map) {
          js[k] = valueJson(f, map[k], o);
          set = true;
        }
        if (set) {
          out[key] = js;
        }
        break;
      }
      default:
        if (v != null) {
          out[key] = valueJson(f, v, o);
        }
    }
  }
  return out;
}

function readScalarJson(scalar: number, str: boolean, j: JsonValue): unknown {
  switch (scalar) {
    case STRING:
      return readStr(j);
    case BOOL:
      return readBool(j);
    case BYTES:
      return readBytes(j);
    case DOUBLE:
      return readDouble(j);
    case FLOAT:
      return readFloat(j);
    case UINT32:
    case FIXED32:
      return readUint32(j);
    case INT64:
    case SINT64:
    case SFIXED64:
      return str ? readInt64(j).toString() : readInt64(j);
    case UINT64:
    case FIXED64:
      return str ? readUint64(j).toString() : readUint64(j);
    default:
      return readInt32(j);
  }
}

// readValueJson reads the JSON value j as one value of f. An enum reads as
// undefined for a name it does not know, when the options ignore those.
function readValueJson(
  f: FieldInfo,
  j: JsonValue,
  o: JsonReadOptions,
  prev: unknown,
): unknown {
  switch (f.kind) {
    case ENUM:
      return readEnum(j, f.enm!, o);
    case MESSAGE:
      return f.msg!.readJson(j, o, prev === undefined ? {} : (prev as Obj));
    case VALUE:
      return f.msg!.unwrap!(f.msg!.readJson(j, o, {}));
    default:
      return readScalarJson(f.scalar, f.str, j);
  }
}

// readsNull reports whether JSON null is a value of f rather than unset:
// google.protobuf.Value and NullValue read it as their null value.
function readsNull(f: FieldInfo): boolean {
  return f.kind === MESSAGE ?
      f.msg!.typeName === "google.protobuf.Value"
    : f.kind === ENUM && f.enm!.typeName === "google.protobuf.NullValue";
}

// jsonKey reads the JSON object key k as a key of the map field f.
function jsonKey(f: FieldInfo, k: string): string | number {
  switch (f.key) {
    case STRING:
      return k;
    case BOOL:
      return readBoolKey(k);
    case INT64:
    case SINT64:
    case SFIXED64:
    case UINT64:
    case FIXED64:
      return (readScalarJson(f.key, false, k) as bigint).toString();
    default:
      return readScalarJson(f.key, false, k) as number;
  }
}

/** readJsonFields reads the JSON object j into m and returns m. */
export function readJsonFields(
  fs: Fields,
  typeName: string,
  j: JsonValue,
  o: JsonReadOptions,
  m: Obj,
): Obj {
  for (const [k, v] of jsonEntries(j, typeName)) {
    const f = fs.byJson.get(k);
    if (f === undefined) {
      jsonUnknown(k, o);
      continue;
    }
    if (v === null && !readsNull(f)) {
      // Null clears an implicit field and leaves the rest unset; an enum
      // field reads null as unset too.
      if (f.shape === IMPLICIT && f.kind !== ENUM) {
        m[f.local] = readScalarJson(f.scalar, f.str, null);
      } else if (f.shape === EXPLICIT && f.kind !== MESSAGE) {
        m[f.local] = undefined;
      }
      continue;
    }
    switch (f.shape) {
      case LIST: {
        const a = listOf(m, f.local);
        for (const e of jsonList(v)) {
          const x = readValueJson(f, e, o, undefined);
          if (x !== undefined) {
            a.push(x);
          }
        }
        break;
      }
      case MAP: {
        const map = mapOf(m, f.local);
        for (const [mk, mv] of jsonEntries(v, "map")) {
          map[jsonKey(f, mk)] =
            readValueJson(f, mv, o, undefined) ?? valueZero(f);
        }
        break;
      }
      case ONEOF: {
        const x = m[f.oneof] as OneofValue;
        const prev = x?.case === f.local ? x.value : undefined;
        const value = readValueJson(f, v, o, prev);
        if (value !== undefined) {
          m[f.oneof] = { case: f.local, value };
        }
        break;
      }
      default: {
        const value = readValueJson(f, v, o, m[f.local]);
        if (value !== undefined) {
          m[f.local] = value;
        }
      }
    }
  }
  return m;
}
