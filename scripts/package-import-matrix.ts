import { execFileSync } from "node:child_process";

type ImportCase = {
  specifier: string;
  exports: string[];
};

const esmCases: ImportCase[] = [
  {
    specifier: "@aptre/protobuf-es-lite",
    exports: ["createEmptyMessageType", "createMessageType"],
  },
  {
    specifier: "@aptre/protobuf-es-lite/message",
    exports: ["createEmptyMessageType", "createMessageType"],
  },
  { specifier: "@aptre/protobuf-es-lite/field", exports: ["newFieldList"] },
  { specifier: "@aptre/protobuf-es-lite/scalar", exports: ["ScalarType"] },
  { specifier: "@aptre/protobuf-es-lite/enum", exports: ["createEnumType"] },
  {
    specifier: "@aptre/protobuf-es-lite/binary",
    exports: ["binaryMakeReadOptions"],
  },
  {
    specifier: "@aptre/protobuf-es-lite/json",
    exports: ["jsonMakeReadOptions"],
  },
  {
    specifier: "@aptre/protobuf-es-lite/partial",
    exports: ["applyPartialMessage"],
  },
  {
    specifier: "@aptre/protobuf-es-lite/proto-int64",
    exports: ["protoInt64"],
  },
  {
    specifier: "@aptre/protobuf-es-lite/proto-double",
    exports: ["protoDouble"],
  },
  { specifier: "@aptre/protobuf-es-lite/type-registry", exports: [] },
  {
    specifier: "@aptre/protobuf-es-lite/service-type",
    exports: ["MethodKind"],
  },
  {
    specifier: "@aptre/protobuf-es-lite/google/protobuf/timestamp",
    exports: ["Timestamp"],
  },
  { specifier: "@aptre/protobuf-es-lite/protoplugin", exports: [] },
];

const cjsCases: ImportCase[] = [
  {
    specifier: "@aptre/protobuf-es-lite",
    exports: ["createEmptyMessageType", "createMessageType"],
  },
  {
    specifier: "@aptre/protobuf-es-lite/message",
    exports: ["createEmptyMessageType", "createMessageType"],
  },
  { specifier: "@aptre/protobuf-es-lite/scalar", exports: ["ScalarType"] },
  {
    specifier: "@aptre/protobuf-es-lite/google/protobuf/timestamp",
    exports: ["Timestamp"],
  },
  {
    specifier: "@aptre/protobuf-es-lite/proto-int64",
    exports: ["protoInt64"],
  },
];

function supportsRequireEsm(nodeVersion: string): boolean {
  const [major = 0, minor = 0] = nodeVersion
    .split(".")
    .map((part) => Number(part));
  return (
    major > 22 ||
    (major === 22 && minor >= 12) ||
    (major === 20 && minor >= 19)
  );
}

function cjsNodeVersion(): string {
  return execFileSync("node", ["--print", "process.versions.node"], {
    encoding: "utf8",
  }).trim();
}

async function checkEsm({ specifier, exports }: ImportCase) {
  const module = await import(specifier);
  for (const exportName of exports) {
    if (!(exportName in module)) {
      throw new Error(`${specifier} missing ESM export ${exportName}`);
    }
  }
}

function checkCjs({ specifier, exports }: ImportCase) {
  const code = `
    const mod = require(${JSON.stringify(specifier)});
    for (const name of ${JSON.stringify(exports)}) {
      if (!(name in mod)) {
        throw new Error(${JSON.stringify(specifier)} + " missing CJS export " + name);
      }
    }
  `;
  execFileSync("node", ["--eval", code], { stdio: "inherit" });
}

const nodeVersion = cjsNodeVersion();
if (!supportsRequireEsm(nodeVersion)) {
  throw new Error(
    `CJS export matrix requires Node ^20.19.0 || >=22.12.0; current Node is ${nodeVersion}`,
  );
}

for (const testCase of esmCases) {
  await checkEsm(testCase);
}

for (const testCase of cjsCases) {
  checkCjs(testCase);
}

console.log(
  `checked ${esmCases.length} ESM imports and ${cjsCases.length} CJS imports on Node ${nodeVersion}`,
);
