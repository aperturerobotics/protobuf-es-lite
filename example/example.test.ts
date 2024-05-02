import { EchoMsg, ExampleEnum } from "./example.pb.js";

import { describe, it, expect } from 'vitest';

describe("EchoMsg", () => {
  it("creates an empty message", () => {
    const msg = EchoMsg.create();
    expect(msg).toEqual({});
  });

  it("creates a message with a body", () => {
    const msg = EchoMsg.create({ body: "Hello, world!" });
    expect(msg).toEqual({ body: "Hello, world!" });
  });

  /*
  it("creates a message with a timestamp", () => {
    const now = new Date();
    const msg = EchoMsg.create({ ts: now });
    expect(msg).toEqual({ ts: now });
  });
  */

  /*
  it("creates a message with repeated timestamps", () => {
    const now = new Date();
    const later = new Date(now.getTime() + 60000);
    const msg = EchoMsg.create({ timestamps: [now, later] });
    expect(msg).toEqual({ timestamps: [now, later] });
  });
  */

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
      ts: {nanos: 0, seconds: BigInt(0)},
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

  /*
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
  */

  it("checks message equality", () => {  
    const msg1 = EchoMsg.create({ body: "test" });
    const msg2 = EchoMsg.create({ body: "test" });
    const msg3 = EchoMsg.create({ body: "different" });
    expect(EchoMsg.equals(msg1, msg2)).toBe(true);
    expect(EchoMsg.equals(msg1, msg3)).toBe(false);
  });

  /*
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
  **/

  it("checks message equality with oneofs", () => {
    const msg1 = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const msg2 = EchoMsg.create({ demo: { case: "exampleString", value: "test" } }); 
    const msg3 = EchoMsg.create({ demo: { case: "exampleEnum", value: ExampleEnum.FIRST } });
    expect(EchoMsg.equals(msg1, msg2)).toBe(true);
    expect(EchoMsg.equals(msg1, msg3)).toBe(false);
  });

  /*
  it("checks message equality with timestamps", () => {
    const now = new Date();  
    const msg1 = EchoMsg.create({ ts: now });
    const msg2 = EchoMsg.create({ ts: now });
    const later = new Date(now.getTime() + 60000);
    const msg3 = EchoMsg.create({ ts: later });
    expect(EchoMsg.equals(msg1, msg2)).toBe(true);
    expect(EchoMsg.equals(msg1, msg3)).toBe(false);
  });
  */

  /*
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
  */

  it("serializes and deserializes binary with oneofs", () => {
    const msg = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const binary = EchoMsg.toBinary(msg);
    const msg2 = EchoMsg.fromBinary(binary);
    expect(msg).toEqual(msg2);
  });

  /*
  it("serializes and deserializes binary with timestamps", () => {
    const msg = EchoMsg.create({ ts: new Date() });
    const binary = EchoMsg.toBinary(msg);
    const msg2 = EchoMsg.fromBinary(binary);
    expect(msg).toEqual(msg2);
  });
  */

  it("serializes and deserializes JSON with oneofs", () => {
    const msg = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const json = EchoMsg.toJson(msg);
    const msg2 = EchoMsg.fromJson(json);
    expect(msg2).toEqual(msg);
  });

  /*
  it("serializes and deserializes JSON with timestamps", () => {
    const msg = EchoMsg.create({ ts: new Date() });
    const json = EchoMsg.toJson(msg);
    const msg2 = EchoMsg.fromJson(json);
    expect(msg).toEqual(msg2);
  });
  */

  it("serializes and deserializes JSON string with oneofs", () => {
    const msg = EchoMsg.create({ demo: { case: "exampleString", value: "test" } });
    const jsonString = EchoMsg.toJsonString(msg);
    const msg2 = EchoMsg.fromJsonString(jsonString);
    expect(msg).toEqual(msg2);
  });

  /*
  it("serializes and deserializes JSON string with timestamps", () => {
    const msg = EchoMsg.create({ ts: new Date() });
    const jsonString = EchoMsg.toJsonString(msg);
    const msg2 = EchoMsg.fromJsonString(jsonString);
    expect(msg).toEqual(msg2);
  });
  */
});
