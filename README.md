## protobuf-es-lite

[![npm version](https://img.shields.io/npm/v/@aptre/protobuf-es-lite.svg)](https://www.npmjs.com/package/@aptre/protobuf-es-lite)
[![npm downloads](https://img.shields.io/npm/dm/@aptre/protobuf-es-lite.svg)](https://www.npmjs.com/package/@aptre/protobuf-es-lite)
[![DeepWiki Widget]][DeepWiki]

[DeepWiki Widget]: https://img.shields.io/badge/DeepWiki-aperturerobotics%2Fprotobuf--es--lite-blue.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost648sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==
[DeepWiki]: https://deepwiki.com/aperturerobotics/protobuf-es-lite

protobuf-es-lite is a TypeScript and JavaScript protobuf implementation.

It uses [protoplugin] to implement **protoc-gen-es-lite** which generates js and/or ts code.

[protoplugin]: ./src/protoplugin

See [protobuf-es] for information about protoplugin.

[protobuf-es]: https://github.com/bufbuild/protobuf-es

### Ecosystem

Lightweight Protobuf 3 RPCs are implemented in [StaRPC] for Go and TypeScript.

[StaRPC]: https://github.com/aperturerobotics/starpc

[protoc-gen-doc] is recommended for generating documentation.

[protoc-gen-doc]: https://github.com/pseudomuto/protoc-gen-doc

[protobuf-go-lite] is recommended for lightweight Go protobufs.

[protobuf-go-lite]: https://github.com/aperturerobotics/protobuf-go-lite

## Purpose

[protobuf-es] generates a class for each message with interfaces for partial or
plain messages. It is significantly easier to construct and pass around plain
and partial messages as opposed to using classes, and plain messages work better
when used in React props/state. This ends up looking like:

[protobuf-es]: https://github.com/bufbuild/protobuf-es

```typescript
const myMessage: PlainMessage<MyMessage> = {body: "Hello world"}
const myMessageBin = new MyMessage(myMessage).toBinary()
```

[ts-proto] generates an interface for each protobuf message and a const message
declaration object containing the marshal and unmarshal functions. This allows
using interfaces and plain messages everywhere:

[ts-proto]: https://github.com/stephenh/ts-proto

```typescript
// Create a partial MyMessage with just one field sets.
const myMessage: MyMessage = {body: "Hello world"}
// Creates a version of MyMessage filled with zeros.
const myCompleteMessage: MyMessage = MyMessage.create(myMessage)
// Convert MyMessage to binary.
const myMessageBin = MyMessage.toBinary(myCompleteMessage)
```

This fork generates the ts-proto style with the protobuf-es code generator.

## Installation

`protoc-gen-es` generates base types - messages and enumerations - from your
Protocol Buffer schema.

To install the plugin and the runtime library, run:

```shell
npm install @aptre/protoc-gen-es-lite
```

We use peer dependencies to ensure that code generator and runtime library are
compatible with each other. Note that npm installs them automatically, but yarn
and pnpm do not.

## Generating code

### With buf

```bash
npm install --save-dev @bufbuild/buf
```

Add a new configuration file `buf.gen.yaml`:

```yaml
# buf.gen.yaml defines a local generation template.
# For details, see https://docs.buf.build/configuration/v1/buf-gen-yaml
version: v1
plugins:
  # This will invoke protoc-gen-es-lite and write output to src/gen
  - plugin: es-lite
    out: src/gen
    opt:
      # Add more plugin options here
      - target=ts
```

To generate code for all protobuf files within your project, simply run:

```bash
npx buf generate
```

Note that `buf` can generate from various [inputs](https://docs.buf.build/reference/inputs),
not just local protobuf files.

### With protoc

```bash
PATH=$PATH:$(pwd)/node_modules/.bin \
  protoc -I . \
  --es-lite_out src/gen \
  --es-lite_opt target=ts \
  a.proto b.proto c.proto
```

Note that we are adding `node_modules/.bin` to the `$PATH`, so that the protocol
buffer compiler can find them. This happens automatically with npm scripts.

Since yarn v2 and above does not use a `node_modules` directory, you need to 
change the variable a bit:

```bash
PATH=$(dirname $(yarn bin protoc-gen-es-lite)):$PATH
```

## Plugin options

### `target`

This option controls whether the plugin generates JavaScript, TypeScript,
or TypeScript declaration files.

Possible values:
- `target=js` - generates a `.pb.js` file for every `.proto` input file.
- `target=ts` - generates a `.pb.ts` file for every `.proto` input file.
- `target=dts` - generates a `.pb.d.ts` file for every `.proto` input file.

Multiple values can be given by separating them with `+`, for example
`target=js+dts`.

By default, we generate JavaScript and TypeScript declaration files, which
produces the smallest code size and is the most compatible with various 
bundler configurations. If you prefer to generate TypeScript, use `target=ts`.

### `import_extension=.js`

By default, protoc-gen-es (and all other plugins based on
[protoplugin](./src/protoplugin)) uses a `.js` file extensions in import paths,
even in TypeScript files.

This is unintuitive, but necessary for [ECMAScript modules in Node.js](https://www.typescriptlang.org/docs/handbook/esm-node.html).
Unfortunately, not all bundlers and tools have caught up yet, and Deno
requires `.ts`. With this plugin option, you can replace `.js` extensions
in import paths with the given value. For example, set

- `import_extension=none` to remove the `.js` extension.
- `import_extension=.ts` to replace the `.js` extension with `.ts`.

### `js_import_style`

By default, protoc-gen-es (and all other plugins based on
[protoplugin](./src/protoplugin)) generates ECMAScript `import` and `export`
statements. For use cases where CommonJS is difficult to avoid, this option can
be used to generate CommonJS `require()` calls.

Possible values:
- `js_import_style=module` generate ECMAScript `import` / `export` statements - 
  the default behavior.
- `js_import_style=legacy_commonjs` generate CommonJS `require()` calls.

### `keep_empty_files=true`

By default, protoc-gen-es (and all other plugins based on
[protoplugin](./src/protoplugin)) omits empty files from the plugin output. This
option disables pruning of empty files, to allow for smooth interoperation with
Bazel and similar tooling that requires all output files to be declared ahead of
time. Unless you use Bazel, it is very unlikely that you need this option.

### `ts_nocheck=false`

By default, protoc-gen-es (and all other plugins based on
[protoplugin](./src/protoplugin)) generates an annotation at the top of each
file: `// @ts-nocheck`.

We generate the annotation to support a wide range of compiler configurations
and future changes to the language. But there can be situations where the
annotation shadows an underlying problem, for example an unresolvable import. To
remove the annotation and to enable type checks, set the plugin option
`ts_nocheck=false`.

## Developing on MacOS

On MacOS, some homebrew packages are required for `yarn gen`:

```
brew install bash make coreutils gnu-sed findutils protobuf
brew link --overwrite protobuf
```

Add to your .bashrc or .zshrc:

```
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/gnu-sed/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/findutils/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/make/libexec/gnubin:$PATH"
```

## Support

Please open a [GitHub issue] with any questions / issues.

[GitHub issue]: https://github.com/aperturerobotics/protobuf-project/issues/new

... or feel free to reach out on [Matrix Chat] or [Discord].

[Discord]: https://discord.gg/KJutMESRsT
[Matrix Chat]: https://matrix.to/#/#aperturerobotics:matrix.org

## License

Apache-2.0
