// Authentication utilities for the WebRTC Controller
import { getCookieValue } from "./utils/cookies.ts";
import type { OAuth2Client } from "https://deno.land/x/oauth2_client@v1.0.2/mod.ts";

// Types
export interface SessionData {
  email: string;
  name: string;
  expiresAt: number;
  [key: string]: unknown;
}

// Initialize OAuth client safely
let oauth2Client: OAuth2Client | null = null;

// This needs to be executed in a module context
const initOAuth2Client = async () => {
  try {
    const module = await import(
      "https://deno.land/x/oauth2_client@v1.0.2/mod.ts"
    );
    const OAuth2ClientClass = module.OAuth2Client;
    oauth2Client = new OAuth2ClientClass({
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
  } catch (error) {
    console.error("Error initializing OAuth client:", error);
  }
};

// Execute initialization
initOAuth2Client();

/**
 * Generate a Google OAuth URL for authentication
 * @returns The Google OAuth URL as a string
 */
export function getGoogleAuthUrl(): string {
  try {
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
  } catch (error) {
    console.error("Error generating Google Auth URL:", error);
    return "";
  }
}

/**
 * Get the OAuth2Client instance
 * @returns The OAuth2Client instance or null if initialization failed
 */
export function getOAuth2Client(): OAuth2Client | null {
  return oauth2Client;
}

/**
 * Verify a session from Deno KV
 * @param sessionId The session ID from the cookie
 * @param kv The Deno KV instance
 * @returns SessionData object or null if verification fails
 */
export async function verifySession(
  sessionId: string | null,
  kv: Deno.Kv,
): Promise<{ sessionData: { value: SessionData | null }; error?: Error }> {
  if (!sessionId) {
    return { sessionData: { value: null } };
  }

  try {
    const sessionData = await kv.get<SessionData>([
      "webrtc:sessions",
      sessionId,
    ]);
    return {
      sessionData: {
        value: sessionData.value as SessionData | null,
      },
    };
  } catch (error) {
    console.error("Error accessing KV store:", error);
    return {
      sessionData: { value: null },
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Check if session data is valid
 * @param sessionData The session data from KV
 * @returns Whether the session is valid
 */
export function isSessionValid(
  sessionData: { value: SessionData | null },
): boolean {
  if (
    !sessionData ||
    !sessionData.value ||
    (sessionData.value &&
      typeof sessionData.value === "object" &&
      "expiresAt" in sessionData.value &&
      typeof sessionData.value.expiresAt === "number" &&
      sessionData.value.expiresAt < Date.now())
  ) {
    return false;
  }
  return true;
}

/**
 * Handle authentication redirects and errors
 * @param req The request object
 * @param kv The Deno KV instance
 * @param ctx The context with render method
 * @param options Authentication options
 * @returns A Response or null if auth is successful
 */
export async function handleAuthRedirectsAndErrors(
  _req: Request,
  kv: Deno.Kv,
  ctx: {
    render: (data: unknown, options?: { headers?: Headers }) => Response | Promise<Response>;
  },
  options: {
    sessionId?: string | null;
    sessionData?: { value: SessionData | null };
    error?: Error;
  },
): Promise<Response | null> {
  const { sessionId, sessionData, error } = options;

  // Handle KV connection errors
  if (!kv) {
    console.error("KV store is not available");
    return ctx.render({
      error: "Database connection failed. Please check server configuration.",
    });
  }

  // Handle KV access errors
  if (error) {
    // Check specifically for quota errors
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes("quota")
    ) {
      console.log("KV quota exceeded, redirecting to dev controller");
      return new Response(null, {
        status: 302,
        headers: { Location: "/ctrl/dev" },
      });
    }

    return ctx.render({
      error: "Database access error. Using development version is recommended.",
      details: error.message,
      quotaExceeded: error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string" &&
        error.message.includes("quota"),
    });
  }

  // Handle missing session (not logged in)
  if (!sessionId) {
    // User is not logged in, create authorization URI using our manual function
    const loginUrl = getGoogleAuthUrl();

    // Show a login page with a button instead of automatic redirect
    return ctx.render({
      needsLogin: true,
      loginUrl: loginUrl,
    });
  }

  // Handle invalid or expired session
  if (!isSessionValid(sessionData!)) {
    // Session is invalid or expired
    if (!oauth2Client) {
      console.error("OAuth client not available");
      return ctx.render({
        error:
          "Authentication system unavailable. Please check server configuration.",
      });
    }

    const authorizationUri = await oauth2Client.code.getAuthorizationUri();

    // Convert the URI to a string
    const loginUrl = authorizationUri.toString();

    // Debug logging for the expired session case
    console.log("===== EXPIRED SESSION AUTH DEBUG =====");
    console.log("Generated login URL (expired session):", loginUrl);
    console.log("Current oauth2Client config:", {
      clientId: Deno.env.get("GOOGLE_CLIENT_ID") ? "Set" : "Not set",
      redirectUri: oauth2Client && "redirectUri" in oauth2Client
        ? oauth2Client.redirectUri
        : "unknown",
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

  // Authentication is successful
  return null;
}
