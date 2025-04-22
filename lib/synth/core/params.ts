/**
 * Parameter descriptor system for synthesizer parameters
 * Provides type-safe abstractions for parameter validation and formatting
 */

/**
 * Base interface for all parameter descriptors
 */
export interface ParamDescriptor<T> {
  /** Parameter name */
  name: string;

  /** Default value */
  defaultValue: T;

  /** Validation function that ensures values are within acceptable range */
  validate: (value: unknown) => T;

  /** Formatting function for display */
  format: (value: T) => string;
}

/**
 * Options for creating a number parameter
 */
export interface NumberParamOptions {
  /** Parameter name */
  name: string;

  /** Minimum allowed value */
  min: number;

  /** Maximum allowed value */
  max: number;

  /** Default value */
  defaultValue: number;

  /** Optional formatting function (defaults to plain number) */
  format?: (value: number) => string;
}

/**
 * Creates a number parameter descriptor with range validation
 */
export function createNumberParam(
  options: NumberParamOptions,
): ParamDescriptor<number> {
  return {
    name: options.name,
    defaultValue: options.defaultValue,
    validate: (value: unknown): number => {
      // Type checking
      if (typeof value !== "number" || isNaN(value)) {
        console.warn(`Invalid ${options.name} value: ${value}, using default`);
        return options.defaultValue;
      }

      // Range validation
      return Math.max(options.min, Math.min(options.max, value));
    },
    format: options.format || ((value: number) => `${value}`),
  };
}

/**
 * Options for creating a boolean parameter
 */
export interface BooleanParamOptions {
  /** Parameter name */
  name: string;

  /** Default value */
  defaultValue: boolean;

  /** Optional formatting function */
  format?: (value: boolean) => string;
}

/**
 * Creates a boolean parameter descriptor
 */
export function createBooleanParam(
  options: BooleanParamOptions,
): ParamDescriptor<boolean> {
  return {
    name: options.name,
    defaultValue: options.defaultValue,
    validate: (value: unknown): boolean => {
      // Convert to boolean
      return Boolean(value);
    },
    format: options.format || ((value: boolean) => value ? "On" : "Off"),
  };
}

/**
 * Options for creating an enum parameter
 */
export interface EnumParamOptions<T extends string> {
  /** Parameter name */
  name: string;

  /** Valid enum values */
  values: readonly T[];

  /** Default value */
  defaultValue: T;

  /** Optional formatting function */
  format?: (value: T) => string;
}

/**
 * Creates an enum parameter descriptor with validation
 */
export function createEnumParam<T extends string>(
  options: EnumParamOptions<T>,
): ParamDescriptor<T> {
  return {
    name: options.name,
    defaultValue: options.defaultValue,
    validate: (value: unknown): T => {
      // Check if value is in the allowed values
      if (typeof value === "string" && options.values.includes(value as T)) {
        return value as T;
      }

      console.warn(`Invalid ${options.name} value: ${value}, using default`);
      return options.defaultValue;
    },
    format: options.format || ((value: T) => value),
  };
}
