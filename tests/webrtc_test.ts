import { assertEquals } from "./asserts.ts";
import {
  DEFAULT_FALLBACK_ICE_SERVERS,
  fetchIceServers,
} from "../lib/webrtc.ts";

Deno.test("fetchIceServers returns fallback on network failure", async () => {
  const fallback = await fetchIceServers(() => {
    throw new Error("network failure");
  });
  assertEquals(fallback, DEFAULT_FALLBACK_ICE_SERVERS);
});

Deno.test("fetchIceServers returns fallback on non-ok response", async () => {
  const mockFetch = (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> =>
    Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  const fallback = await fetchIceServers(mockFetch);
  assertEquals(fallback, DEFAULT_FALLBACK_ICE_SERVERS);
});

Deno.test("fetchIceServers returns fallback on invalid data format", async () => {
  const mockFetch = (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> =>
    Promise.resolve(
      { ok: true, json: () => Promise.resolve({ wrong: [] }) } as Response,
    );
  const fallback = await fetchIceServers(mockFetch);
  assertEquals(fallback, DEFAULT_FALLBACK_ICE_SERVERS);
});

Deno.test("fetchIceServers returns server-provided ICE servers", async () => {
  const sampleICE = [{ urls: "turn:example.local" }];
  const mockFetch = (
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ iceServers: sampleICE }),
    } as Response);
  const result = await fetchIceServers(mockFetch);
  assertEquals(result, sampleICE);
});
