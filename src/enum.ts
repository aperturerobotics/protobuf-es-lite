import { EnumType, EnumValueInfo } from "@bufbuild/protobuf";

export function normalizeEnumValue(
  value: EnumValueInfo | Omit<EnumValueInfo, "localName">,
): EnumValueInfo {
  if ("localName" in value) {
    return value;
  }
  return { ...value, localName: value.name };
}

/**
 * Create a new EnumType with the given values.
 */
export function createEnumType(
  typeName: string,
  values: (EnumValueInfo | Omit<EnumValueInfo, "localName">)[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opt?: {
    // We do not surface options at this time
    // options?: { readonly [extensionName: string]: JsonValue };
  },
): EnumType {
  const names = Object.create(null) as Record<string, EnumValueInfo>;
  const numbers = Object.create(null) as Record<number, EnumValueInfo>;
  const normalValues: EnumValueInfo[] = [];
  for (const value of values) {
    // We do not surface options at this time
    // const value: EnumValueInfo = {...v, options: v.options ?? emptyReadonlyObject};
    const n = normalizeEnumValue(value);
    normalValues.push(n);
    names[value.name] = n;
    numbers[value.no] = n;
  }
  return {
    typeName,
    values: normalValues,
    // We do not surface options at this time
    // options: opt?.options ?? Object.create(null),
    findName(name: string): EnumValueInfo | undefined {
      return names[name];
    },
    findNumber(no: number): EnumValueInfo | undefined {
      return numbers[no];
    },
  };
}
