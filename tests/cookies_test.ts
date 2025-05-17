import { assertEquals, assertStrictEquals } from "./asserts.ts";
import { getCookieValue } from "../lib/utils/cookies.ts";

Deno.test("getCookieValue returns null when cookie header is empty", () => {
  const result = getCookieValue("", "session");
  assertStrictEquals(result, null);
});

Deno.test("getCookieValue extracts value correctly", () => {
  const cookies = "user=alice; session=abc123; theme=dark";
  const sess = getCookieValue(cookies, "session");
  assertEquals(sess, "abc123");
  const theme = getCookieValue(cookies, "theme");
  assertEquals(theme, "dark");
});