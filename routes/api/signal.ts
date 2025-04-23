import { Handlers } from "$fresh/server.ts";
import { ulid } from "https://deno.land/x/ulid@v0.3.0/mod.ts";

// Open the KV store (used for message buffering and controller registration)
const kv = await Deno.openKv();

// Message queue TTL - messages expire after 5 minutes
const MESSAGE_TTL_MS = 1000 * 60 * 5;

// Key prefixes for KV store
const MESSAGE_KEY_PREFIX = ["webrtc", "messages"];
const CONTROLLER_KEY = ["webrtc:active_ctrl_client"]; // Use the same key as in active.ts

// Active WebSocket connections (in-memory per instance)
const activeConnections = new Map<string, WebSocket>();

// Need to define the functions before exposing them globally
// This will be done after the functions are defined

/**
 * Register a controller in KV store
 * Only one controller should be active at a time
 */
async function registerController(controllerId: string): Promise<void> {
  // Store the controller ID directly in KV
  await kv.set(CONTROLLER_KEY, controllerId);
  console.log(`Registered controller: ${controllerId}`);
}

/**
 * Unregister a controller from KV store
 */
async function unregisterController(controllerId: string): Promise<void> {
  // Get current controller to verify it's the one being unregistered
  const controller = await kv.get(CONTROLLER_KEY);

  if (controller.value === controllerId) {
    await kv.delete(CONTROLLER_KEY);
    console.log(`Unregistered controller: ${controllerId}`);
  }
}

/**
 * Get the currently active controller
 */
async function getActiveController(): Promise<string | null> {
  const controller = await kv.get(CONTROLLER_KEY);
  return controller.value || null;
}

/**
 * Queue a message for a peer that is currently offline
 * Messages are stored with TTL and delivered when the peer connects
 */
async function queueMessage(
  targetId: string,
  message: Record<string, unknown>,
) {
  const messageId = ulid();
  const messagesKey = [...MESSAGE_KEY_PREFIX, targetId, messageId];

  // Store message with TTL - automatically expires if not delivered
  await kv.set(messagesKey, message, { expireIn: MESSAGE_TTL_MS });
  console.log(`Message queued for ${targetId}`);
}

/**
 * Process any queued messages for a peer that just connected
 */
async function deliverQueuedMessages(clientId: string, socket: WebSocket) {
  try {
    const prefix = [...MESSAGE_KEY_PREFIX, clientId];
    const messagesIterator = kv.list({ prefix });

    let count = 0;
    for await (const entry of messagesIterator) {
      // Deliver the message
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(entry.value));
        count++;
      }

      // Delete the message from the queue
      await kv.delete(entry.key);
    }

    if (count > 0) {
      console.log(`Delivered ${count} queued messages to ${clientId}`);
    }
  } catch (error) {
    console.error(`Error delivering queued messages to ${clientId}:`, error);
  }
}

// Make functions available to other modules via global object
// @ts-ignore - accessing global in Deno
const globalThis = typeof window !== "undefined" ? window : self;

// @ts-ignore - setting global property
globalThis.signalState = {
  activeConnections,
  queueMessage,
};

export const handler: Handlers = {
  GET: async (req) => {
    const url = new URL(req.url);
    const upgrade = req.headers.get("upgrade") || "";

    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    let clientId: string | null = null;

    socket.onopen = () => {
      console.log("WebSocket connection opened");
    };

    socket.onmessage = async (event) => {
      try {
        // Check for empty or non-text messages
        if (!event.data || typeof event.data !== "string") {
          console.log("Received invalid message data:", event.data);
          return;
        }

        // Parse the message and validate
        const message = JSON.parse(event.data);

        // Ensure message and type exist
        if (!message || !message.type) {
          console.log("Received message with missing type:", message);
          return;
        }

        switch (message.type) {
          case "register":
            // Register the client with its ID
            clientId = message.id;
            activeConnections.set(clientId, socket);
            console.log(`Client registered with ID: ${clientId}`);

            // Check if this is a controller client (based on ID prefix)
            if (clientId.startsWith("controller-")) {
              console.log(`Detected controller client: ${clientId}`);
              // Register as active controller
              await registerController(clientId);
              console.log(`Controller registration complete: ${clientId}`);
            }

            // Deliver any queued messages immediately
            await deliverQueuedMessages(clientId, socket);
            break;

          case "get-controller":
            // Client is requesting the active controller
            if (!clientId) {
              console.error("Client not registered");
              return;
            }

            // Get the current active controller
            const activeController = await getActiveController();

            // Send the controller info back to the client
            socket.send(JSON.stringify({
              type: "controller-info",
              controllerId: activeController,
            }));

            console.log(
              `Sent controller info to ${clientId}: ${
                activeController || "none"
              }`,
            );
            break;

          case "heartbeat":
            // Simple heartbeat to keep connection alive - no state tracking
            // Client ID must be set by a previous register message
            break;

          // Controller-kicked notification
          case "controller-kicked":
            if (!clientId) {
              console.error("Client not registered");
              return;
            }

            const kickTargetId = message.target;
            if (!kickTargetId) {
              console.error("Target ID missing in controller-kicked message");
              return;
            }

            console.log(
              `SIGNAL: Controller-kicked message from ${clientId} to ${kickTargetId}`,
            );

            // Format the kick message
            const kickMessage = {
              type: "controller-kicked",
              newControllerId: message.newControllerId,
              source: clientId,
            };

            // Try direct delivery to the kicked controller
            const kickedControllerSocket = activeConnections.get(kickTargetId);
            if (
              kickedControllerSocket &&
              kickedControllerSocket.readyState === WebSocket.OPEN
            ) {
              console.log(
                `SIGNAL: Direct delivery of controller-kicked from ${clientId} to ${kickTargetId}`,
              );
              kickedControllerSocket.send(JSON.stringify(kickMessage));
              console.log(
                `SIGNAL: Delivered controller-kicked to ${kickTargetId}`,
              );
            } else {
              // Queue the kick message for later delivery
              console.log(
                `SIGNAL: Target ${kickTargetId} not connected, queuing kick message`,
              );
              await queueMessage(kickTargetId, kickMessage);
              console.log(
                `SIGNAL: Queued controller-kicked for ${kickTargetId}`,
              );
            }
            break;

          // Core WebRTC Signaling Messages - pure relay
          case "offer":
          case "answer":
          case "ice-candidate":
            if (!clientId) {
              console.error("Client not registered");
              return;
            }

            const targetId = message.target;
            if (!targetId) {
              console.error("Target ID missing in message");
              return;
            }

            console.log(
              `SIGNAL: ${message.type} message from ${clientId} to ${targetId}`,
            );

            // Format signal message with source information
            const signalMessage = {
              type: message.type,
              data: message.data,
              source: clientId,
            };

            // Try direct delivery if target is connected to this instance
            const targetSocket = activeConnections.get(targetId);
            if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
              console.log(
                `SIGNAL: Direct delivery of ${message.type} from ${clientId} to ${targetId}`,
              );
              targetSocket.send(JSON.stringify(signalMessage));
              console.log(`SIGNAL: Delivered ${message.type} to ${targetId}`);
            } else {
              // Queue message for later delivery
              console.log(
                `SIGNAL: Target ${targetId} not connected, queuing message`,
              );
              await queueMessage(targetId, signalMessage);
              console.log(`SIGNAL: Queued ${message.type} for ${targetId}`);
            }
            break;

          default:
            console.log(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    };

    socket.onclose = async () => {
      // Simple connection cleanup - remove from active connections
      if (clientId) {
        activeConnections.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);

        // If this was a controller, unregister it
        if (clientId.startsWith("controller-")) {
          await unregisterController(clientId);
        }
      }
    };

    return response;
  },
};
