import { Handlers } from "$fresh/server.ts";

const kv = await Deno.openKv();

export const handler: Handlers = {
  async GET(req) {
    // Get session cookie
    const cookies = req.headers.get("cookie") || "";
    const sessionId = getCookieValue(cookies, "session");

    // Clean up the session if it exists
    if (sessionId) {
      await kv.delete(["webrtc:sessions", sessionId]);
    }

    // Clear cookie and redirect to login
    return new Response(null, {
      status: 302,
      headers: {
        "Location": "/ctrl",
        "Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      },
    });
  },
};

// Helper to get a cookie value
function getCookieValue(cookieStr: string, name: string): string | null {
  const match = cookieStr.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}
