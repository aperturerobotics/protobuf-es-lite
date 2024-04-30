#!/bin/bash
set -eo pipefail

pushd ../
export SKIP_PROTOC=true
source gen.bash

PROTO_FILES=$(git ls-files ":(glob)./src/google/protobuf/*.proto")
protoc \
    -I ./src \
    --plugin=./dist/dev/protoc-gen-es-lite \
    --es-lite_out=./src \
    --es-lite_opt target=ts \
    --es-lite_opt ts_nocheck=false \
    --proto_path ./src \
    $PROTO_FILES
sed -i -e "s/@aptre\/protobuf-es-lite/..\/..\/index.js/g" ./src/google/protobuf/*.pb.ts
prettier_ts "$PROTO_FILES"
popd
