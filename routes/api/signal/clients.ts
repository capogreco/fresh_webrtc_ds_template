import { Handlers } from "$fresh/server.ts";

// For accessing shared variables in a module-safe way
// In a real production app, you'd use a shared database like Redis
// to track clients across multiple instances
let activeConnections: Map<string, WebSocket>;

// Define a global variable where we'll store the signal module's data
declare global {
  interface Window {
    signalState: {
      activeConnections: Map<string, WebSocket>;
      queueMessage: (
        targetId: string,
        message: Record<string, unknown>,
      ) => Promise<void>;
    };
  }
}

// Access the window object if defined (browser) or global object (Deno)
// @ts-ignore - accessing global in Deno
const globalThis = typeof window !== "undefined" ? window : self;

export const handler: Handlers = {
  GET: async (req) => {
    try {
      // Try to access the active connections from the global object
      // @ts-ignore - accessing global in Deno
      if (globalThis.signalState?.activeConnections) {
        // @ts-ignore - accessing global in Deno
        activeConnections = globalThis.signalState.activeConnections;
      } else {
        // If not found, return empty list
        return new Response(
          JSON.stringify({
            success: true,
            clients: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get all clients from the activeConnections map
      const clientIds = Array.from(activeConnections.keys());

      return new Response(
        JSON.stringify({
          success: true,
          clients: clientIds,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error getting active clients:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to get active clients: " +
            (error?.message || String(error)),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
