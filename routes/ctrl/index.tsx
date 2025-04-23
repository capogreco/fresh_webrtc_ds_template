import { Handlers, PageProps } from "$fresh/server.ts";
import { OAuth2Client } from "https://deno.land/x/oauth2_client@v1.0.2/mod.ts";
import Controller from "../../islands/Controller.tsx";
import KickControllerButton from "../../islands/KickControllerButton.tsx";

// OAuth configuration
// Manually construct Google OAuth URL function to avoid stringify issues
function getGoogleAuthUrl() {
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

// Initialize OAuth client safely
let oauth2Client;
try {
  oauth2Client = new OAuth2Client({
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

// Allowed email(s) that can access the controller
const ALLOWED_EMAILS = [
  Deno.env.get("ALLOWED_EMAIL") || "your-email@example.com",
];

// Controller lock in Deno KV - initialize safely
let kv;
try {
  kv = await Deno.openKv();
} catch (error) {
  console.error("Error opening KV store:", error);
}

// Key for storing the active controller client ID
const ACTIVE_CTRL_CLIENT_ID = ["webrtc:active_ctrl_client"];

// Helper to get a cookie value
function getCookieValue(cookieStr: string, name: string): string | null {
  const match = cookieStr.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}

export const handler: Handlers = {
  async GET(req, ctx) {
    try {
      // Check URL for special parameters from kick controller redirect
      const url = new URL(req.url);
      const forceActive = url.searchParams.get("active") === "true";
      const forcedClientId = url.searchParams.get("clientId");

      // Check if this is a production deployment without env vars set
      const isProdWithoutEnvVars = !Deno.env.get("GOOGLE_CLIENT_ID") &&
        req.url.includes("deno.dev");

      if (isProdWithoutEnvVars) {
        console.log(
          "Production deployment detected without OAuth environment variables",
        );
        // Redirect to dev controller in production if no OAuth credentials
        return new Response(null, {
          status: 302,
          headers: { Location: "/ctrl/dev" },
        });
      }

      // For regular page access, check if the user is authenticated
      const sessionId = getCookieValue(
        req.headers.get("cookie") || "",
        "session",
      );

      // Make sure KV is available
      if (!kv) {
        console.error("KV store is not available");
        return ctx.render({
          error:
            "Database connection failed. Please check server configuration.",
        });
      }

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
      let sessionData;
      try {
        sessionData = await kv.get(["webrtc:sessions", sessionId]);
      } catch (error) {
        console.error("Error accessing KV store:", error);

        // Check specifically for quota errors
        if (error.message && error.message.includes("quota")) {
          console.log("KV quota exceeded, redirecting to dev controller");
          return new Response(null, {
            status: 302,
            headers: { Location: "/ctrl/dev" },
          });
        }

        return ctx.render({
          error:
            "Database access error. Using development version is recommended.",
          details: error.message,
          quotaExceeded: error.message.includes("quota"),
        });
      }

      if (
        !sessionData || !sessionData.value ||
        (sessionData.value.expiresAt < Date.now())
      ) {
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

      // Generate a unique client ID for this controller session or use the forced one from kick
      const clientId = forcedClientId ||
        `controller-${crypto.randomUUID().substring(0, 8)}`;

      // Check if there's an active controller
      let activeControllerClientId;
      try {
        activeControllerClientId = await kv.get(ACTIVE_CTRL_CLIENT_ID);
      } catch (error) {
        console.error("Error checking active controller:", error);
        // If it's a quota error, just proceed with no active controller
        activeControllerClientId = { value: null };
      }

      // If this is a force active request and we have a matching client ID, update active controller
      if (forceActive && forcedClientId && forcedClientId === clientId) {
        console.log(`Force activating controller with client ID: ${clientId}`);
        try {
          await kv.set(ACTIVE_CTRL_CLIENT_ID, clientId);
          activeControllerClientId = { value: clientId };
        } catch (error) {
          console.error("Error forcing controller activation:", error);
        }
      }

      // Data to pass to the page
      const data = {
        user: {
          ...sessionData.value,
          id: sessionId, // Add the ID field for the client code
        },
        clientId, // Pass the generated client ID to the page
        isControllerActive: !!activeControllerClientId.value,
        isCurrentClient: activeControllerClientId.value === clientId,
        activeControllerClientId: activeControllerClientId.value || null,
      };

      return ctx.render(data);
    } catch (error) {
      console.error("Error in controller route handler:", error);
      // Return a friendly error page with details
      return ctx.render({
        error:
          "An error occurred while loading the controller page. Please try again later.",
        details: error.message,
        stack: error.stack,
      });
    }
  },
};

export default function ControllerPage({ data }: PageProps) {
  // Check for server error
  if (data.error) {
    return (
      <div class="container">
        <h1>Error</h1>

        {data.quotaExceeded
          ? (
            <div style="background-color: #ffe8cc; color: #7d4a00; padding: 16px; border-radius: 4px; margin-bottom: 20px; border: 1px solid #ffb459;">
              <h3 style="margin-top: 0;">Deno KV Quota Exceeded</h3>
              <p>
                The application has reached its database read limit. The
                development version will still work properly without requiring
                database access.
              </p>
            </div>
          )
          : <p>{data.error}</p>}

        {data.details && (
          <div style="margin-top: 20px; padding: 10px; background-color: #f5f5f5; border-radius: 4px;">
            <p>
              <strong>Details:</strong> {data.details}
            </p>
            {data.stack && (
              <pre style="margin-top: 10px; white-space: pre-wrap; overflow-x: auto; font-size: 12px; background-color: #f0f0f0; padding: 10px; border-radius: 4px;">
                {data.stack}
              </pre>
            )}
          </div>
        )}
        <div style="margin-top: 20px;">
          <a
            href="/ctrl/dev"
            class="activate-button"
            style="text-decoration: none; display: inline-block;"
          >
            Use Development Version
          </a>
        </div>
      </div>
    );
  }

  // Make sure data is properly formatted
  if (!data || typeof data !== "object") {
    return (
      <div class="container">
        <h1>Error</h1>
        <p>Invalid data format. Please try again.</p>
        <div style="margin-top: 20px;">
          <a
            href="/ctrl/dev"
            class="activate-button"
            style="text-decoration: none; display: inline-block;"
          >
            Try Development Version
          </a>
        </div>
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
          {data.loginUrl
            ? (
              <a
                href={data.loginUrl}
                class="activate-button"
                style="text-decoration: none; display: inline-block;"
                onClick={(e) => {
                  // Check if loginUrl is missing or invalid
                  if (!data.loginUrl || typeof data.loginUrl !== "string") {
                    e.preventDefault();
                    console.error("Invalid login URL:", data.loginUrl);
                    alert(
                      "Login URL is invalid. Please try refreshing the page.",
                    );
                  }
                }}
              >
                Login with Google
              </a>
            )
            : (
              <div>
                <p style="color: #e53e3e;">
                  Unable to generate login URL. OAuth configuration may be
                  incomplete.
                </p>
                <a
                  href="/ctrl/dev"
                  class="activate-button"
                  style="text-decoration: none; display: inline-block; margin-top: 20px;"
                >
                  Use Development Version
                </a>
              </div>
            )}
        </div>
      </div>
    );
  }

  const {
    user,
    clientId,
    isControllerActive,
    isCurrentClient,
    activeControllerClientId,
  } = data;

  // Make sure user object exists
  if (!user || typeof user !== "object") {
    return (
      <div class="container">
        <h1>Authentication Error</h1>
        <p>User data is missing or invalid. Please try again.</p>
        <div style="margin-top: 20px;">
          <a
            href="/ctrl/dev"
            class="activate-button"
            style="text-decoration: none; display: inline-block;"
          >
            Try Development Version
          </a>
        </div>
      </div>
    );
  }

  // If a controller is active and it's not this client
  if (isControllerActive && !isCurrentClient) {
    return (
      <div class="container">
        <h1>Controller Already Active</h1>
        <p>
          Another controller client is already active.
        </p>
        <div style="margin-top: 20px;">
          <KickControllerButton
            user={user}
            clientId={clientId}
            activeControllerClientId={activeControllerClientId}
          />
        </div>
      </div>
    );
  }

  return <Controller user={user} clientId={clientId} />;
}
