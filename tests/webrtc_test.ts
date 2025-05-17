import { assertEquals } from "./asserts.ts";
import { fetchIceServers, DEFAULT_FALLBACK_ICE_SERVERS } from "../lib/webrtc.ts";

Deno.test("fetchIceServers: returns fallback on network error", async () => {
  // Simulate fetch throwing
  const fallback = await fetchIceServers(async () => { throw new Error("network failure"); });
  assertEquals(fallback, DEFAULT_FALLBACK_ICE_SERVERS);
});

Deno.test("fetchIceServers: returns fallback on non-ok response", async () => {
  // Simulate non-ok response
  const mockFetch = async () => ({ ok: false, json: async () => ({}) } as Response);
  const fallback = await fetchIceServers(mockFetch as any);
  assertEquals(fallback, DEFAULT_FALLBACK_ICE_SERVERS);
});

Deno.test("fetchIceServers: returns fallback on invalid data format", async () => {
  // Simulate ok response but missing iceServers
  const mockFetch = async () => ({ ok: true, json: async () => ({ wrong: [] }) } as Response);
  const fallback = await fetchIceServers(mockFetch as any);
  assertEquals(fallback, DEFAULT_FALLBACK_ICE_SERVERS);
});

Deno.test("fetchIceServers: returns server-provided ICE servers", async () => {
  const sampleICE = [{ urls: "turn:example.local" }];
  const mockFetch = async () => ({ ok: true, json: async () => ({ iceServers: sampleICE }) } as Response);
  const result = await fetchIceServers(mockFetch as any);
  assertEquals(result, sampleICE);
});