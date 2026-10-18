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

/**
 * Protobuf binary format wire types.
 *
 * A wire type provides just enough information to find the length of the
 * following value.
 *
 * See https://protobuf.dev/programming-guides/encoding/#structure
 */
export enum WireType {
  /** int32, int64, uint32, uint64, sint32, sint64, bool, enum. */
  Varint = 0,

  /** fixed64, sfixed64, double: 8 bytes, little-endian. */
  Bit64 = 1,

  /** string, bytes, embedded messages, packed repeated fields. */
  LengthDelimited = 2,

  /** Start of a group, or of a message with delimited encoding. */
  StartGroup = 3,

  /** End of a group. */
  EndGroup = 4,

  /** fixed32, sfixed32, float: 4 bytes, little-endian. */
  Bit32 = 5,
}

// The text codecs are created on first use, so a runtime that installs them
// after loading this module, such as a game's UI engine, can still read and
// write strings.
let encoder: TextEncoder | undefined;
let decoder: TextDecoder | undefined;
let strictDecoder: TextDecoder | undefined;

/**
 * Writer receives a message's wire values from its generated encoder.
 *
 * A length-delimited value opens with fork, which returns where its body
 * starts, and closes with join, which takes that position back. BinaryWriter
 * writes bytes; the writer behind sizeOf only counts them.
 */
export interface Writer {
  /** Start a length-delimited value. Pass the result to join. */
  fork(): number;
  /** Close the length-delimited value that started at start. */
  join(start: number): Writer;
  /** Write a field's tag: its number and wire type. */
  tag(fieldNo: number, wireType: WireType): Writer;
  /** Write raw bytes. */
  raw(chunk: Uint8Array): Writer;
  uint32(value: number): Writer;
  int32(value: number): Writer;
  sint32(value: number): Writer;
  bool(value: boolean): Writer;
  int64(value: bigint): Writer;
  uint64(value: bigint): Writer;
  sint64(value: bigint): Writer;
  fixed32(value: number): Writer;
  sfixed32(value: number): Writer;
  fixed64(value: bigint): Writer;
  sfixed64(value: bigint): Writer;
  float(value: number): Writer;
  double(value: number): Writer;
  bytes(value: Uint8Array): Writer;
  string(value: string): Writer;
}

/**
 * BinaryWriter appends protobuf wire values to one growing buffer.
 *
 * Generated encoders call it field by field. A length-delimited value opens
 * with fork, which marks where its body starts, and closes with join, which
 * inserts the body's length in front of it.
 */
export class BinaryWriter implements Writer {
  // The bytes written so far are buf[0, pos). The buffer doubles when a write
  // needs more room, so a message encodes into one allocation.
  private buf = new Uint8Array(64);
  private view = new DataView(this.buf.buffer);
  private pos = 0;

  /** Return the bytes written and reset the writer. */
  finish(): Uint8Array {
    const bytes = this.buf.slice(0, this.pos);
    this.pos = 0;
    return bytes;
  }

  /** Start a length-delimited value. Pass the result to join. */
  fork(): number {
    return this.pos;
  }

  /** Close the length-delimited value that started at start. */
  join(start: number): BinaryWriter {
    // Measure the body and the varint of its length.
    const length = this.pos - start;
    let size = 1;
    for (let rest = length >>> 7; rest > 0; rest >>>= 7) {
      size += 1;
    }

    // Move the body forward and write the length in front of it.
    this.reserve(size);
    this.buf.copyWithin(start + size, start, this.pos);
    this.pos += size;
    let at = start;
    let rest = length;
    while (rest > 0x7f) {
      this.buf[at] = (rest & 0x7f) | 0x80;
      at += 1;
      rest >>>= 7;
    }
    this.buf[at] = rest;
    return this;
  }

  /** Write a field's tag: its number and wire type. */
  tag(fieldNo: number, wireType: WireType): BinaryWriter {
    return this.uint32(((fieldNo << 3) | wireType) >>> 0);
  }

  /** Write raw bytes. */
  raw(chunk: Uint8Array): BinaryWriter {
    this.reserve(chunk.length);
    this.buf.set(chunk, this.pos);
    this.pos += chunk.length;
    return this;
  }

  /** Write an unsigned 32-bit varint. */
  uint32(value: number): BinaryWriter {
    this.reserve(5);
    let rest = value >>> 0;
    while (rest > 0x7f) {
      this.buf[this.pos] = (rest & 0x7f) | 0x80;
      this.pos += 1;
      rest >>>= 7;
    }
    this.buf[this.pos] = rest;
    this.pos += 1;
    return this;
  }

  /** Write a signed 32-bit varint. A negative value takes ten bytes. */
  int32(value: number): BinaryWriter {
    if (value < 0) {
      this.varint64(value | 0, -1);
    } else {
      this.uint32(value);
    }
    return this;
  }

  /** Write a zigzag-encoded signed 32-bit varint. */
  sint32(value: number): BinaryWriter {
    return this.uint32((value << 1) ^ (value >> 31));
  }

  /** Write a bool as a one-byte varint. */
  bool(value: boolean): BinaryWriter {
    this.reserve(1);
    this.buf[this.pos] = value ? 1 : 0;
    this.pos += 1;
    return this;
  }

  /** Write a signed 64-bit varint. */
  int64(value: bigint): BinaryWriter {
    this.varint64(
      Number(BigInt.asUintN(32, value)),
      Number(BigInt.asUintN(32, value >> 32n)),
    );
    return this;
  }

  /** Write an unsigned 64-bit varint. */
  uint64(value: bigint): BinaryWriter {
    return this.int64(value);
  }

  /** Write a zigzag-encoded signed 64-bit varint. */
  sint64(value: bigint): BinaryWriter {
    return this.int64((value << 1n) ^ (value >> 63n));
  }

  /** Write an unsigned 32-bit integer in 4 bytes. */
  fixed32(value: number): BinaryWriter {
    this.reserve(4);
    this.view.setUint32(this.pos, value, true);
    this.pos += 4;
    return this;
  }

  /** Write a signed 32-bit integer in 4 bytes. */
  sfixed32(value: number): BinaryWriter {
    this.reserve(4);
    this.view.setInt32(this.pos, value, true);
    this.pos += 4;
    return this;
  }

  /** Write an unsigned 64-bit integer in 8 bytes. */
  fixed64(value: bigint): BinaryWriter {
    this.reserve(8);
    this.view.setBigUint64(this.pos, BigInt.asUintN(64, value), true);
    this.pos += 8;
    return this;
  }

  /** Write a signed 64-bit integer in 8 bytes. */
  sfixed64(value: bigint): BinaryWriter {
    this.reserve(8);
    this.view.setBigInt64(this.pos, BigInt.asIntN(64, value), true);
    this.pos += 8;
    return this;
  }

  /** Write a 32-bit float. */
  float(value: number): BinaryWriter {
    this.reserve(4);
    this.view.setFloat32(this.pos, value, true);
    this.pos += 4;
    return this;
  }

  /** Write a 64-bit float. */
  double(value: number): BinaryWriter {
    this.reserve(8);
    this.view.setFloat64(this.pos, value, true);
    this.pos += 8;
    return this;
  }

  /** Write length-delimited bytes. */
  bytes(value: Uint8Array): BinaryWriter {
    this.uint32(value.length);
    return this.raw(value);
  }

  /** Write a length-delimited UTF-8 string. */
  string(value: string): BinaryWriter {
    return this.bytes((encoder ??= new TextEncoder()).encode(value));
  }

  // varint64 writes the 64-bit varint whose low and high words are lo and hi.
  private varint64(lo: number, hi: number): void {
    this.reserve(10);
    let low = lo >>> 0;
    let high = hi >>> 0;
    while (high > 0 || low > 0x7f) {
      this.buf[this.pos] = (low & 0x7f) | 0x80;
      this.pos += 1;
      low = ((low >>> 7) | (high << 25)) >>> 0;
      high >>>= 7;
    }
    this.buf[this.pos] = low;
    this.pos += 1;
  }

  // reserve grows the buffer, doubling it, until n more bytes fit.
  private reserve(n: number): void {
    const need = this.pos + n;
    if (need <= this.buf.length) {
      return;
    }
    let size = this.buf.length * 2;
    while (size < need) {
      size *= 2;
    }
    const buf = new Uint8Array(size);
    buf.set(this.buf.subarray(0, this.pos));
    this.buf = buf;
    this.view = new DataView(buf.buffer);
  }
}

// overLimit is thrown by SizeWriter once the count passes its limit.
const overLimit = new Error("size limit exceeded");

/**
 * SizeWriter counts the bytes an encoder would write without writing them.
 *
 * Once the count passes limit, the next write throws, so sizeOf stops a large
 * message early.
 */
class SizeWriter implements Writer {
  /** Number of bytes counted so far. */
  size = 0;

  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  fork(): number {
    return this.size;
  }

  join(start: number): SizeWriter {
    return this.add(varintSize(this.size - start));
  }

  tag(fieldNo: number, wireType: WireType): SizeWriter {
    return this.add(varintSize(((fieldNo << 3) | wireType) >>> 0));
  }

  raw(chunk: Uint8Array): SizeWriter {
    return this.add(chunk.length);
  }

  uint32(value: number): SizeWriter {
    return this.add(varintSize(value >>> 0));
  }

  int32(value: number): SizeWriter {
    return this.add(value < 0 ? 10 : varintSize(value));
  }

  sint32(value: number): SizeWriter {
    return this.uint32((value << 1) ^ (value >> 31));
  }

  bool(): SizeWriter {
    return this.add(1);
  }

  int64(value: bigint): SizeWriter {
    const hi = Number(BigInt.asUintN(32, value >> 32n));
    if (hi === 0) {
      return this.add(varintSize(Number(BigInt.asUintN(32, value))));
    }
    // Each byte past the first 28 bits carries 7 more of the high word.
    return this.add(4 + varintSize(hi * 16 + 15));
  }

  uint64(value: bigint): SizeWriter {
    return this.int64(value);
  }

  sint64(value: bigint): SizeWriter {
    return this.int64((value << 1n) ^ (value >> 63n));
  }

  fixed32(): SizeWriter {
    return this.add(4);
  }

  sfixed32(): SizeWriter {
    return this.add(4);
  }

  fixed64(): SizeWriter {
    return this.add(8);
  }

  sfixed64(): SizeWriter {
    return this.add(8);
  }

  float(): SizeWriter {
    return this.add(4);
  }

  double(): SizeWriter {
    return this.add(8);
  }

  bytes(value: Uint8Array): SizeWriter {
    return this.add(varintSize(value.length) + value.length);
  }

  string(value: string): SizeWriter {
    const length = utf8Length(value);
    return this.add(varintSize(length) + length);
  }

  private add(n: number): SizeWriter {
    this.size += n;
    if (this.size > this.limit) {
      throw overLimit;
    }
    return this;
  }
}

// varintSize returns the length of the varint of an unsigned 32-bit value, or
// of a larger value below 2^53.
function varintSize(value: number): number {
  let size = 1;
  for (let rest = value; rest > 0x7f; rest = Math.floor(rest / 128)) {
    size += 1;
  }
  return size;
}

// utf8Length returns the length of value encoded as UTF-8. A lone surrogate
// counts as the three bytes of the replacement character TextEncoder writes.
function utf8Length(value: string): number {
  let length = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x80) {
      length += 1;
    } else if (c < 0x800) {
      length += 2;
    } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next < 0xe000) {
        length += 4;
        i += 1;
      } else {
        length += 3;
      }
    } else {
      length += 3;
    }
  }
  return length;
}

/**
 * sizeOf returns the encoded size of message m, without encoding it.
 *
 * With a limit, it stops counting once the size passes the limit and returns
 * a number above it, so checking a bound costs at most limit bytes of work.
 */
export function sizeOf<T>(
  type: { encode(m: T, w: Writer): void },
  m: T,
  limit?: number,
): number {
  const w = new SizeWriter(limit ?? Infinity);
  try {
    type.encode(m, w);
  } catch (e) {
    if (e !== overLimit) {
      throw e;
    }
  }
  return w.size;
}

/**
 * BinaryReader reads protobuf wire values from a byte array.
 *
 * Generated decoders read a tag, switch on its field number, and read the
 * value with the method for the field's type. Bytes values alias the input.
 */
export class BinaryReader {
  /** Offset of the next byte to read. */
  pos = 0;

  /** Number of bytes in the input. */
  readonly len: number;

  private readonly buf: Uint8Array;
  private readonly view: DataView;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.len = buf.length;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  /**
   * Read a tag. The field number is tag >>> 3 and the wire type is tag & 7.
   * Field number 0 and wire types 6 and 7 do not exist, so they throw.
   */
  tag(): number {
    const t = this.uint32();
    if (t >>> 3 === 0 || (t & 7) > 5) {
      throw new Error(`illegal tag: field no ${t >>> 3} wire type ${t & 7}`);
    }
    return t;
  }

  /**
   * Read a length prefix and return the offset where the delimited value
   * ends.
   */
  delimited(): number {
    const end = this.uint32() + this.pos;
    if (end > this.len) {
      throw new RangeError("premature EOF");
    }
    return end;
  }

  /**
   * Return the offset where a repeated scalar field's values end. A packed
   * field holds a delimited run; an unpacked one holds one value, and since
   * every value takes at least one byte, the offset one past the current
   * position ends the run after it.
   */
  run(tag: number): number {
    return (tag & 7) === WireType.LengthDelimited ?
        this.delimited()
      : this.pos + 1;
  }

  /**
   * Skip the value of the field with the given tag. A group is skipped through
   * its end tag.
   */
  skip(tag: number): void {
    const wireType = tag & 7;
    switch (wireType) {
      case WireType.Varint:
        while ((this.buf[this.pos] & 0x80) !== 0) {
          this.pos += 1;
        }
        this.pos += 1;
        break;
      case WireType.Bit64:
        this.pos += 8;
        break;
      case WireType.LengthDelimited:
        this.pos = this.delimited();
        break;
      case WireType.StartGroup:
        for (;;) {
          const t = this.tag();
          if ((t & 7) === WireType.EndGroup) {
            break;
          }
          this.skip(t);
        }
        break;
      case WireType.Bit32:
        this.pos += 4;
        break;
      default:
        throw new Error("cannot skip wire type " + String(wireType));
    }
    if (this.pos > this.len) {
      throw new RangeError("premature EOF");
    }
  }

  /**
   * Read one delimited map entry and return its key and value. A missing key
   * or value keeps k or v, the zero values of the map's types.
   */
  entry<K, V>(
    key: (r: BinaryReader) => K,
    value: (r: BinaryReader) => V,
    k: K,
    v: V,
  ): [K, V] {
    const end = this.delimited();
    while (this.pos < end) {
      const t = this.tag();
      switch (t >>> 3) {
        case 1:
          k = key(this);
          break;
        case 2:
          v = value(this);
          break;
        default:
          this.skip(t);
      }
    }
    return [k, v];
  }

  /** Read an unsigned 32-bit varint, keeping the low 32 bits. */
  uint32(): number {
    let value = 0;
    for (let shift = 0; shift < 64; shift += 7) {
      if (this.pos >= this.len) {
        throw new RangeError("premature EOF");
      }
      const b = this.buf[this.pos];
      this.pos += 1;
      if (shift < 32) {
        value |= (b & 0x7f) << shift;
      }
      if (b < 0x80) {
        return value >>> 0;
      }
    }
    throw new Error("invalid varint");
  }

  /** Read a signed 32-bit varint. */
  int32(): number {
    return this.uint32() | 0;
  }

  /** Read a zigzag-encoded signed 32-bit varint. */
  sint32(): number {
    const zz = this.uint32();
    return (zz >>> 1) ^ -(zz & 1);
  }

  /** Read a bool varint. */
  bool(): boolean {
    let bits = 0;
    for (;;) {
      if (this.pos >= this.len) {
        throw new RangeError("premature EOF");
      }
      const b = this.buf[this.pos];
      this.pos += 1;
      bits |= b & 0x7f;
      if (b < 0x80) {
        return bits !== 0;
      }
    }
  }

  /** Read a signed 64-bit varint. */
  int64(): bigint {
    return BigInt.asIntN(64, this.uint64());
  }

  /** Read an unsigned 64-bit varint. */
  uint64(): bigint {
    // Gather the low and high words in 32-bit arithmetic.
    let lo = 0;
    let hi = 0;
    for (let shift = 0; shift < 70; shift += 7) {
      if (this.pos >= this.len) {
        throw new RangeError("premature EOF");
      }
      const b = this.buf[this.pos];
      this.pos += 1;
      const bits = b & 0x7f;
      if (shift < 28) {
        lo |= bits << shift;
      } else if (shift === 28) {
        lo |= bits << 28;
        hi |= bits >>> 4;
      } else {
        hi |= bits << (shift - 32);
      }
      if (b < 0x80) {
        return (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
      }
    }
    throw new Error("invalid varint");
  }

  /** Read a zigzag-encoded signed 64-bit varint. */
  sint64(): bigint {
    const zz = this.uint64();
    return (zz >> 1n) ^ -(zz & 1n);
  }

  /** Read an unsigned 32-bit integer from 4 bytes. */
  fixed32(): number {
    const value = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return value;
  }

  /** Read a signed 32-bit integer from 4 bytes. */
  sfixed32(): number {
    const value = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return value;
  }

  /** Read an unsigned 64-bit integer from 8 bytes. */
  fixed64(): bigint {
    const value = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return value;
  }

  /** Read a signed 64-bit integer from 8 bytes. */
  sfixed64(): bigint {
    const value = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return value;
  }

  /** Read a 32-bit float. */
  float(): number {
    const value = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return value;
  }

  /** Read a 64-bit float. */
  double(): number {
    const value = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return value;
  }

  /** Read length-delimited bytes, aliasing the input. */
  bytes(): Uint8Array {
    const length = this.uint32();
    const start = this.pos;
    this.pos += length;
    if (this.pos > this.len) {
      throw new RangeError("premature EOF");
    }
    return this.buf.subarray(start, this.pos);
  }

  /**
   * Read a length-delimited UTF-8 string, replacing invalid sequences with
   * U+FFFD.
   */
  string(): string {
    return (decoder ??= new TextDecoder()).decode(this.bytes());
  }

  /** Read a length-delimited string, and throw if it is not valid UTF-8. */
  utf8(): string {
    return (strictDecoder ??= new TextDecoder("utf-8", { fatal: true })).decode(
      this.bytes(),
    );
  }
}
