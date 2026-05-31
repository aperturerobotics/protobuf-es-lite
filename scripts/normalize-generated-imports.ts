import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

const repoRoot = process.cwd();
const srcRoot = `${repoRoot}/src`;
const wktRoot = `${srcRoot}/google/protobuf`;

function modulePath(fromFile: string, toPath: string): string {
  const path = relative(dirname(fromFile), toPath).replaceAll("\\", "/");
  return path.startsWith(".") ? path : `./${path}`;
}

function normalizeFile(path: string): void {
  const absolutePath = path.startsWith("/") ? path : `${repoRoot}/${path}`;
  const runtimeRoot = modulePath(absolutePath, srcRoot);
  const googleRoot = modulePath(absolutePath, wktRoot);
  const text = readFileSync(absolutePath, "utf8")
    .replaceAll(
      /@aptre\/protobuf-es-lite\/google\/protobuf\/([^"']*)/g,
      `${googleRoot}/$1.pb.js`,
    )
    .replaceAll(
      /@aptre\/protobuf-es-lite\/([^"']*)/g,
      `${runtimeRoot}/$1.js`,
    )
    .replaceAll("@aptre/protobuf-es-lite", `${runtimeRoot}/index.js`);

  writeFileSync(absolutePath, text);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error("normalize-generated-imports requires at least one file");
}

for (const file of files) {
  normalizeFile(file);
}
