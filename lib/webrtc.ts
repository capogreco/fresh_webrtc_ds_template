/**
 * Utilities for WebRTC connection setup
 */

/**
 * Fetches ICE servers from the environment variable or uses a fallback.
 */
export const DEFAULT_FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

/**
 * Fetch ICE server configuration from the server endpoint.
 * Falls back to DEFAULT_FALLBACK_ICE_SERVERS on error or non-ok response.
 * @param fetchImpl Optional fetch implementation (for testing/mocking)
 */
export async function fetchIceServers(
  fetchImpl: typeof fetch = fetch,
): Promise<RTCIceServer[]> {
  try {
    const response = await fetchImpl("/api/twilio-ice");
    if (!response.ok) {
      console.warn(
        "fetchIceServers: Non-ok response, using fallback ICE servers",
      );
      return DEFAULT_FALLBACK_ICE_SERVERS;
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.iceServers)) {
      console.warn(
        "fetchIceServers: Invalid data format, using fallback ICE servers",
      );
      return DEFAULT_FALLBACK_ICE_SERVERS;
    }
    return data.iceServers;
  } catch (error) {
    console.error(
      "fetchIceServers: Error fetching ICE servers, using fallback:",
      error,
    );
    return DEFAULT_FALLBACK_ICE_SERVERS;
  }
}
