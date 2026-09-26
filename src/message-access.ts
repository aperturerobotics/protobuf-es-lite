// Copyright 2024 Aperture Robotics, LLC.
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

export type MessageRecord = Record<string | symbol, unknown>;
export type MessageMap = Record<string, unknown>;

// createMessageRecord returns an ordinary object for a message or oneof value.
// Its keys are schema field names, which throwSanitizeKey keeps off the
// prototype chain. Structured clone and Workers RPC serialize only objects with
// the ordinary prototype.
export function createMessageRecord(): MessageRecord {
  return {};
}

// createMapRecord returns a null-prototype object for a map field. Map keys
// come from decoded data, so a key such as "__proto__" must stay an own
// property instead of reaching the prototype.
export function createMapRecord(): MessageMap {
  return Object.create(null) as MessageMap;
}

export function asMessageRecord(value: object): MessageRecord {
  return value as MessageRecord;
}
