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

get_ts_files() {
    local PROTO_FILES=$1
    TS_FILES=()
    for proto_file in ${PROTO_FILES}; do
        proto_dir=$(dirname $proto_file)
        proto_name=${proto_file%".proto"}
        found_files=$(git ls-files ":(glob)${proto_name}*.pb.ts")
        if [ -n "$found_files" ]; then TS_FILES+=($found_files); fi
    done
    echo "${TS_FILES[@]}"
}

prettier_ts() {
    local TS_FILES=$(get_ts_files "$1")
    if [ -n "${TS_FILES}" ]; then
        prettier --config .prettierrc.yaml -w ${TS_FILES[@]}
    fi
}

replace_import_path() {
    local TS_FILES=$(get_ts_files "$1")
    if [ -n "${TS_FILES}" ]; then
        sed -i -e "s/@aptre\/protobuf-es-lite/..\/src\/index.js/g" ${TS_FILES[@]}
    fi
}

if [ -z "$SKIP_PROTOC" ]; then
    PROTO_FILES=$(git ls-files $@ | grep ".*\\.proto")
    protoc \
        --plugin=./dist/dev/protoc-gen-es-lite \
        --es-lite_out=. \
        --es-lite_opt target=ts \
        --es-lite_opt ts_nocheck=false \
        ${PROTO_FILES}

    if [ -z "$SKIP_REPLACE_IMPORT_PATH" ]; then
        replace_import_path "${PROTO_FILES}"
    fi
    if [ -z "$SKIP_PRETTIER" ]; then
        prettier_ts "${PROTO_FILES}"
    fi
fi
