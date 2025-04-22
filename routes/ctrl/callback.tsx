import { Handlers } from "$fresh/server.ts";
import { OAuth2Client } from "https://deno.land/x/oauth2_client@v1.0.2/mod.ts";

// OAuth configuration
const oauth2Client = new OAuth2Client({
  clientId: Deno.env.get("GOOGLE_CLIENT_ID") || "",
  clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
  authorizationEndpointUri: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUri: "https://oauth2.googleapis.com/token",
  redirectUri: `${
    Deno.env.get("BASE_URL") || "http://localhost:8000"
  }/ctrl/callback`,
  defaults: {
    scope: "email profile",
  },
});

// Allowed email(s) that can access the controller
const ALLOWED_EMAILS = [
  Deno.env.get("ALLOWED_EMAIL") || "your-email@example.com",
];

// Open KV store - with error handling
let kv;
try {
  kv = await Deno.openKv();
} catch (error) {
  console.error("Error opening KV store:", error);
  // We'll handle this in the handler
}

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);

    // Debug logging
    console.log("===== OAuth CALLBACK DEBUG =====");
    console.log("Callback URL:", url.toString());
    console.log("URL search params:", url.search);
    console.log("OAuth client config:", {
      clientId: oauth2Client.clientId ? "Set" : "Not set",
      redirectUri: oauth2Client.redirectUri,
    });

    try {
      // Exchange the authorization code for tokens
      console.log("Attempting to exchange code for token...");
      const tokens = await oauth2Client.code.getToken(url);
      console.log("Token exchange successful, access token obtained");

      // Get user info to verify email
      console.log("Fetching user info with access token...");
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        },
      );

      if (!userInfoResponse.ok) {
        console.error(
          "Failed to fetch user info, status:",
          userInfoResponse.status,
        );
        return new Response("Failed to fetch user info", { status: 500 });
      }

      const userInfo = await userInfoResponse.json();

      // Check if user's email is allowed
      if (!ALLOWED_EMAILS.includes(userInfo.email)) {
        return new Response(
          "Unauthorized: Your email is not allowed to access the controller",
          {
            status: 403,
          },
        );
      }

      // Create a session
      const sessionId = crypto.randomUUID();

      // Check if KV is available before trying to use it
      if (!kv) {
        console.log("KV not available, redirecting to dev controller instead");
        const headers = new Headers();
        headers.set("Location", "/ctrl/dev");
        return new Response(null, {
          status: 302,
          headers,
        });
      }

      // Store session in KV
      try {
        await kv.set(["webrtc:sessions", sessionId], {
          email: userInfo.email,
          name: userInfo.name,
          expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24 hour expiry
        }, { expireIn: 1000 * 60 * 60 * 24 });
      } catch (error) {
        console.error("Error storing session in KV:", error);

        // If there's a KV error (like quota exceeded), redirect to dev version
        if (error.message && error.message.includes("quota")) {
          console.log("KV quota exceeded, redirecting to dev controller");
          const headers = new Headers();
          headers.set("Location", "/ctrl/dev");
          return new Response(null, {
            status: 302,
            headers,
          });
        }

        // For other errors, show an error page
        return new Response(
          `Authentication error: ${error.message}. <a href="/ctrl/dev">Try dev version</a>`,
          {
            status: 500,
            headers: { "Content-Type": "text/html" },
          },
        );
      }

      // Set session cookie
      const headers = new Headers();
      headers.set(
        "Set-Cookie",
        `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
          60 * 60 * 24
        }`,
      );
      headers.set("Location", "/ctrl");

      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (error) {
      console.error("OAuth error:", error);

      // If it's a KV quota error specifically, mention it and provide the dev link
      if (error.message && error.message.includes("quota")) {
        return new Response(
          `<h2>KV Quota Exceeded</h2>
           <p>The database read quota has been exceeded.</p>
           <p><a href="/ctrl/dev">Continue to Development Version</a></p>`,
          {
            status: 302,
            headers: {
              "Content-Type": "text/html",
              "Location": "/ctrl/dev",
            },
          },
        );
      }

      // For other errors, show a generic error with a link to the dev version
      return new Response(
        `<h2>Authentication Failed</h2>
         <p>Error: ${error.message}</p>
         <p><a href="/ctrl/dev">Try Development Version</a></p>`,
        {
          status: 500,
          headers: { "Content-Type": "text/html" },
        },
      );
    }
  },
};
