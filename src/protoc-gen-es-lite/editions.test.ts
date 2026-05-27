import { describe, expect, it } from "vitest";
import { protocGenEsLite } from "./protoc-gen-es-lite-plugin.js";
import {
  CodeGeneratorRequest,
  CodeGeneratorResponse_Feature,
} from "../google/protobuf/compiler/plugin.pb.js";
import { createDescriptorSet } from "../create-descriptor-set.js";
import {
  Edition,
  FeatureSet_EnumType,
  FeatureSet_FieldPresence,
  FeatureSet_JsonFormat,
  FeatureSet_MessageEncoding,
  FeatureSet_RepeatedFieldEncoding,
  FeatureSet_Utf8Validation,
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  FileDescriptorProto,
} from "../google/protobuf/descriptor.pb.js";

describe("protoc-gen-es-lite editions", () => {
  it("advertises Edition 2024 and generates resolved field metadata", () => {
    const response = protocGenEsLite.run(
      CodeGeneratorRequest.create({
        parameter: "target=ts,ts_nocheck=false",
        fileToGenerate: ["editions2024.proto"],
        protoFile: [edition2024File()],
      }),
    );

    const supportsEditions = BigInt(
      CodeGeneratorResponse_Feature.SUPPORTS_EDITIONS,
    );
    expect((response.supportedFeatures ?? 0n) & supportsEditions).toBe(
      supportsEditions,
    );
    expect(response.minimumEdition).toBe(Edition.EDITION_PROTO2);
    expect(response.maximumEdition).toBe(Edition.EDITION_2024);

    const content = response.file?.[0]?.content ?? "";
    expect(content).toContain("packedByDefault: true");
    expect(content).toContain(
      '{ no: 1, name: "explicit_int32", kind: "scalar", T: ScalarType.INT32, opt: true }',
    );
    expect(content).toContain(
      '{ no: 2, name: "implicit_int32", kind: "scalar", T: ScalarType.INT32 }',
    );
    expect(content).toContain(
      '{ no: 3, name: "required_int32", kind: "scalar", T: ScalarType.INT32, req: true }',
    );
    expect(content).toContain(
      '{ no: 4, name: "strict_string", kind: "scalar", T: ScalarType.STRING, utf8: true, opt: true }',
    );
    expect(content).toContain(
      '{ no: 5, name: "loose_string", kind: "scalar", T: ScalarType.STRING, opt: true }',
    );
    expect(content).toContain(
      '{ no: 7, name: "expanded_int32", kind: "scalar", T: ScalarType.INT32, repeated: true, packed: false }',
    );
    expect(content).toContain(
      '{ no: 8, name: "delimited_child", kind: "message", T: () => Child, delimited: true, opt: true }',
    );
    expect(content).toContain(
      '{ no: 9, name: "labels", kind: "map", K: ScalarType.STRING, keyUtf8: true, V: {kind: "scalar", T: ScalarType.STRING, utf8: true} }',
    );
  });

  it("keeps source optionality separate from Edition explicit presence", () => {
    const set = createDescriptorSet([edition2024File()]);
    const message = set.messages.get("ed.M");
    const field = message?.fields.find(
      (field) => field.name == "explicit_int32",
    );

    expect(field?.optional).toBe(false);
    expect(field?.explicitPresence).toBe(true);
    expect(field?.declarationString()).toBe("int32 explicit_int32 = 1");
  });

  it("rejects closed enum semantics", () => {
    const file = edition2024File();
    file.enumType = [
      {
        name: "Closed",
        options: {
          features: {
            enumType: FeatureSet_EnumType.CLOSED,
          },
        },
        value: [{ name: "CLOSED_UNSPECIFIED", number: 0 }],
      },
    ];

    expect(() =>
      protocGenEsLite.run(
        CodeGeneratorRequest.create({
          parameter: "target=ts",
          fileToGenerate: ["editions2024.proto"],
          protoFile: [file],
        }),
      ),
    ).toThrow(/closed enums are not supported/);
  });

  it("rejects legacy JSON semantics", () => {
    const file = edition2024File();
    file.options = {
      features: {
        jsonFormat: FeatureSet_JsonFormat.LEGACY_BEST_EFFORT,
      },
    };

    expect(() =>
      protocGenEsLite.run(
        CodeGeneratorRequest.create({
          parameter: "target=ts",
          fileToGenerate: ["editions2024.proto"],
          protoFile: [file],
        }),
      ),
    ).toThrow(/LEGACY_BEST_EFFORT is not supported/);
  });
});

function edition2024File(): FileDescriptorProto {
  return FileDescriptorProto.create({
    name: "editions2024.proto",
    package: "ed",
    syntax: "editions",
    edition: Edition.EDITION_2024,
    enumType: [
      {
        name: "Status",
        value: [{ name: "STATUS_UNSPECIFIED", number: 0 }],
      },
    ],
    messageType: [
      {
        name: "Child",
        field: [
          {
            name: "label",
            number: 1,
            label: FieldDescriptorProto_Label.OPTIONAL,
            type: FieldDescriptorProto_Type.STRING,
          },
        ],
      },
      {
        name: "M",
        field: [
          {
            name: "explicit_int32",
            number: 1,
            label: FieldDescriptorProto_Label.OPTIONAL,
            type: FieldDescriptorProto_Type.INT32,
          },
          {
            name: "implicit_int32",
            number: 2,
            label: FieldDescriptorProto_Label.OPTIONAL,
            type: FieldDescriptorProto_Type.INT32,
            options: {
              features: {
                fieldPresence: FeatureSet_FieldPresence.IMPLICIT,
              },
            },
          },
          {
            name: "required_int32",
            number: 3,
            label: FieldDescriptorProto_Label.OPTIONAL,
            type: FieldDescriptorProto_Type.INT32,
            options: {
              features: {
                fieldPresence: FeatureSet_FieldPresence.LEGACY_REQUIRED,
              },
            },
          },
          {
            name: "strict_string",
            number: 4,
            label: FieldDescriptorProto_Label.OPTIONAL,
            type: FieldDescriptorProto_Type.STRING,
          },
          {
            name: "loose_string",
            number: 5,
            label: FieldDescriptorProto_Label.OPTIONAL,
            type: FieldDescriptorProto_Type.STRING,
            options: {
              features: {
                utf8Validation: FeatureSet_Utf8Validation.NONE,
              },
            },
          },
          {
            name: "packed_int32",
            number: 6,
            label: FieldDescriptorProto_Label.REPEATED,
            type: FieldDescriptorProto_Type.INT32,
          },
          {
            name: "expanded_int32",
            number: 7,
            label: FieldDescriptorProto_Label.REPEATED,
            type: FieldDescriptorProto_Type.INT32,
            options: {
              features: {
                repeatedFieldEncoding:
                  FeatureSet_RepeatedFieldEncoding.EXPANDED,
              },
            },
          },
          {
            name: "delimited_child",
            number: 8,
            label: FieldDescriptorProto_Label.OPTIONAL,
            type: FieldDescriptorProto_Type.MESSAGE,
            typeName: ".ed.Child",
            options: {
              features: {
                messageEncoding: FeatureSet_MessageEncoding.DELIMITED,
              },
            },
          },
          {
            name: "labels",
            number: 9,
            label: FieldDescriptorProto_Label.REPEATED,
            type: FieldDescriptorProto_Type.MESSAGE,
            typeName: ".ed.M.LabelsEntry",
          },
        ],
        nestedType: [
          {
            name: "LabelsEntry",
            field: [
              {
                name: "key",
                number: 1,
                label: FieldDescriptorProto_Label.OPTIONAL,
                type: FieldDescriptorProto_Type.STRING,
              },
              {
                name: "value",
                number: 2,
                label: FieldDescriptorProto_Label.OPTIONAL,
                type: FieldDescriptorProto_Type.STRING,
              },
            ],
            options: {
              mapEntry: true,
            },
          },
        ],
      },
    ],
  });
}
