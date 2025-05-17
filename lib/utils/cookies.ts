/**
 * Parse cookies from a header string.
 * @param cookieStr The full Cookie header string.
 * @param name The name of the cookie to retrieve.
 * @returns The cookie value or null if not present.
 */
export function getCookieValue(cookieStr: string, name: string): string | null {
  const match = cookieStr.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}