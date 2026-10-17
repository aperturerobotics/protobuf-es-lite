/**
 * EnumType describes a protobuf enumeration: its name and its values.
 */
export interface EnumType {
  /** The fully qualified name of the enumeration. */
  readonly typeName: string;

  /** The values in declaration order; the first is the default. */
  readonly values: readonly EnumValueInfo[];

  /** Find an enum value by its protobuf name. */
  findName(name: string): EnumValueInfo | undefined;

  /** Find an enum value by its number. */
  findNumber(no: number): EnumValueInfo | undefined;
}

/**
 * EnumValueInfo is one value of a protobuf enumeration.
 */
export interface EnumValueInfo {
  /** The number of the value, as written in the protobuf source. */
  readonly no: number;

  /** The name of the value, as written in the protobuf source. */
  readonly name: string;
}

/**
 * createEnumType creates an EnumType from its values, given as number and
 * protobuf name pairs in declaration order.
 */
export function createEnumType(
  typeName: string,
  values: [no: number, name: string][],
): EnumType {
  const list: EnumValueInfo[] = [];
  const names = new Map<string, EnumValueInfo>();
  const numbers = new Map<number, EnumValueInfo>();
  for (const [no, name] of values) {
    const info: EnumValueInfo = { no, name };
    list.push(info);
    names.set(name, info);
    if (!numbers.has(no)) {
      numbers.set(no, info);
    }
  }
  return {
    typeName,
    values: list,
    findName: (name: string): EnumValueInfo | undefined => names.get(name),
    findNumber: (no: number): EnumValueInfo | undefined => numbers.get(no),
  };
}
