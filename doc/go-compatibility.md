# Compatibility with protobuf-go-lite

protobuf-es-lite and [protobuf-go-lite](https://github.com/aperturerobotics/protobuf-go-lite) exchange messages generated from the same `.proto` files, such as StaRPC calls between a Go server and a browser. Each decodes what the other encodes, in the binary format and in JSON. This page lists where the two differ, so a program that crosses the boundary can avoid the differences.

## Binary format

Both runtimes write fields in ascending field-number order. protobuf-go-lite's `MarshalVT` writes the members of a oneof after the other fields, and `MarshalVTStrict` keeps strict field-number order. Neither runtime sorts map entries, so the same message can encode to different bytes; compare decoded messages, not encodings.

protobuf-go-lite keeps the fields it does not recognize and writes them back when it encodes the message again. protobuf-es-lite skips them while decoding. A message that passes through TypeScript code with an older schema therefore loses the fields that schema lacks.

## JSON

Field names are lowerCamelCase in both, `bytes` are standard base64, and the well-known types use their canonical JSON forms. The two writers differ in three places, and each reader accepts both forms:

| Value               | protobuf-go-lite writes                                      | protobuf-es-lite writes                        |
| ------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| 64-bit integers     | a JSON number                                                | a decimal string                               |
| Enums               | the number; clear `MarshalerConfig.EnumsAsInts` for the name | the name; set `enumAsInteger` for the number   |
| Unset scalar fields | omitted                                                      | omitted; set `emitDefaultValues` to write them |

A 64-bit integer above 2^53 that Go writes as a number loses precision in `JSON.parse` before protobuf-es-lite sees it. Send such values in the binary format, or as strings.

The readers differ on input they do not recognize:

| Input                | protobuf-go-lite                                          | protobuf-es-lite                             |
| -------------------- | --------------------------------------------------------- | -------------------------------------------- |
| An unknown field     | skipped                                                   | an error unless `ignoreUnknownFields` is set |
| An unknown enum name | an error unless `UnmarshalerConfig.DiscardUnknown` is set | an error unless `ignoreUnknownFields` is set |

Neither runtime has a global type registry, so reading or writing a `google.protobuf.Any` in JSON needs one: `AnyTypeResolver` in protobuf-go-lite's marshaler and unmarshaler configs, and `typeRegistry` in protobuf-es-lite's JSON options.
