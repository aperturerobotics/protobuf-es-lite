# protobuf-es-lite

[![npm version](https://img.shields.io/npm/v/@aptre/protobuf-es-lite.svg)](https://www.npmjs.com/package/@aptre/protobuf-es-lite)
[![Tests](https://github.com/aperturerobotics/protobuf-es-lite/actions/workflows/tests.yml/badge.svg)](https://github.com/aperturerobotics/protobuf-es-lite/actions/workflows/tests.yml)

Protobuf messages as TypeScript interfaces and plain JavaScript objects, with serialization methods on a companion object:

```typescript
import { Greeting } from './gen/greeting.pb.js'

const message: Greeting = { body: 'Hello' }
const bytes = Greeting.toBinary(message)
const decoded = Greeting.fromBinary(bytes)
const json = Greeting.toJsonString(decoded)
```

The `@aptre/protobuf-es-lite` package includes the runtime and the `protoc-gen-es-lite` code generator. It generates TypeScript or JavaScript with declaration files, and supports binary encoding, Protobuf JSON, cloning, equality, oneofs, maps, and well-known types.

## Why this fork?

protobuf-es-lite derives from [Buf's protobuf-es](https://github.com/bufbuild/protobuf-es) and uses its Protoplugin framework. Its API takes inspiration from [ts-proto](https://github.com/stephenh/ts-proto): an interface describes the message, and a companion object with the same name provides its operations.

[Protobuf-ES v2 also uses plain objects](https://buf.build/blog/protobuf-es-v2). The choice today is between two APIs and their runtime conventions:

| | protobuf-es-lite | Protobuf-ES v2 |
| --- | --- | --- |
| Construct a message | Plain object or `Greeting.create({...})` | `create(GreetingSchema, {...})` |
| Encode a message | `Greeting.toBinary(message)` | `toBinary(GreetingSchema, message)` |
| Message shape | Optional properties; no required `$typeName` field | Generated message type includes `$typeName` |
| Defaults | `create()` keeps a sparse object; `createComplete()` fills defaults | `create()` initializes the schema's defaults |
| Runtime | Companion `MessageType` objects hold field metadata and methods | Schema descriptors are passed to runtime functions |

This fork suits applications that want sparse message values and methods grouped with each message type. [Spacewave](https://github.com/s4wave/spacewave) uses it for its Go and TypeScript application stack, alongside [protobuf-go-lite](https://github.com/aperturerobotics/protobuf-go-lite) and [StaRPC](https://github.com/aperturerobotics/starpc).

Generated code uses runtime field metadata for encoding and decoding. The Go counterpart, protobuf-go-lite, generates reflection-free static code. Choose between the libraries based on your schemas, compatibility requirements, and measured bundle size; this project makes no blanket speed or size comparison.

## Install

Use Node.js 20.19 or later in the 20.x series, or Node.js 22.12 or later.

```sh
npm install @aptre/protobuf-es-lite
```

Keep this package as a runtime dependency: generated code imports it. Choose either Buf or protoc to drive code generation.

## Generate code

Save this schema as `proto/greeting.proto`:

```protobuf
syntax = "proto3";
package example;

message Greeting {
  string body = 1;
}
```

### With Buf

Install the Buf CLI in your project:

```sh
npm install --save-dev @bufbuild/buf
```

Create `buf.gen.yaml` at the project root using [Buf's v2 configuration](https://buf.build/docs/configuration/v2/buf-gen-yaml/):

```yaml
version: v2
plugins:
  - local: protoc-gen-es-lite
    out: gen
    opt:
      - target=ts
      - ts_nocheck=false
inputs:
  - directory: proto
```

Generate `gen/greeting.pb.ts`:

```sh
npx buf generate
```

### With protoc

With `protoc` installed, run from the same project root:

```sh
mkdir -p gen
protoc -I proto \
  --plugin=protoc-gen-es-lite=./node_modules/.bin/protoc-gen-es-lite \
  --es-lite_out=gen \
  --es-lite_opt=target=ts,ts_nocheck=false \
  proto/greeting.proto
```

Both paths produce an interface and a companion object named `Greeting`. Import them as shown in the opening example. The `.js` import suffix is intentional for TypeScript projects that emit ECMAScript modules.

## Work with messages

```typescript
import { Greeting } from './gen/greeting.pb.js'

const sparse = Greeting.create() // {}
const complete = Greeting.createComplete() // { body: '' }
const message = Greeting.create({ body: 'Hello' })

const copy = Greeting.clone(message)
const same = Greeting.equals(message, copy) // true
const decoded = Greeting.fromJsonString('{"body":"Hello"}')
```

`create()` applies the supplied values without filling every field. Its returned object has a null prototype, so it inherits no methods; use `Object.hasOwn(message, 'body')` to check whether a property is present. Use `createComplete()` when code needs explicit defaults. Oneofs use a discriminated union such as `{ case: 'text', value: 'Hello' }`. The [example schema](./example/example.proto), [generated output](./example/example.pb.ts), and [tests](./example/example.test.ts) demonstrate timestamps, repeated fields, oneofs, and binary and JSON round trips.

## Compatibility

- Proto3 messages support optional fields, enums, maps, repeated fields, and oneofs. Edition 2024 support includes explicit and implicit field presence, required fields, UTF-8 validation, packed repeated fields, and delimited messages. The generator rejects closed enum semantics and `LEGACY_BEST_EFFORT` JSON. See the [Edition tests](./src/protoc-gen-es-lite/editions.test.ts).
- Timestamp fields map to JavaScript `Date` values. This limits them to millisecond precision. The timestamp mapping converts an all-zero timestamp to `null`; account for this when representing the Unix epoch. See the [timestamp implementation](./src/google/protobuf/timestamp.pb.ts).
- Generated types and runtime APIs differ from protobuf-es and ts-proto. Migration requires regenerating code and adapting callers. Check wire and JSON behavior for the schemas you share with other languages.
- Generate RPC clients and servers with a separate plugin. Use [StaRPC](https://github.com/aperturerobotics/starpc) for streaming RPC with this runtime. Do not assume that plugins written for Buf's runtime accept these generated types.

## Generator options

Pass options in Buf's `opt` list or through `--es-lite_opt` with protoc.

| Option | Default | Behavior |
| --- | --- | --- |
| `target=js`, `ts`, or `dts` | `js+dts` | Emit `.pb.js`, `.pb.ts`, or `.pb.d.ts`; combine targets with `+`. |
| `ts_nocheck=false` | `true` | Omit `@ts-nocheck` so generated TypeScript receives type checking. |
| `import_extension=.ts` or `none` | `.js` | Change the suffix on generated imports. |
| `js_import_style=legacy_commonjs` | `module` | Emit CommonJS imports for JavaScript output; TypeScript remains ESM. |
| `keep_empty_files=true` | `false` | Keep output files that would otherwise be empty. |
| `rewrite_imports=<pattern>:<target>` | Unset | Rewrite imports matching a pattern; repeat for multiple mappings. |

The package itself is ESM. CommonJS consumers load it through Node's `require(esm)` support on the supported Node versions. See the [import checks](./scripts/package-import-matrix.ts) and [option parser](./src/protoplugin/ecmascript/parameter.ts) for the supported package entry points and generator options.

## Development

```sh
bun install
bun run build
bun run typecheck
bun run test
bun run lint
bun run test:imports
```

After changing the generator, `bun run gen` regenerates the checked-in example and well-known types. The generation scripts also require `protoc` and `esbuild` on `PATH`.

`bun run size:protobuf` reports generated code and browser bundle sizes for the repository's fixtures. Use it to inspect changes under a consistent build configuration, not as a comparison with other libraries.

## Related projects and support

- [protobuf-go-lite](https://github.com/aperturerobotics/protobuf-go-lite): reflection-free Go messages.
- [StaRPC](https://github.com/aperturerobotics/starpc): streaming Protobuf RPC.
- [protobuf-project](https://github.com/aperturerobotics/protobuf-project): a template for Go and TypeScript code generation.
- [Spacewave](https://github.com/s4wave/spacewave): a local-first application framework using these libraries.

Report bugs or ask questions in [this repository's issues](https://github.com/aperturerobotics/protobuf-es-lite/issues). Community chat is available on [Discord](https://discord.gg/KJutMESRsT).

## License

[Apache-2.0](./LICENSE). Derived from Buf's protobuf-es, with the original copyright notices retained in source files.
