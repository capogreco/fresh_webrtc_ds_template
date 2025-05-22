/**
 * Deep merge utility functions for Ikeda Synth State
 */

/**
 * Type-safe deep merge for objects
 * @param target The target object to merge into
 * @param source The source object to merge from
 * @returns A new object with merged properties
 */
export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>,
): T {
  // Create a new object to avoid mutating the target
  const result = { ...target };

  // Iterate through the source properties
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      // If both values are objects and not null, recursively merge them
      if (
        sourceValue && 
        targetValue && 
        typeof sourceValue === 'object' && 
        typeof targetValue === 'object' &&
        !Array.isArray(sourceValue) &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge nested objects
        result[key] = deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        // For arrays or primitives, just replace the value
        result[key] = Array.isArray(sourceValue) 
          ? [...sourceValue] // Create a new array copy 
          : sourceValue;
      }
    }
  }

  return result;
}

/**
 * Gets a nested property from an object using a dot-notation path
 * @param obj The object to get the property from
 * @param path The path to the property in dot notation (e.g., "parameters.pink_noise_volume.value")
 * @returns The value at the path or undefined if the path doesn't exist
 */
export function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined;
  }, obj);
}

/**
 * Sets a nested property on an object using a dot-notation path
 * @param obj The object to set the property on
 * @param path The path to the property in dot notation (e.g., "parameters.pink_noise_volume.value")
 * @param value The value to set
 * @returns A new object with the updated property
 */
export function setNestedProperty<T>(obj: T, path: string, value: any): T {
  // Create a shallow copy of the object
  const result = { ...obj as Record<string, any> } as T;
  
  // Split the path into parts
  const parts = path.split('.');
  
  // Reference to the current level in the result object
  let current = result as Record<string, any>;
  
  // Traverse to the second-to-last part, creating objects as needed
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    
    // If the part doesn't exist or is not an object, create it
    if (current[part] === undefined || typeof current[part] !== 'object') {
      current[part] = {};
    }
    
    // Move the reference to the next level
    current = current[part];
  }
  
  // Set the value at the last part
  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
  
  return result;
}