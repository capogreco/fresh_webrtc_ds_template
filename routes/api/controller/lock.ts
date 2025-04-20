import { Handlers } from "$fresh/server.ts";

// Open the KV store
const kv = await Deno.openKv();
const CONTROLLER_LOCK_KEY = ["webrtc:controller:lock"];
const CONTROLLER_LOCK_TTL_MS = 1000 * 60 * 5; // 5 minutes TTL for controller lock

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
  // Acquire controller lock
  async POST(req) {
    // Check auth
    const userId = await checkAuth(req);
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    try {
      // Try to get the current lock
      const existingLock = await kv.get(CONTROLLER_LOCK_KEY);
      
      // Check if someone else has the lock
      if (existingLock.value && existingLock.value.userId !== userId) {
        // Check if the lock has expired
        const lockAgeMs = Date.now() - existingLock.value.timestamp;
        
        if (lockAgeMs < CONTROLLER_LOCK_TTL_MS) {
          // Lock is active and held by someone else
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: "Controller is already locked by another user",
              lockHolder: existingLock.value.userId,
              remainingTimeMs: CONTROLLER_LOCK_TTL_MS - lockAgeMs,
            }),
            {
              status: 409, // Conflict
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        
        // Lock has expired, we can take it
      }
      
      // Set lock with expiration
      await kv.set(CONTROLLER_LOCK_KEY, {
        userId,
        timestamp: Date.now(),
      }, { expireIn: CONTROLLER_LOCK_TTL_MS });
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error acquiring controller lock:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Server error" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
  
  // Check lock status
  async GET(req) {
    // Check auth
    const userId = await checkAuth(req);
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    try {
      const lock = await kv.get(CONTROLLER_LOCK_KEY);
      
      if (!lock.value) {
        return new Response(
          JSON.stringify({ locked: false }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      
      const lockAgeMs = Date.now() - lock.value.timestamp;
      const isExpired = lockAgeMs >= CONTROLLER_LOCK_TTL_MS;
      
      return new Response(
        JSON.stringify({
          locked: !isExpired,
          isOwner: lock.value.userId === userId,
          userId: lock.value.userId,
          timestamp: lock.value.timestamp,
          remainingTimeMs: isExpired ? 0 : CONTROLLER_LOCK_TTL_MS - lockAgeMs,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error checking controller lock:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Server error" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
  
  // Release lock
  async DELETE(req) {
    // Check auth
    const userId = await checkAuth(req);
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    try {
      // Get current lock
      const lock = await kv.get(CONTROLLER_LOCK_KEY);
      
      // Only the lock owner can release it
      if (lock.value && lock.value.userId !== userId) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "You don't own the controller lock" 
          }),
          { 
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      
      // Delete the lock
      await kv.delete(CONTROLLER_LOCK_KEY);
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error releasing controller lock:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Server error" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};