/**
 * Simple assertion utilities for offline testing
 */
export function assertStrictEquals(
  actual: unknown,
  expected: unknown,
  msg?: string,
) {
  if (actual !== expected) {
    throw new Error(msg || `Assertion failed: ${actual} !== ${expected}`);
  }
}

export function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  // For our simple tests, strict equality is sufficient
  if (actual !== expected) {
    throw new Error(
      msg ||
        `Assertion failed: ${JSON.stringify(actual)} !== ${
          JSON.stringify(expected)
        }`,
    );
  }
}
