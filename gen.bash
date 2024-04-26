#!/bin/bash
set -eo pipefail

# Usage: ./gen.bash <path/to/file.proto> [<path/to/file2.proto>...]
if [ -z "SKIP_PROTOC" ] && [ $# -eq 0 ]; then
    echo "Error: no .proto file paths provided"
    echo "Usage: $0 <path/to/file.proto> [<path/to/file2.proto>...]"
    echo "Usage: $0 ./*.proto"
    exit 1
fi

echo "Compiling ts..."
mkdir -p ./dist/dev
esbuild ./bin/dev/protoc-gen-es-lite \
                             --bundle \
                             --sourcemap \
                             --platform=node \
                             --format=cjs \
                             --external:typescript \
                             --banner:js="$ESM_BANNER" \
                             --outfile=./dist/dev/protoc-gen-es-lite

if [ -z "$SKIP_PROTOC" ]; then
    protoc \
        --plugin=./dist/dev/protoc-gen-es-lite \
        --es-lite_out=. \
        --es-lite_opt target=ts \
        --es-lite_opt ts_nocheck=false \
        $(git ls-files $@)
fi
