/**
 * Stochastic Integer Notation (SIN) Parser
 *
 * A utility for parsing SIN strings into usable arrays of numbers.
 * Supports various formats:
 * - Single value: "5" -> [5]
 * - Multiple values: "1 / 2 / 3" -> [1, 2, 3]
 * - Ranges: "1-5" -> [1, 2, 3, 4, 5]
 * - Mixed: "1 / 3-5 / 7" -> [1, 3, 4, 5, 7]
 */

/**
 * Parse a Stochastic Integer Notation string into an array of numbers
 * @param sinString The SIN string to parse
 * @returns Array of parsed integer values
 */
export function parseSIN(sinString: string): number[] {
  if (!sinString || typeof sinString !== "string") {
    return [];
  }

  // Trim whitespace and handle empty strings
  const trimmed = sinString.trim();
  if (trimmed === "") {
    return [];
  }

  // Split by forward slash separator and process each part
  return trimmed
    .split("/")
    .flatMap((part) => {
      // Remove any whitespace
      const cleanPart = part.trim();

      // Handle range notation (e.g., "1-5")
      if (cleanPart.includes("-")) {
        const [startStr, endStr] = cleanPart.split("-").map((s) => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        // Validate that both parts are valid numbers
        if (isNaN(start) || isNaN(end)) {
          console.warn(`Invalid SIN range: "${cleanPart}"`);
          return [];
        }

        // Generate range of integers (inclusive)
        const range: number[] = [];
        // Handle both ascending and descending ranges
        const step = start <= end ? 1 : -1;
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
          range.push(i);
        }
        return range;
      }

      // Handle single values
      const value = parseInt(cleanPart, 10);
      if (isNaN(value)) {
        console.warn(`Invalid SIN value: "${cleanPart}"`);
        return [];
      }
      return [value];
    });
}

/**
 * Parse a SIN string and ensure all values are within specified min/max bounds
 * @param sinString The SIN string to parse
 * @param min Minimum allowed value (inclusive)
 * @param max Maximum allowed value (inclusive)
 * @returns Array of clamped integer values
 */
export function parseSINWithBounds(
  sinString: string,
  min: number,
  max: number,
): number[] {
  const values = parseSIN(sinString);

  // Clamp all values to min/max range
  return values.map((value) => Math.max(min, Math.min(max, value)));
}

/**
 * Check if a string is a valid SIN format
 * @param sinString The string to validate
 * @returns True if valid SIN format, false otherwise
 */
export function isValidSIN(sinString: string): boolean {
  if (!sinString || typeof sinString !== "string") {
    return false;
  }

  // Trim and check if empty
  const trimmed = sinString.trim();
  if (trimmed === "") {
    return false;
  }

  // Split by forward slash and test each part
  const parts = trimmed.split("/");
  return parts.every((part) => {
    const cleanPart = part.trim();

    // Test for range format (e.g., "1-5")
    if (cleanPart.includes("-")) {
      const rangeParts = cleanPart.split("-");

      // Must have exactly two parts
      if (rangeParts.length !== 2) {
        return false;
      }

      // Both parts must be valid integers
      return rangeParts.every((p) => /^-?\d+$/.test(p.trim()));
    }

    // Test for single integer
    return /^-?\d+$/.test(cleanPart);
  });
}

/**
 * Convert an array of numbers to a SIN string representation
 * @param values Array of numbers to convert
 * @returns SIN string representation
 */
export function valuesToSIN(values: number[]): string {
  if (!values || !values.length) {
    return "";
  }

  // Helper to detect continuous ranges
  const findRanges = (nums: number[]): string[] => {
    const sorted = [...nums].sort((a, b) => a - b);
    const result: string[] = [];

    let rangeStart: number | null = null;
    let rangeEnd: number | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      if (rangeStart === null) {
        rangeStart = current;
        rangeEnd = current;
      } else if (next === rangeEnd! + 1) {
        rangeEnd = next;
        // Skip the next iteration since we've already processed this value
        i++;
      } else {
        // End of a range or single value
        if (rangeStart === rangeEnd) {
          result.push(`${rangeStart}`);
        } else if (rangeEnd! - rangeStart! > 1) {
          result.push(`${rangeStart}-${rangeEnd}`);
        } else {
          // For just two sequential values, list them individually
          result.push(`${rangeStart}`);
          result.push(`${rangeEnd}`);
        }

        // Reset for next range
        rangeStart = next;
        rangeEnd = next;
      }
    }

    // Handle the last range or value
    if (rangeStart !== null) {
      if (rangeStart === rangeEnd) {
        result.push(`${rangeStart}`);
      } else if (rangeEnd! - rangeStart! > 1) {
        result.push(`${rangeStart}-${rangeEnd}`);
      } else {
        result.push(`${rangeStart}`);
        result.push(`${rangeEnd}`);
      }
    }

    return result;
  };

  return findRanges(values).join(" / ");
}
