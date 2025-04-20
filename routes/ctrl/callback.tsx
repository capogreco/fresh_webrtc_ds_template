import { Handlers } from "$fresh/server.ts";
import { OAuth2Client } from "https://deno.land/x/oauth2_client@v1.0.2/mod.ts";

// OAuth configuration
const oauth2Client = new OAuth2Client({
  clientId: Deno.env.get("GOOGLE_CLIENT_ID") || "",
  clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
  authorizationEndpointUri: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUri: "https://oauth2.googleapis.com/token",
  redirectUri: `${Deno.env.get("BASE_URL") || "http://localhost:8000"}/ctrl/callback`,
  defaults: {
    scope: "email profile",
  },
});

// Allowed email(s) that can access the controller
const ALLOWED_EMAILS = [Deno.env.get("ALLOWED_EMAIL") || "your-email@example.com"];

// Open KV store
const kv = await Deno.openKv();

export const handler: Handlers = {
  async GET(req) {
    const url = new URL(req.url);
    
    // Debug logging
    console.log("===== OAuth CALLBACK DEBUG =====");
    console.log("Callback URL:", url.toString());
    console.log("URL search params:", url.search);
    console.log("OAuth client config:", {
      clientId: oauth2Client.clientId ? "Set" : "Not set",
      redirectUri: oauth2Client.redirectUri
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
        }
      );
      
      if (!userInfoResponse.ok) {
        console.error("Failed to fetch user info, status:", userInfoResponse.status);
        return new Response("Failed to fetch user info", { status: 500 });
      }
      
      const userInfo = await userInfoResponse.json();
      
      // Check if user's email is allowed
      if (!ALLOWED_EMAILS.includes(userInfo.email)) {
        return new Response("Unauthorized: Your email is not allowed to access the controller", { 
          status: 403 
        });
      }
      
      // Create a session
      const sessionId = crypto.randomUUID();
      
      // Store session in KV
      await kv.set(["webrtc:sessions", sessionId], {
        email: userInfo.email,
        name: userInfo.name,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24 hour expiry
      }, { expireIn: 1000 * 60 * 60 * 24 });
      
      // Set session cookie
      const headers = new Headers();
      headers.set(
        "Set-Cookie",
        `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24}`
      );
      headers.set("Location", "/ctrl");
      
      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (error) {
      console.error("OAuth error:", error);
      return new Response("Authentication failed", { status: 500 });
    }
  }
};