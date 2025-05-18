/**
 * Simple in-house ULID generator placeholder.
 * Returns a timestamp-based string padded to 26 chars.
 */
export function ulid(): string {
  // Base36 timestamp part
  const ts = Date.now().toString(36);
  // Append zeros to reach 26-character length
  return ts.padEnd(26, "0");
}
