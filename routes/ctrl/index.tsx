import { Handlers, PageProps } from "$fresh/server.ts";
import { OAuth2Client } from "https://deno.land/x/oauth2_client@v1.0.2/mod.ts";
import Controller from "../../islands/Controller.tsx";

// OAuth configuration
// Manually construct Google OAuth URL function to avoid stringify issues
function getGoogleAuthUrl() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  if (!clientId) {
    console.error("Missing GOOGLE_CLIENT_ID environment variable");
    return "";
  }

  const redirectUri = `${
    Deno.env.get("BASE_URL") || "http://localhost:8000"
  }/ctrl/callback`;
  const scope = "email profile";

  // Debug logging
  console.log("BASE_URL env:", Deno.env.get("BASE_URL"));
  console.log("Calculated redirectUri:", redirectUri);

  // Generate a random state parameter to prevent CSRF
  const state = crypto.randomUUID();

  // Build the URL manually
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.append("client_id", clientId);
  url.searchParams.append("redirect_uri", redirectUri);
  url.searchParams.append("response_type", "code");
  url.searchParams.append("scope", scope);
  url.searchParams.append("state", state);
  url.searchParams.append("access_type", "offline");
  url.searchParams.append("prompt", "consent");

  // More detailed debug output
  console.log("Generated manual auth URL:", url.toString());
  console.log("URL parameters:");
  url.searchParams.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });

  return url.toString();
}

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

// Controller lock in Deno KV
const kv = await Deno.openKv();
const CONTROLLER_LOCK_KEY = ["webrtc:controller:lock"];
const CONTROLLER_LOCK_TTL_MS = 1000 * 60 * 5; // 5 minutes TTL for controller lock

// Helper to get a cookie value
function getCookieValue(cookieStr: string, name: string): string | null {
  const match = cookieStr.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}

export const handler: Handlers = {
  async GET(req, ctx) {
    // For regular page access, check if the user is authenticated
    const sessionId = getCookieValue(
      req.headers.get("cookie") || "",
      "session",
    );

    if (!sessionId) {
      // User is not logged in, create authorization URI using our manual function
      const loginUrl = getGoogleAuthUrl();

      // Show a login page with a button instead of automatic redirect
      return ctx.render({
        needsLogin: true,
        loginUrl: loginUrl,
      });
    }

    // Verify the session
    const sessionData = await kv.get(["webrtc:sessions", sessionId]);

    if (!sessionData.value || (sessionData.value.expiresAt < Date.now())) {
      // Session is invalid or expired
      const authorizationUri = await oauth2Client.code.getAuthorizationUri();

      // Convert the URI to a string
      const loginUrl = authorizationUri.toString();

      // Debug logging for the expired session case
      console.log("===== EXPIRED SESSION AUTH DEBUG =====");
      console.log("Generated login URL (expired session):", loginUrl);
      console.log("Current oauth2Client config:", {
        clientId: Deno.env.get("GOOGLE_CLIENT_ID") ? "Set" : "Not set",
        redirectUri: oauth2Client.redirectUri,
      });

      // Clear the invalid session cookie
      const headers = new Headers();
      headers.set(
        "Set-Cookie",
        "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      );

      // Show login page with message about expired session
      return ctx.render({
        needsLogin: true,
        loginUrl: loginUrl,
        sessionExpired: true,
      }, { headers });
    }

    // Check if controller is already locked
    const controllerLock = await kv.get(CONTROLLER_LOCK_KEY);

    // Data to pass to the page
    const data = {
      user: {
        ...sessionData.value,
        id: sessionId, // Add the ID field for the client code
      },
      isControllerActive: !!controllerLock.value,
      controllerId: controllerLock.value?.userId || null,
    };

    return ctx.render(data);
  },
};

export default function ControllerPage({ data }: PageProps) {
  // Make sure data is properly formatted
  if (!data || typeof data !== "object") {
    return (
      <div class="container">
        <h1>Error</h1>
        <p>Invalid data format. Please try again.</p>
      </div>
    );
  }

  // Check if we need to show the login page
  if (data.needsLogin) {
    return (
      <div class="container" style="max-width: 500px; text-align: center;">
        <h1>WebRTC Controller Login</h1>

        {data.sessionExpired
          ? (
            <div
              class="alert"
              style="margin-bottom: 20px; color: #e53e3e; background-color: rgba(229, 62, 62, 0.1); padding: 12px; border-radius: 4px; border: 1px solid #e53e3e;"
            >
              Your session has expired. Please log in again.
            </div>
          )
          : (
            <p>
              Please log in with your Google account to access the controller
              interface.
            </p>
          )}

        <div style="margin-top: 30px;">
          <a
            href={data.loginUrl || "#"}
            class="activate-button"
            style="text-decoration: none; display: inline-block;"
            onClick={(e) => {
              // Check if loginUrl is missing or invalid
              if (!data.loginUrl || typeof data.loginUrl !== "string") {
                e.preventDefault();
                console.error("Invalid login URL:", data.loginUrl);
                alert("Login URL is invalid. Please try refreshing the page.");
              }
            }}
          >
            Login with Google
          </a>
        </div>
      </div>
    );
  }

  const { user, isControllerActive, controllerId } = data;

  // Make sure user object exists
  if (!user || typeof user !== "object") {
    return (
      <div class="container">
        <h1>Authentication Error</h1>
        <p>User data is missing or invalid. Please try again.</p>
      </div>
    );
  }

  if (isControllerActive && controllerId !== user.id) {
    return (
      <div class="container">
        <h1>Controller Already Active</h1>
        <p>
          Another user is currently controlling the system. Please try again
          later.
        </p>
      </div>
    );
  }

  return <Controller user={user} />;
}
