// Copyright 2021-2024 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  Edition,
  FeatureSet,
  FeatureSetDefaults,
} from "./google/protobuf/descriptor.pb.js";
import { protoBase64 } from "./proto-base64.js";

/**
 * Return the edition feature defaults supported by @aptre/protobuf-es-lite.
 */
export function getFeatureSetDefaults(): FeatureSetDefaults {
  return FeatureSetDefaults.fromBinary(
    protoBase64.dec(
      "ChESDAgBEAIYAiADKAEwAhjmBwoREgwIAhABGAEgAigBMAEY5wcKERIMCAEQARgBIAIoATABGOgHIOYHKOkH",
    ),
  );
}

/**
 * A merged google.protobuf.FeaturesSet, with all fields guaranteed to be set.
 */
export type MergedFeatureSet = FeatureSet & Required<FeatureSet>;

/**
 * A function that resolves features.
 *
 * If no feature set is provided, the default feature set for the edition is
 * returned. If features are provided, they are merged into the edition default
 * features.
 */
export type FeatureResolverFn = (
  a?: FeatureSet,
  b?: FeatureSet,
) => MergedFeatureSet;

// featureKeys lists the fields of FeatureSet, each an enum whose zero value
// means unset.
const featureKeys = [
  "fieldPresence",
  "enumType",
  "repeatedFieldEncoding",
  "utf8Validation",
  "messageEncoding",
  "jsonFormat",
] as const;

/**
 * Create an edition feature resolver with the given feature set defaults, or
 * the feature set defaults supported by @aptre/protobuf-es-lite.
 */
export function createFeatureResolver(
  edition: Edition,
  compiledFeatureSetDefaults?: FeatureSetDefaults,
): FeatureResolverFn {
  const fds = compiledFeatureSetDefaults ?? getFeatureSetDefaults();
  const min = fds.minimumEdition ?? 0;
  const max = fds.maximumEdition ?? 0;

  if (edition === 0) {
    throw new Error(
      `Edition ${Edition[edition]} is unknown and not supported.`,
    );
  }
  if (edition < min) {
    throw new Error(
      `Edition ${Edition[edition]} is earlier than the minimum supported edition ${Edition[min]}`,
    );
  }
  if (max < edition) {
    throw new Error(
      `Edition ${Edition[edition]} is later than the maximum supported edition ${Edition[max]}`,
    );
  }
  let highestMatch: { e: Edition; f: FeatureSet } | undefined = undefined;
  for (const c of fds.defaults ?? []) {
    const e = c?.edition;
    if (e === undefined || e > edition) {
      continue;
    }
    if (highestMatch !== undefined && highestMatch.e > e) {
      continue;
    }
    highestMatch = {
      e,
      f: c.features ?? {},
    };
  }
  if (highestMatch === undefined) {
    throw new Error(`No valid default found for edition ${Edition[edition]}`);
  }
  const defaults = highestMatch.f;
  return (...rest): MergedFeatureSet => {
    const f = FeatureSet.clone(defaults);
    for (const c of rest) {
      for (const k of featureKeys) {
        setFeature(f, c, k);
      }
    }
    if (!validateMergedFeatures(f)) {
      throw new Error(`Invalid FeatureSet for edition ${Edition[edition]}`);
    }
    return f;
  };
}

// setFeature copies feature k from c to f when c sets it.
function setFeature<K extends (typeof featureKeys)[number]>(
  f: FeatureSet,
  c: FeatureSet | undefined,
  k: K,
): void {
  const v = c?.[k];
  if (v !== undefined) {
    f[k] = v;
  }
}

// When protoc generates google.protobuf.FeatureSetDefaults, it ensures that
// fields are not repeated or required, do not use oneof, and have a default
// value.
//
// When features for an element are resolved, features of the element and its
// parents are merged into the default FeatureSet for the edition. Because unset
// fields in the FeatureSet of an element do not unset the default FeatureSet
// values, a resolved FeatureSet is guaranteed to have all fields set. This is
// also the case for extensions to FeatureSet that a user might provide, and for
// features from the future.
//
// We cannot exhaustively validate correctness of FeatureSetDefaults at runtime
// without knowing the schema: If no value for a feature is provided, we do not
// know that it exists at all.
//
// As a sanity check, we validate that all fields known to our version of
// FeatureSet are set.
function validateMergedFeatures(
  featureSet: FeatureSet,
): featureSet is MergedFeatureSet {
  return featureKeys.every((k) => !!featureSet[k]);
}
