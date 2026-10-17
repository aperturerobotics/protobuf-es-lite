const MIN = -0x8000000000000000n;
const MAX = 0x7fffffffffffffffn;
const UMAX = 0xffffffffffffffffn;

/**
 * protoInt64 parses and range-checks the 64-bit integers of protobuf, which
 * are bigint values.
 */
export const protoInt64 = {
  /** The zero value of a 64-bit field. */
  zero: 0n,

  /** BigInt is always available. Kept for callers that checked. */
  supported: true,

  /** Parse a signed 64-bit integer, and throw if it is out of range. */
  parse(value: string | number | bigint): bigint {
    const v = typeof value === "bigint" ? value : BigInt(value);
    if (v > MAX || v < MIN) {
      throw new Error(`int64 invalid: ${value}`);
    }
    return v;
  },

  /** Parse an unsigned 64-bit integer, and throw if it is out of range. */
  uParse(value: string | number | bigint): bigint {
    const v = typeof value === "bigint" ? value : BigInt(value);
    if (v > UMAX || v < 0n) {
      throw new Error(`uint64 invalid: ${value}`);
    }
    return v;
  },
};
