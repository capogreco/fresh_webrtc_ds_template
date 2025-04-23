import { Handlers } from "$fresh/server.ts";

// Open the KV store
const kv = await Deno.openKv();

// Simplified: store only the active controller client ID
const ACTIVE_CTRL_CLIENT_ID = ["webrtc:active_ctrl_client"];

// Access the global object for WebSocket connections
// @ts-ignore - accessing global in Deno
const globalThis = typeof window !== "undefined" ? window : self;

// Development mode flag - set to true to bypass authentication
const DEV_MODE = false;

// Middleware to ensure only authenticated users can access this endpoint
async function checkAuth(req: Request): Promise<string | null> {
  // In development mode, allow access with a dev user ID
  if (DEV_MODE) {
    // Check if this is a request from the development controller
    try {
      // Try to parse the request body to check for dev-user-id
      const body = await req.clone().json();
      if (body.userId === "dev-user-id") {
        return "dev-user-id";
      }
    } catch (e) {
      // Parsing failed, continue with normal auth
    }
  }

  // Get session cookie
  const cookies = req.headers.get("cookie") || "";
  const sessionId = getCookieValue(cookies, "session");

  if (!sessionId) {
    return null;
  }

  // Verify session
  const session = await kv.get(["webrtc:sessions", sessionId]);

  if (!session.value || session.value.expiresAt < Date.now()) {
    return null;
  }

  // Return the sessionId itself, as this is what we use as the userId
  return sessionId;
}

// Helper to get a cookie value
function getCookieValue(cookieStr: string, name: string): string | null {
  const match = cookieStr.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}

export const handler: Handlers = {
  // Get active controller status
  async GET(req) {
    // Check auth
    const userId = await checkAuth(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      // Get controller client ID from request query
      const url = new URL(req.url);
      const requestingClientId = url.searchParams.get("clientId");

      if (!requestingClientId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Client ID parameter is required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get active controller client ID
      const activeClientId = await kv.get(ACTIVE_CTRL_CLIENT_ID);

      if (!activeClientId.value) {
        return new Response(
          JSON.stringify({
            active: false,
            requestingClientId,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          active: true,
          isCurrentClient: activeClientId.value === requestingClientId,
          controllerClientId: activeClientId.value,
          requestingClientId,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error checking active controller:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  // Acquire controller role
  async POST(req) {
    // Check auth
    const userId = await checkAuth(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      // Parse request body for force flag and controller client ID
      const body = await req.json();
      const forceAcquire = body.force === true;
      const controllerClientId = body.controllerClientId;

      if (!controllerClientId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Controller client ID is required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Try to get the current active controller client ID
      const existingClientId = await kv.get(ACTIVE_CTRL_CLIENT_ID);

      // Check if a different client is already active
      if (
        existingClientId.value && existingClientId.value !== controllerClientId
      ) {
        if (!forceAcquire) {
          // Active controller exists and user did not force acquisition
          return new Response(
            JSON.stringify({
              success: false,
              error: "Another controller is already active",
              activeControllerClientId: existingClientId.value,
            }),
            {
              status: 409, // Conflict
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Force flag is true, so we will take over
        console.log(
          `Controller takeover: ${existingClientId.value} -> ${controllerClientId}`,
        );
      }

      // Set the active controller client ID
      await kv.set(ACTIVE_CTRL_CLIENT_ID, controllerClientId);

      return new Response(
        JSON.stringify({
          success: true,
          controllerClientId,
          takeover: existingClientId.value &&
            existingClientId.value !== controllerClientId,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error acquiring controller status:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  // Release controller role
  async DELETE(req) {
    // Check auth
    const userId = await checkAuth(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      // Parse request to get client ID
      const body = await req.json();
      const controllerClientId = body.controllerClientId;
      const newControllerClientId = body.newControllerClientId; // New controller that's taking over

      if (!controllerClientId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Controller client ID is required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get current active controller client ID
      const activeClientId = await kv.get(ACTIVE_CTRL_CLIENT_ID);

      // Check for special force-deactivate value that allows any authenticated user to deactivate
      const forceDeactivate = controllerClientId === "force-deactivate";

      // Only the active controller client or a force deactivation can release the status
      if (activeClientId.value !== controllerClientId && !forceDeactivate) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "You are not the active controller client",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Log the forced deactivation if that's what's happening
      if (forceDeactivate) {
        console.log(
          `Forced deactivation of controller client ${activeClientId.value} by user ${userId}`,
        );

        // If we have a new controller ID, notify the old one via the signal service
        if (newControllerClientId && activeClientId.value) {
          try {
            // Instead of using fetch to the API endpoints directly, which requires absolute URLs and may
            // cause cross-origin issues, let's just check the in-memory connections directly

            // @ts-ignore - accessing global object property
            const signalState = globalThis.signalState;
            let clientsData = { clients: [] };

            if (signalState?.activeConnections) {
              clientsData.clients = Array.from(
                signalState.activeConnections.keys(),
              );
            }

            // Find the active controller in the signaling clients
            if (
              clientsData.clients &&
              clientsData.clients.includes(activeClientId.value)
            ) {
              // Direct access to the WebSocket for the kicked controller
              const kickedSocket = signalState?.activeConnections?.get(
                activeClientId.value,
              );

              if (kickedSocket && kickedSocket.readyState === WebSocket.OPEN) {
                // Send kick message directly through the WebSocket
                kickedSocket.send(JSON.stringify({
                  type: "controller-kicked",
                  newControllerId: newControllerClientId,
                  source: "system",
                }));

                console.log(
                  `Directly sent kick notification to controller ${activeClientId.value}`,
                );
              } else if (signalState?.queueMessage) {
                // Queue the message for delivery when the client reconnects
                await signalState.queueMessage(activeClientId.value, {
                  type: "controller-kicked",
                  newControllerId: newControllerClientId,
                  source: "system",
                });

                console.log(
                  `Queued kick notification for controller ${activeClientId.value}`,
                );
              }
            }
          } catch (error) {
            console.error("Error sending kick notification:", error);
          }
        }
      }

      // Delete the active controller entry
      await kv.delete(ACTIVE_CTRL_CLIENT_ID);

      return new Response(
        JSON.stringify({
          success: true,
          previousControllerId: activeClientId.value,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Error releasing controller status:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
