#!/bin/bash
set -eo pipefail

pushd ../
SKIP_PROTOC=true bash gen.bash
popd
protoc \
    -I ./ \
    --plugin=../dist/dev/protoc-gen-es-lite \
    --es-lite_out=./ \
    --es-lite_opt target=ts \
    --es-lite_opt ts_nocheck=false \
    --proto_path ./ \
    ./google/protobuf/*.proto
sed -i -e "s/@aptre\/protobuf-es-lite/..\/..\/index.js/g" ./google/protobuf/*.pb.ts
