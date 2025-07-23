import { describe, it, expect } from 'vitest';
import { EchoMsg, ExampleEnum } from "./example.pb.js";
import { Timestamp } from "../src/google/protobuf/timestamp.pb.js";

function dateEquals(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

describe("EchoMsg", () => {
  it("creates an empty message", () => {
    const msg = EchoMsg.create();
    expect(msg).toEqual({});
  });

  it("creates a message with a custom timestamp", () => {
    const customDate = new Date(2022, 0, 1);
    const msg = EchoMsg.create({ ts: customDate });
    expect(dateEquals(msg.ts!, customDate)).toBe(true);
  });

  it("creates a message with a custom timestamp using Timestamp", () => {
    const customDate = new Date(2022, 0, 1);
    const timestamp = Timestamp.fromDate(customDate);
    // Although the type definitions don't currently specify it:
    // We allow specifying the message form of Timestamp as well.
    const msg = EchoMsg.create({ ts: timestamp as Date });
    expect(dateEquals(msg.ts!, customDate)).toBe(true);
  });

  it("serializes and deserializes binary with custom timestamp", () => {
    const customDate = new Date(2022, 0, 1);
    const msg = EchoMsg.create({ ts: customDate });
    const binary = EchoMsg.toBinary(msg);
    const msg2 = EchoMsg.fromBinary(binary);
    expect(dateEquals(msg2.ts!, customDate)).toBe(true);
  });

  it("serializes and deserializes JSON with custom timestamp", () => {
    const customDate = new Date(2022, 0, 1);
    const msg = EchoMsg.create({ ts: customDate });
    const json = EchoMsg.toJson(msg);
    const msg2 = EchoMsg.fromJson(json);
    expect(dateEquals(msg2.ts!, customDate)).toBe(true);
  });

  it("serializes and deserializes JSON string with custom timestamp", () => {
    const customDate = new Date(2022, 0, 1);
    const msg = EchoMsg.create({ ts: customDate });
    const jsonString = EchoMsg.toJsonString(msg);
    const msg2 = EchoMsg.fromJsonString(jsonString);
    expect(dateEquals(msg2.ts!, customDate)).toBe(true);
  });

  it("creates a message with a body", () => {
    const msg = EchoMsg.create({ body: "Hello, world!" });
    expect(msg).toEqual({ body: "Hello, world!" });
  });

  it("creates a message with a timestamp", () => {
    const now = new Date();
    const msg = EchoMsg.create({ ts: now });
    expect(msg).toEqual({ ts: now });
  });

  it("creates a message with a future timestamp", () => {
    const future = new Date(Date.now() + 60000);
    const msg = EchoMsg.create({ ts: future });
    expect(msg).toEqual({ ts: future });
  });

  it("creates a message with a zero timestamp", () => {
    const msg = EchoMsg.create({ ts: new Date(0) });
    expect(msg).toEqual({ ts: null });
  });

  it("creates a message with a negative timestamp", () => {
    const past = new Date(Date.now() - 60000);
    const msg = EchoMsg.create({ ts: past });
    expect(msg).toEqual({ ts: past });
  });



  it("creates a message with an example enum", () => {
    const msg = EchoMsg.create({ demo: { case: "exampleEnum", value: ExampleEnum.FIRST } });
    expect(msg).toEqual({ demo: { case: "exampleEnum", value: ExampleEnum.FIRST } });
  });

  it("creates a message with an example string", () => {
    const msg = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    expect(msg).toEqual({ demo: { case: "exampleString", value: "test" } });
  });

  it("creates a complete message", () => {
    const msg = EchoMsg.createComplete({ body: "test" });
    expect(msg).toEqual({ 
      body: "test",
      ts: null,
      timestamps: [],
      demo: { case: undefined }
    });
  });

  it("clones a message", () => {
    const msg1 = EchoMsg.create({ body: "test" });
    const msg2 = EchoMsg.clone(msg1);
    expect(msg1).not.toBe(msg2);
    expect(msg1).toEqual(msg2);
  });

  it("clones a message with a oneof", () => {
    const msg1 = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const msg2 = EchoMsg.clone(msg1);
    expect(msg1).not.toBe(msg2);
    expect(msg1).toEqual(msg2);
  });

  it("clones a message with a timestamp", () => {
    const now = new Date();
    const msg1 = EchoMsg.create({ ts: now });
    const msg2 = EchoMsg.clone(msg1);
    expect(msg1).not.toBe(msg2);
    expect(msg1).toEqual(msg2);
  });

  it("clones a message with repeated timestamps", () => {
    const now = new Date();
    const later = new Date(now.getTime() + 60000);
    const msg1 = EchoMsg.create({ timestamps: [now, later] });
    const msg2 = EchoMsg.clone(msg1);
    expect(msg1).not.toBe(msg2);
    expect(msg1).toEqual(msg2);
  });

  it("checks message equality", () => {  
    const msg1 = EchoMsg.create({ body: "test" });
    const msg2 = EchoMsg.create({ body: "test" });
    const msg3 = EchoMsg.create({ body: "different" });
    expect(EchoMsg.equals(msg1, msg2)).toBe(true);
    expect(EchoMsg.equals(msg1, msg3)).toBe(false);
  });

  it("serializes and deserializes binary", () => {
    const msg = EchoMsg.create({ body: "test", timestamps: [new Date()] });
    const binary = EchoMsg.toBinary(msg);
    const msg2 = EchoMsg.fromBinary(binary);
    expect(msg2).toEqual(msg);
  });

  it("serializes and deserializes JSON", () => {
    const msg = EchoMsg.create({ body: "test", timestamps: [new Date()] });
    const json = EchoMsg.toJson(msg);
    const msg2 = EchoMsg.fromJson(json);
    expect(msg2).toEqual(msg);
  });

  it("serializes and deserializes JSON string", () => {
    const msg = EchoMsg.create({ body: "test", timestamps: [new Date()] });
    const jsonString = EchoMsg.toJsonString(msg);
    const msg2 = EchoMsg.fromJsonString(jsonString);
    expect(msg).toEqual(msg2);
  });

  it("checks message equality with oneofs", () => {
    const msg1 = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const msg2 = EchoMsg.create({ demo: { case: "exampleString", value: "test" } }); 
    const msg3 = EchoMsg.create({ demo: { case: "exampleEnum", value: ExampleEnum.FIRST } });
    expect(EchoMsg.equals(msg1, msg2)).toBe(true);
    expect(EchoMsg.equals(msg1, msg3)).toBe(false);
  });

  it("checks message equality with timestamps", () => {
    const now = new Date();  
    const msg1 = EchoMsg.create({ ts: now });
    const msg2 = EchoMsg.create({ ts: now });
    const later = new Date(now.getTime() + 60000);
    const msg3 = EchoMsg.create({ ts: later });
    expect(EchoMsg.equals(msg1, msg2)).toBe(true);
    expect(EchoMsg.equals(msg1, msg3)).toBe(false);
  });

  it("checks message equality with repeated timestamps", () => {
    const now = new Date();
    const later = new Date(now.getTime() + 60000);
    const msg1 = EchoMsg.create({ timestamps: [now, later] });
    const msg2 = EchoMsg.create({ timestamps: [now, later] });
    const evenLater = new Date(now.getTime() + 120000);
    const msg3 = EchoMsg.create({ timestamps: [now, evenLater] });
    expect(EchoMsg.equals(msg1, msg2)).toBe(true);
    expect(EchoMsg.equals(msg1, msg3)).toBe(false);
  });

  it("serializes and deserializes binary with oneofs", () => {
    const msg = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const binary = EchoMsg.toBinary(msg);
    const msg2 = EchoMsg.fromBinary(binary);
    expect(msg).toEqual(msg2);
  });

  it("serializes and deserializes binary with timestamps", () => {
    const msg = EchoMsg.create({ ts: new Date() });
    const binary = EchoMsg.toBinary(msg);
    const msg2 = EchoMsg.fromBinary(binary);
    expect(msg).toEqual(msg2);
  });

  it("serializes and deserializes JSON with oneofs", () => {
    const msg = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const json = EchoMsg.toJson(msg);
    const msg2 = EchoMsg.fromJson(json);
    expect(msg2).toEqual(msg);
  });

  it("serializes and deserializes JSON with timestamps", () => {
    const msg = EchoMsg.create({ ts: new Date() });
    const json = EchoMsg.toJson(msg);
    const msg2 = EchoMsg.fromJson(json);
    expect(msg).toEqual(msg2);
  });

  it("serializes and deserializes JSON string with oneofs", () => {
    const msg = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const jsonString = EchoMsg.toJsonString(msg);
    const msg2 = EchoMsg.fromJsonString(jsonString);
    expect(msg).toEqual(msg2);
  });

  it("serializes and deserializes JSON string with timestamps", () => {
    const msg = EchoMsg.create({ ts: new Date() });
    const jsonString = EchoMsg.toJsonString(msg);
    const msg2 = EchoMsg.fromJsonString(jsonString);
    expect(msg).toEqual(msg2);
  });

  it("toBinary with null returns empty Uint8Array", () => {
    const binary = EchoMsg.toBinary(null as any);
    expect(binary).toBeInstanceOf(Uint8Array);
    expect(binary.length).toBe(0);
  });

  it("toBinary with undefined returns empty Uint8Array", () => {
    const binary = EchoMsg.toBinary(undefined as any);
    expect(binary).toBeInstanceOf(Uint8Array);
    expect(binary.length).toBe(0);
  });
});
