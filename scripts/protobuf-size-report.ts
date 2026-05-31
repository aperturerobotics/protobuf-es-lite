import { gzipSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";

type BunBuild = (options: {
  entrypoints: string[];
  target: "browser";
  format: "esm";
  minify: boolean;
  write: false;
}) => Promise<{
  success: boolean;
  outputs: Array<{ text(): Promise<string> }>;
  logs: unknown[];
}>;

const bun = (globalThis as typeof globalThis & { Bun?: { build: BunBuild } })
  .Bun;

if (bun == null) {
  throw new Error("protobuf size report must be run with bun");
}

const repoRoot = process.cwd();
const defaultOutDir = join(repoRoot, ".tmp", "protobuf-size-report");
const outDir =
  process.argv.includes("--out") ?
    process.argv[process.argv.indexOf("--out") + 1]
  : defaultOutDir;

if (outDir == null || outDir.length === 0) {
  throw new Error("--out requires a directory");
}

const reportDir = outDir.startsWith("/") ? outDir : join(repoRoot, outDir);
const entryDir = join(reportDir, "entries");

type GeneratedFileStats = {
  path: string;
  bytes: number;
  rootRuntimeImports: number;
  runtimeSubpathImports: number;
  wktImports: number;
  messageDescriptors: number;
  emptyMessageHelpers: number;
  enumDescriptors: number;
  zeroFieldDescriptors: number;
  inlineZeroFieldDescriptors: number;
  serviceMentions: number;
  pureAnnotations: number;
};

type BundleStats = {
  name: string;
  entry: string;
  success: boolean;
  bytes: number;
  gzipBytes: number;
  runtimeModules: string[];
  error?: string;
};

const runtimeModuleSignals = [
  ["binary", /\b(BinaryReader|BinaryWriter|readMessageField|writeField)\b/g],
  ["enum", /\b(createEnumType|normalizeEnumValue)\b/g],
  ["json", /\b(jsonReadScalar|jsonWriteScalar|jsonReadEnum|jsonWriteEnum)\b/g],
  [
    "message",
    /\b(createEmptyMessageType|createMessageType|compareMessages|cloneMessage)\b/g,
  ],
  ["partial", /\bapplyPartialMessage\b/g],
  ["proto-base64", /\b(protoBase64|base64Decode|base64Encode)\b/g],
  ["proto-int64", /\bprotoInt64\b/g],
  ["scalar", /\bScalarType\b/g],
  ["service-type", /\b(MethodKind|MethodIdempotency)\b/g],
  ["type-registry", /\b(createTypeRegistry|IMessageTypeRegistry)\b/g],
] as const;

const runtimeOwnerImportRE =
  /from\s+["'](?:@aptre\/protobuf-es-lite\/(?:message|field|scalar|enum|binary|json|partial|proto-int64|proto-double|type-registry|service-type)|(?:\.\.\/)+(?:src\/)?(?:message|field|scalar|enum|binary|json|partial|proto-int64|proto-double|type-registry|service-type)\.js)["']/g;
const createMessageTypeCallRE = /createMessageType(?:<[^>]+>)?\(/g;

function listFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path, suffix));
    } else if (entry.isFile() && path.endsWith(suffix)) {
      files.push(path);
    }
  }
  return files;
}

function countMatches(value: string, expression: RegExp): number {
  return Array.from(value.matchAll(expression)).length;
}

function analyzeGeneratedFile(path: string): GeneratedFileStats {
  const text = readFileSync(path, "utf8");
  const emptyMessageHelpers = countMatches(text, /createEmptyMessageType[<(]/g);
  const inlineZeroFieldDescriptors = countMatches(
    text,
    /createMessageType\(\{[\s\S]*?fields:\s*\[\s*\]/g,
  );
  return {
    path: relative(repoRoot, path),
    bytes: Buffer.byteLength(text),
    rootRuntimeImports:
      countMatches(
        text,
        /from\s+["'](?:@aptre\/protobuf-es-lite|(?:\.\.\/)+(?:src\/)?index\.js)["']/g,
      ) + countMatches(text, /from\s+["']@aptre\/protobuf-es-lite["']/g),
    runtimeSubpathImports: countMatches(text, runtimeOwnerImportRE),
    wktImports: countMatches(text, /google\/protobuf\/[^"']+/g),
    messageDescriptors:
      countMatches(text, createMessageTypeCallRE) + emptyMessageHelpers,
    emptyMessageHelpers,
    enumDescriptors: countMatches(text, /createEnumType\(/g),
    zeroFieldDescriptors: inlineZeroFieldDescriptors + emptyMessageHelpers,
    inlineZeroFieldDescriptors,
    serviceMentions: countMatches(text, /MethodKind|ServiceType|MethodInfo/g),
    pureAnnotations: countMatches(text, /\/\*\s*[#@]?__PURE__\s*\*\//g),
  };
}

function sum<K extends keyof GeneratedFileStats>(
  files: GeneratedFileStats[],
  key: K,
): number {
  return files.reduce((total, file) => {
    const value = file[key];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

function countProtoFixtureShape(path: string) {
  const text = readFileSync(path, "utf8");
  return {
    path: relative(repoRoot, path),
    bytes: Buffer.byteLength(text),
    messages: countMatches(text, /^\s*message\s+\w+/gm),
    enums: countMatches(text, /^\s*enum\s+\w+/gm),
    services: countMatches(text, /^\s*service\s+\w+/gm),
    rpcs: countMatches(text, /^\s*rpc\s+\w+/gm),
    maps: countMatches(text, /\bmap\s*</g),
    oneofs: countMatches(text, /^\s*oneof\s+\w+/gm),
    repeatedFields: countMatches(text, /^\s*repeated\s+\S+/gm),
    wktImports: countMatches(text, /google\/protobuf\//g),
  };
}

function writeEntry(name: string, source: string): string {
  const path = join(entryDir, `${name}.ts`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  return path;
}

async function bundleEntry(name: string, entry: string): Promise<BundleStats> {
  try {
    const readableResult = await bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "esm",
      minify: false,
      write: false,
    });
    if (!readableResult.success || readableResult.outputs.length === 0) {
      return {
        name,
        entry: relative(repoRoot, entry),
        success: false,
        bytes: 0,
        gzipBytes: 0,
        runtimeModules: [],
        error: readableResult.logs.map(String).join("\n"),
      };
    }
    const readableOutput = await readableResult.outputs[0].text();
    const runtimeModules = runtimeModuleSignals
      .filter(([, signal]) => countMatches(readableOutput, signal) > 0)
      .map(([module]) => module);
    const minifiedResult = await bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "esm",
      minify: true,
      write: false,
    });
    if (!minifiedResult.success || minifiedResult.outputs.length === 0) {
      return {
        name,
        entry: relative(repoRoot, entry),
        success: false,
        bytes: 0,
        gzipBytes: 0,
        runtimeModules,
        error: minifiedResult.logs.map(String).join("\n"),
      };
    }
    const output = await minifiedResult.outputs[0].text();
    return {
      name,
      entry: relative(repoRoot, entry),
      success: true,
      bytes: Buffer.byteLength(output),
      gzipBytes: gzipSync(output).byteLength,
      runtimeModules,
    };
  } catch (error) {
    return {
      name,
      entry: relative(repoRoot, entry),
      success: false,
      bytes: 0,
      gzipBytes: 0,
      runtimeModules: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function markdownTable(rows: Array<Array<string | number | boolean>>): string {
  if (rows.length === 0) return "";
  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => String(row[index]).length)),
  );
  return rows
    .map((row, rowIndex) => {
      const line = `| ${row
        .map((cell, index) => String(cell).padEnd(widths[index]))
        .join(" | ")} |`;
      if (rowIndex !== 0) return line;
      return `${line}\n| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
    })
    .join("\n");
}

const generatedFilePaths = [
  ...listFiles(join(repoRoot, "example"), ".pb.ts"),
  ...listFiles(join(repoRoot, "src", "google"), ".pb.ts"),
].sort();
const generatedFiles = generatedFilePaths.map(analyzeGeneratedFile);
const rootImportFiles = generatedFiles.filter(
  (file) => file.rootRuntimeImports > 0,
);
if (rootImportFiles.length > 0) {
  const files = rootImportFiles
    .map((file) => `${file.path}: ${file.rootRuntimeImports}`)
    .join("\n");
  throw new Error(`generated output has root runtime imports:\n${files}`);
}
const fixtureProto = countProtoFixtureShape(
  join(repoRoot, "fixtures", "size", "size_fixture.proto"),
);

rmSync(reportDir, { force: true, recursive: true });
mkdirSync(entryDir, { recursive: true });

const entries = {
  "generated-example": writeEntry(
    "generated-example",
    `import { EchoMsg, ExampleEnum } from "../../../example/example.pb.ts";

const msg = EchoMsg.create({
  body: "fixture",
  demo: { case: "exampleEnum", value: ExampleEnum.FIRST },
});

console.log(EchoMsg.toJson(msg));
`,
  ),
  "root-runtime": writeEntry(
    "root-runtime",
    `import { ScalarType, createMessageType } from "../../../src/index.ts";

const Message = createMessageType({
  typeName: "sizefixture.RootRuntime",
  fields: [{ no: 1, name: "name", kind: "scalar", T: ScalarType.STRING }],
  packedByDefault: true,
});

console.log(Message.toJson(Message.create({ name: "fixture" })));
`,
  ),
  wkt: writeEntry(
    "wkt",
    `import { Timestamp } from "../../../src/google/protobuf/timestamp.pb.ts";

console.log(Timestamp.toJson(new Date(0)));
`,
  ),
  "runtime-subpath-package": writeEntry(
    "runtime-subpath-package",
    `import { createMessageType } from "@aptre/protobuf-es-lite/message";
import { ScalarType } from "@aptre/protobuf-es-lite/scalar";

const Message = createMessageType({
  typeName: "sizefixture.RuntimeSubpath",
  fields: [{ no: 1, name: "name", kind: "scalar", T: ScalarType.STRING }],
  packedByDefault: true,
});

console.log(Message.create({ name: "future-subpath" }));
`,
  ),
};

const bundles = [];
for (const [name, entry] of Object.entries(entries)) {
  bundles.push(await bundleEntry(name, entry));
}

const largestGeneratedFiles = [...generatedFiles]
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 8)
  .map(({ path, bytes }) => ({ path, bytes }));

const report = {
  generatedAt: new Date().toISOString(),
  repo: basename(repoRoot),
  fixtureProto,
  generated: {
    files: generatedFiles.length,
    bytes: sum(generatedFiles, "bytes"),
    rootRuntimeImports: sum(generatedFiles, "rootRuntimeImports"),
    runtimeSubpathImports: sum(generatedFiles, "runtimeSubpathImports"),
    wktImports: sum(generatedFiles, "wktImports"),
    messageDescriptors: sum(generatedFiles, "messageDescriptors"),
    emptyMessageHelpers: sum(generatedFiles, "emptyMessageHelpers"),
    enumDescriptors: sum(generatedFiles, "enumDescriptors"),
    zeroFieldDescriptors: sum(generatedFiles, "zeroFieldDescriptors"),
    inlineZeroFieldDescriptors: sum(
      generatedFiles,
      "inlineZeroFieldDescriptors",
    ),
    serviceMentions: sum(generatedFiles, "serviceMentions"),
    pureAnnotations: sum(generatedFiles, "pureAnnotations"),
    largestFiles: largestGeneratedFiles,
  },
  bundles,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(
  join(reportDir, "size-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

const md = `# protobuf-es-lite Size Report

Generated at: ${report.generatedAt}

## Fixture Proto

${markdownTable([
  [
    "path",
    "bytes",
    "messages",
    "enums",
    "services",
    "rpcs",
    "maps",
    "oneofs",
    "repeated",
    "wkt imports",
  ],
  [
    report.fixtureProto.path,
    report.fixtureProto.bytes,
    report.fixtureProto.messages,
    report.fixtureProto.enums,
    report.fixtureProto.services,
    report.fixtureProto.rpcs,
    report.fixtureProto.maps,
    report.fixtureProto.oneofs,
    report.fixtureProto.repeatedFields,
    report.fixtureProto.wktImports,
  ],
])}

## Generated Output

${markdownTable([
  [
    "files",
    "bytes",
    "root imports",
    "subpath imports",
    "wkt imports",
    "messages",
    "empty helpers",
    "enums",
    "zero-field",
    "inline zero-field",
    "service refs",
    "pure",
  ],
  [
    report.generated.files,
    report.generated.bytes,
    report.generated.rootRuntimeImports,
    report.generated.runtimeSubpathImports,
    report.generated.wktImports,
    report.generated.messageDescriptors,
    report.generated.emptyMessageHelpers,
    report.generated.enumDescriptors,
    report.generated.zeroFieldDescriptors,
    report.generated.inlineZeroFieldDescriptors,
    report.generated.serviceMentions,
    report.generated.pureAnnotations,
  ],
])}

## Bundles

${markdownTable([
  ["entry", "success", "bytes", "gzip bytes", "runtime modules", "error"],
  ...report.bundles.map((bundle) => [
    bundle.name,
    bundle.success,
    bundle.bytes,
    bundle.gzipBytes,
    bundle.runtimeModules.join(", "),
    bundle.error?.split("\n")[0] ?? "",
  ]),
])}

## Largest Generated Files

${markdownTable([
  ["path", "bytes"],
  ...report.generated.largestFiles.map((file) => [file.path, file.bytes]),
])}
`;

writeFileSync(join(reportDir, "size-report.md"), md);

console.log(`wrote ${relative(repoRoot, join(reportDir, "size-report.json"))}`);
console.log(`wrote ${relative(repoRoot, join(reportDir, "size-report.md"))}`);
