#!/bin/bash
set -eo pipefail

# Usage: ./gen.bash <path/to/file.proto> [<path/to/file2.proto>...]
if [ -z "SKIP_PROTOC" ] && [ $# -eq 0 ]; then
    echo "Error: no .proto file paths provided"
    echo "Usage: $0 <path/to/file.proto> [<path/to/file2.proto>...]"
    echo "Usage: $0 ./*.proto"
    exit 1
fi

# Fixes errors with the generated esm using require()
# https://github.com/evanw/esbuild/issues/1944#issuecomment-1936954345
ESM_BANNER='import{fileURLToPath}from"node:url";import{dirname}from"node:path";import{createRequire as topLevelCreateRequire}from"node:module";const require=topLevelCreateRequire(import.meta.url);const __filename=fileURLToPath(import.meta.url);const __dirname=dirname(__filename);'

echo "Compiling ts..."
mkdir -p ./dist/dev
esbuild ./bin/dev/protoc-gen-es-lite \
        --bundle \
        --sourcemap \
        --platform=node \
        --format=esm \
        --external:typescript \
        --external:@typescript/vfs \
        --banner:js="$ESM_BANNER" \
        --outfile=./dist/dev/protoc-gen-es-lite

prettier_ts() {
    local PROTO_FILES=$1
    FMT_TS_FILES=()
    for proto_file in ${PROTO_FILES}; do
        proto_dir=$(dirname $proto_file)
        proto_name=${proto_file%".proto"}
        TS_FILES=$(git ls-files ":(glob)${proto_name}*.pb.ts")
        if [ -n "$TS_FILES" ]; then FMT_TS_FILES+=($TS_FILES); fi
    done
    if [ -n "${FMT_TS_FILES}" ]; then
        prettier --config .prettierrc.yaml -w ${FMT_TS_FILES[@]}
    fi
}

if [ -z "$SKIP_PROTOC" ]; then
    PROTO_FILES=$(git ls-files $@)
    protoc \
        --plugin=./dist/dev/protoc-gen-es-lite \
        --es-lite_out=. \
        --es-lite_opt target=ts \
        --es-lite_opt ts_nocheck=false \
        $PROTO_FILES

    if [ -z "$SKIP_PRETTIER" ]; then
        prettier_ts "${PROTO_FILES}"
    fi
fi
