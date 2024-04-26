/**
 * Reflection information for a protobuf enumeration.
 */
export interface EnumType {
  /**
   * The fully qualified name of the enumeration.
   */
  readonly typeName: string;

  readonly values: readonly EnumValueInfo[];

  /**
   * Find an enum value by its (protobuf) name.
   */
  findName(name: string): EnumValueInfo | undefined;

  /**
   * Find an enum value by its number.
   */
  findNumber(no: number): EnumValueInfo | undefined;

  // We do not surface options at this time
  // readonly options: OptionsMap;
}

/**
 * Reflection information for a protobuf enumeration value.
 */
export interface EnumValueInfo {
  /**
   * The numeric enumeration value, as specified in the protobuf source.
   */
  readonly no: number;

  /**
   * The name of the enumeration value, as specified in the protobuf source.
   */
  readonly name: string;

  /**
   * The name of the enumeration value in generated code.
   */
  readonly localName: string;

  // We do not surface options at this time
  // readonly options: OptionsMap;
}

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
