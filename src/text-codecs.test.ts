import { afterEach, describe, expect, it, vi } from "vitest";

const { TextEncoder: realEncoder, TextDecoder: realDecoder } = globalThis;

afterEach(() => {
  globalThis.TextEncoder = realEncoder;
  globalThis.TextDecoder = realDecoder;
});

describe("text codecs", () => {
  it("load before the runtime installs TextEncoder and TextDecoder", async () => {
    vi.resetModules();
    // @ts-expect-error a runtime without the text codecs
    delete globalThis.TextEncoder;
    // @ts-expect-error a runtime without the text codecs
    delete globalThis.TextDecoder;
    const { Child } = await import("./testdata/codec.pb.js");

    globalThis.TextEncoder = realEncoder;
    globalThis.TextDecoder = realDecoder;
    const bin = Child.toBinary(Child.create({ label: "late" }));
    expect(Child.fromBinary(bin).label).toBe("late");
  });
});
