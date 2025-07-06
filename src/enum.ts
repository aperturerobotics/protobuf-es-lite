import { DescEnum } from "./index.js";

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

/**
 * Create a new EnumType with the given values.
 */
export function createEnumType(
  typeName: string,
  values: (EnumValueInfo | Omit<EnumValueInfo, "localName">)[],
): EnumType {
  const names = Object.create(null) as Record<string, EnumValueInfo>;
  const numbers = Object.create(null) as Record<number, EnumValueInfo>;
  const normalValues: EnumValueInfo[] = [];
  for (const value of values) {
    // We do not surface options at this time
    // const value: EnumValueInfo = {...v, options: v.options ?? emptyReadonlyObject};
    const n =
      "localName" in value ? value : { ...value, localName: value.name };
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

// enumInfoZeroValue returns the zero value for an enum info.
export function enumInfoZeroValue(
  values: (EnumValueInfo | Omit<EnumValueInfo, "localName">)[],
): number {
  if (!values?.length) {
    return 0;
  }
  // In proto3, the first enum value must be zero.
  // In proto2, protobuf-go returns the first value as the default.
  const zeroValue = values[0];
  return zeroValue.no;
}

// enumDescZeroValue returns the zero value for an enum description.
export function enumDescZeroValue(info: DescEnum): number {
  // In proto3, the first enum value must be zero.
  // In proto2, protobuf-go returns the first value as the default.
  if (info.values.length < 1) {
    throw new Error("invalid enum: missing at least one value");
  }
  const zeroValue = info.values[0];
  return zeroValue.number;
}

// enumZeroValue returns the zero value for an enum type.
export function enumZeroValue<T extends EnumType>(info: T): number {
  // In proto3, the first enum value must be zero.
  // In proto2, protobuf-go returns the first value as the default.
  if (info.values.length < 1) {
    throw new Error("invalid enum: missing at least one value");
  }
  const zeroValue = info.values[0];
  return zeroValue.no;
}

/**
 * Returns the normalized version of the enum value.
 * Null is cast to the default value.
 * String names are cast to the number enum.
 * If string and the value is unknown, throws an error.
 */
export function normalizeEnumValue(
  info: EnumType,
  value: string | number | null | undefined,
): number {
  const zeroValue = enumZeroValue(info);
  if (value == null) {
    return zeroValue;
  }
  if (value === "" || value === zeroValue) {
    return zeroValue;
  }
  if (typeof value === "string") {
    // TODO: strip the type name prefix as well? MyEnum_VALUE
    const val = info.findName(value);
    if (!val) {
      throw new Error(`enum ${info.typeName}: invalid value: "${value}"`);
    }
    return val.no;
  }

  // return the number value
  return value;
}
