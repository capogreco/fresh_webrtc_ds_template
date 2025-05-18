// Preact component
import { h } from "preact";
import type { Handlers, PageProps } from "../../lib/types/fresh.ts";
import Controller from "../../islands/Controller.tsx";
import { getCookieValue } from "../../lib/utils/cookies.ts";
import {
  handleAuthRedirectsAndErrors,
  verifySession,
} from "../../lib/authUtils.ts";
import ErrorDisplayPage from "../../components/controller/page_states/ErrorDisplayPage.tsx";
import LoginPageView from "../../components/controller/page_states/LoginPageView.tsx";
import ControllerActiveElsewherePage from "../../components/controller/page_states/ControllerActiveElsewherePage.tsx";

// Allowed email(s) that can access the controller
const _ALLOWED_EMAILS = [
  Deno.env.get("ALLOWED_EMAIL") || "your-email@example.com",
];

// Controller lock in Deno KV - initialize safely
let kv: Deno.Kv | null = null;
try {
  kv = await Deno.openKv();
} catch (error) {
  console.error("Error opening KV store:", error);
}

// Key for storing the active controller client ID
const ACTIVE_CTRL_CLIENT_ID = ["webrtc:active_ctrl_client"];

export const handler: Handlers = {
  async GET(
    req: Request,
    ctx: {
      render: (data: unknown, options?: { headers?: Headers }) => Response;
    },
  ) {
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

      // Verify the session
      const { sessionData, error } = await verifySession(sessionId, kv!);

      // Handle authentication redirects and errors
      const authResponse = await handleAuthRedirectsAndErrors(req, kv!, ctx, {
        sessionId,
        sessionData,
        error,
      });

      // If authResponse is not null, it means we need to handle an auth related response
      if (authResponse) {
        return authResponse;
      }

      // Generate a unique client ID for this controller session or use the forced one from kick
      const clientId = forcedClientId ||
        `controller-${crypto.randomUUID().substring(0, 8)}`;

      // Check if there's an active controller
      let activeControllerClientId;
      try {
        activeControllerClientId = await kv!.get(ACTIVE_CTRL_CLIENT_ID);
      } catch (error) {
        console.error("Error checking active controller:", error);
        // If it's a quota error, just proceed with no active controller
        activeControllerClientId = { value: null };
      }

      // If this is a force active request and we have a matching client ID, update active controller
      if (forceActive && forcedClientId && forcedClientId === clientId) {
        console.log(`Force activating controller with client ID: ${clientId}`);
        try {
          await kv!.set(ACTIVE_CTRL_CLIENT_ID, clientId);
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
        details: error && typeof error === "object" && "message" in error
          ? error.message
          : String(error),
        stack: error && typeof error === "object" && "stack" in error
          ? error.stack
          : undefined,
      });
    }
  },
};

export default function ControllerPage({ data }: PageProps) {
  // Check for server error
  if (data && typeof data === "object" && "error" in data) {
    const typedData = data as Record<string, unknown>;
    const errorData = {
      error: String(typedData.error),
      details: "details" in typedData && typedData.details
        ? String(typedData.details)
        : undefined,
      stack: "stack" in typedData && typedData.stack
        ? String(typedData.stack)
        : undefined,
      quotaExceeded: "quotaExceeded" in typedData && typedData.quotaExceeded
        ? true
        : false,
    };
    return (
      <ErrorDisplayPage
        error={errorData.error}
        details={errorData.details}
        stack={errorData.stack}
        quotaExceeded={errorData.quotaExceeded}
      />
    );
  }

  // Make sure data is properly formatted
  if (!data || typeof data !== "object") {
    return (
      <ErrorDisplayPage
        error={"Invalid data format. Please try again."}
      />
    );
  }

  // Check if we need to show the login page
  if (data && typeof data === "object" && "needsLogin" in data) {
    const typedData = data as Record<string, unknown>;
    const loginData = {
      loginUrl: "loginUrl" in typedData && typedData.loginUrl
        ? String(typedData.loginUrl)
        : "",
      sessionExpired: "sessionExpired" in typedData && typedData.sessionExpired
        ? true
        : false,
    };
    return (
      <LoginPageView
        loginUrl={loginData.loginUrl}
        sessionExpired={loginData.sessionExpired}
      />
    );
  }

  // Extract data properties with type checking
  const user = data && typeof data === "object" && "user" in data
    ? data.user
    : null;
  const clientId = data && typeof data === "object" && "clientId" in data
    ? data.clientId
    : null;
  const isControllerActive =
    data && typeof data === "object" && "isControllerActive" in data
      ? data.isControllerActive
      : false;
  const isCurrentClient =
    data && typeof data === "object" && "isCurrentClient" in data
      ? data.isCurrentClient
      : false;
  const activeControllerClientId =
    data && typeof data === "object" && "activeControllerClientId" in data
      ? data.activeControllerClientId
      : null;

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

  // Ensure user has the correct shape
  const typedUser = {
    id: typeof user === "object" && "id" in user ? String(user.id) : "",
    name: typeof user === "object" && "name" in user ? String(user.name) : "",
    email: typeof user === "object" && "email" in user
      ? String(user.email)
      : "",
  };

  // Convert clientId to string
  const typedClientId = clientId ? String(clientId) : "";

  // Convert activeControllerClientId to string
  const typedActiveControllerClientId = activeControllerClientId
    ? String(activeControllerClientId)
    : "";

  // If a controller is active and it's not this client
  if (isControllerActive && !isCurrentClient) {
    return (
      <ControllerActiveElsewherePage
        user={typedUser}
        clientId={typedClientId}
        activeControllerClientId={typedActiveControllerClientId}
      />
    );
  }

  return <Controller user={typedUser} clientId={typedClientId} />;
}
