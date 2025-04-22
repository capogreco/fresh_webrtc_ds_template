import { Handlers } from "$fresh/server.ts";

// Open the KV store
const kv = await Deno.openKv();
const CONTROLLER_ACTIVE_KEY = ["webrtc:controller:active"];
// No timeout - controller remains active until explicitly released or replaced

// Store the controller client ID separately for easy access
const CONTROLLER_CLIENT_ID_KEY = ["webrtc:controller:clientId"];

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

      const activeController = await kv.get(CONTROLLER_ACTIVE_KEY);
      const activeClientId = await kv.get(CONTROLLER_CLIENT_ID_KEY);

      if (!activeController.value) {
        return new Response(
          JSON.stringify({ active: false }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          active: true,
          isCurrentUser: activeController.value.userId === userId,
          isCurrentClient: activeClientId.value === requestingClientId,
          userId: activeController.value.userId,
          name: activeController.value.name,
          timestamp: activeController.value.timestamp,
          controllerClientId: activeClientId.value || null,
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
      // Parse request body for force flag, name, and controller client ID
      const body = await req.json();
      const forceAcquire = body.force === true;
      const name = body.name || "Unknown User";
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

      // Try to get the current active controller
      const existingActive = await kv.get(CONTROLLER_ACTIVE_KEY);
      const existingClientId = await kv.get(CONTROLLER_CLIENT_ID_KEY);

      // Check if someone else is already active
      const isCurrentClient = existingClientId.value === controllerClientId;

      if (existingActive.value && !isCurrentClient) {
        if (!forceAcquire) {
          // Active controller exists and user did not force acquisition
          return new Response(
            JSON.stringify({
              success: false,
              error: "Another controller is already active",
              activeController: {
                userId: existingActive.value.userId,
                name: existingActive.value.name,
                controllerClientId: existingClientId.value,
              },
            }),
            {
              status: 409, // Conflict
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Force flag is true, so we will take over
        console.log(
          `Controller handoff: ${existingClientId.value} -> ${controllerClientId}`,
        );
      }

      // Use atomic operations to set both values
      const atomicOp = kv.atomic();

      // Set active controller without expiration
      atomicOp.set(CONTROLLER_ACTIVE_KEY, {
        userId,
        name,
        timestamp: Date.now(),
      });

      // Store the controller client ID separately
      atomicOp.set(CONTROLLER_CLIENT_ID_KEY, controllerClientId);

      // Commit the atomic operation
      const result = await atomicOp.commit();

      // Check if the commit succeeded
      if (!result.ok) {
        console.error("Atomic operation failed:", result);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to set controller - database error",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          handoff: existingActive.value && !isCurrentClient,
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

      // Get current active controller and client ID
      const activeController = await kv.get(CONTROLLER_ACTIVE_KEY);
      const activeClientId = await kv.get(CONTROLLER_CLIENT_ID_KEY);

      // Only the active controller client can release the status
      if (activeClientId.value !== controllerClientId) {
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

      // Delete both controller entries atomically
      const atomicOp = kv.atomic();
      atomicOp.delete(CONTROLLER_ACTIVE_KEY);
      atomicOp.delete(CONTROLLER_CLIENT_ID_KEY);
      const result = await atomicOp.commit();

      return new Response(
        JSON.stringify({ success: true }),
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
