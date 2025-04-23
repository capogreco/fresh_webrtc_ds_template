import { Handlers } from "$fresh/server.ts";

// For accessing shared variables in a module-safe way
let activeConnections: Map<string, WebSocket>;
let queueMessage: (
  targetId: string,
  message: Record<string, unknown>,
) => Promise<void>;

// Access the global signal state
// @ts-ignore - accessing global in Deno
const globalThis = typeof window !== "undefined" ? window : self;

export const handler: Handlers = {
  POST: async (req) => {
    try {
      // Try to access the active connections and queue function from global state
      // @ts-ignore - accessing global in Deno
      if (globalThis.signalState?.activeConnections) {
        // @ts-ignore - accessing global in Deno
        activeConnections = globalThis.signalState.activeConnections;
        // @ts-ignore - accessing global in Deno
        queueMessage = globalThis.signalState.queueMessage;
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Signal state not initialized",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Parse request body
      const body = await req.json();
      const { target, message } = body;

      if (!target || !message) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Target and message are required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Try to send the message directly if client is connected
      const targetSocket = activeConnections.get(target);
      let delivered = false;

      if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
        try {
          targetSocket.send(JSON.stringify(message));
          console.log(`Sent message to ${target}`, message.type);
          delivered = true;
        } catch (err) {
          console.error(`Error sending direct message to ${target}:`, err);
        }
      }

      // If not delivered directly, queue it
      if (!delivered && queueMessage) {
        await queueMessage(target, message);
        console.log(`Queued message for ${target}`, message.type);
      }

      return new Response(
        JSON.stringify({
          success: true,
          delivered,
          queued: !delivered && queueMessage !== undefined,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error sending message:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to send message: " + (error?.message || String(error)),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
