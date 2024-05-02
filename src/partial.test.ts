import { describe, expect, it } from "vitest";
import { applyPartialMessage, applyPartialMap } from "./partial.js";
import { ScalarType } from "./scalar.js";
import { EchoMsg, ExampleEnum } from "../example/example.pb.js";
import { Timestamp } from "./google/index.js";

describe("applyPartialMessage", () => {
  it("applies partial values to target message", () => {
    const source: Partial<EchoMsg> = {
      body: "Hello",
      ts: Timestamp.fromDate(new Date()),
      timestamps: [
        Timestamp.fromDate(new Date("2022-01-01")),
        Timestamp.fromDate(new Date("2022-02-01")),
      ],
      demo: { case: "exampleEnum", value: ExampleEnum.FIRST },
    };
    const target = {} as EchoMsg;
    const fieldList = EchoMsg.fields;
    applyPartialMessage(source, target, fieldList);

    expect(target).toEqual({
      body: "Hello",
      ts: source.ts,
      timestamps: source.timestamps,
      demo: { case: "exampleEnum", value: ExampleEnum.FIRST },
    });
  });

  it("clears fields set to null", () => {
    const source: Partial<EchoMsg> = {
      body: null,
      ts: null,
      timestamps: null,
      demo: { case: null },
    };
    const target: EchoMsg = {
      body: "Hello",
      ts: Timestamp.fromDate(new Date()),
      timestamps: [
        Timestamp.fromDate(new Date("2022-01-01")),
        Timestamp.fromDate(new Date("2022-02-01")),
      ],
      demo: { case: "exampleString", value: "test" },
    };
    const fieldList = EchoMsg.fields;
    applyPartialMessage(source, target, fieldList);

    expect(target).toEqual({
      demo: { case: null },
    });
  });
});

describe("applyPartialMap", () => {
  it("applies partial map values", () => {
    const source = {
      foo: 123,
      bar: 456,
    };
    const target = {
      baz: 789,
    };
    applyPartialMap(
      source,
      target,
      { kind: "scalar", T: ScalarType.INT32 },
      false,
    );

    expect(target).toEqual({
      foo: 123,
      bar: 456,
      baz: 789,
    });
  });

  it("clears map entries set to undefined", () => {
    const source = {
      foo: undefined,
    };
    const target = {
      foo: 123,
      bar: 456,
    };
    applyPartialMap(
      source,
      target,
      { kind: "scalar", T: ScalarType.INT32 },
      false,
    );

    expect(target).toEqual({
      bar: 456,
    });
  });
});
