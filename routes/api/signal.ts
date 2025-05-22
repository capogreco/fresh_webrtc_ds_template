/// <reference lib="deno.unstable" />
import type { Handlers } from "$fresh/server.ts";
import {
  deliverQueuedMessages,
  MESSAGE_KEY_PREFIX as _MESSAGE_KEY_PREFIX,
  MESSAGE_TTL_MS as _MESSAGE_TTL_MS,
  queueMessage,
} from "../../lib/utils/signaling.ts";

// Open the KV store (used for message buffering and controller registration)
const kv = await Deno.openKv();

// Message queue TTL - messages expire after 5 minutes
// (imported from signaling utilities)

// Key prefixes for KV store (imported from signaling utilities)
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
  // Essential log - track controller registration
  console.log(`[${new Date().toISOString()}] CONTROLLER: Registered controller: ${controllerId}`);
}

/**
 * Broadcast controller info to a specific client
 */
async function sendControllerInfoToClient(clientId: string, socket: WebSocket): Promise<void> {
  const activeController = await getActiveController();
  socket.send(JSON.stringify({
    type: "controller-info",
    controllerId: activeController,
  }));
  // Non-essential log - remove
  // console.log(`Sent controller info (${activeController || "none"}) to client ${clientId}`);
}

/**
 * Unregister a controller from KV store
 */
async function unregisterController(controllerId: string): Promise<void> {
  // Get current controller to verify it's the one being unregistered
  // Non-essential log - remove
  // console.log(`[${new Date().toISOString()}] CONTROLLER: Attempting to unregister controller: ${controllerId}`);
  const controller = await kv.get(CONTROLLER_KEY);

  if (controller.value === controllerId) {
    await kv.delete(CONTROLLER_KEY);
    // Essential log - track controller unregistration
    console.log(`[${new Date().toISOString()}] CONTROLLER: Unregistered controller: ${controllerId}`);
  }
}

/**
 * Get the currently active controller
 */
async function getActiveController(): Promise<string | null> {
  const controller = await kv.get(CONTROLLER_KEY);
  return typeof controller.value === "string" ? controller.value : null;
}

// Make functions available to other modules via global object
// @ts-ignore - accessing global in Deno
const globalThis = typeof window !== "undefined" ? window : self;

// @ts-ignore - setting global property
globalThis.signalState = {
  activeConnections,
  queueMessage: (
    targetId: string,
    message: Record<string, unknown>,
  ): Promise<void> => queueMessage(kv, targetId, message),
};

export const handler: Handlers = {
  GET: (req: Request) => {
    const _url = new URL(req.url);
    const upgrade = req.headers.get("upgrade") || "";

    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    let clientId: string | null = null;

    socket.onopen = () => {
      // Non-essential log - remove
      // console.log("WebSocket connection opened");
    };

    socket.onmessage = async (event) => {
      try {
        // Check for empty or non-text messages
        if (!event.data || typeof event.data !== "string") {
          // Non-essential log - remove
          // console.log("Received invalid message data:", event.data);
          return;
        }

        // Parse the message and validate
        const message = JSON.parse(event.data);

        // Ensure message and type exist
        if (!message || !message.type) {
          // Non-essential log - remove
          // console.log("Received message with missing type:", message);
          return;
        }

        switch (message.type) {
          case "register":
            {
              // Ensure clientId is present for registration
              if (!message.id) {
                console.error("Registration message missing ID:", message);
                socket.send(
                  JSON.stringify({
                    type: "error",
                    message: "Registration requires an ID.",
                  }),
                );
                return;
              }
              // Register the client with its ID
              clientId = message.id;
              activeConnections.set(clientId!, socket);
              // Essential log - track client registration
              console.log(`Client registered with ID: ${clientId}`);

              // Check if this is a controller client (based on ID prefix or specific dev ID)
              if (clientId!.startsWith("controller-") || clientId === "dev-controller-id") {
                console.log(`[${new Date().toISOString()}] CONTROLLER: Detected controller client: ${clientId}`);
                // Register as active controller
                try {
                  await registerController(clientId!);
                  // Essential log - track controller registration completion
                  console.log(`[${new Date().toISOString()}] CONTROLLER: Registration complete for ${clientId}`);
                  
                  // Count how many clients we'll notify
                  const clientsToNotify = Array.from(activeConnections.keys())
                    .filter(id => id !== clientId)
                    .length;
                  
                  // Essential log - track broadcast notifications
                  console.log(`[${new Date().toISOString()}] BROADCAST: Broadcasting controller info to ${clientsToNotify} clients`);
                  
                  // Broadcast controller info to all connected clients
                  for (const [connectedClientId, clientSocket] of activeConnections.entries()) {
                    if (connectedClientId !== clientId) { // Don't need to send to the controller itself
                      try {
                        clientSocket.send(JSON.stringify({
                          type: "controller-info",
                          controllerId: clientId,
                        }));
                        // Essential log - track client notifications
                        console.log(`[${new Date().toISOString()}] BROADCAST: Notified client ${connectedClientId} about controller ${clientId}`);
                      } catch (error) {
                        console.error(`[${new Date().toISOString()}] ERROR: Failed to notify client ${connectedClientId} about controller: ${error}`);
                      }
                    }
                  }
                } catch (error) {
                  console.error(`[${new Date().toISOString()}] ERROR: Failed to register controller ${clientId}: ${error}`);
                }
              }

              // Deliver any queued messages immediately
              await deliverQueuedMessages(kv, clientId!, socket);
              
              // If this is not a controller, send the current controller info
              if (!clientId!.startsWith("controller-") && clientId !== "dev-controller-id") {
                await sendControllerInfoToClient(clientId!, socket);
              }
            }
            break;

          case "get-controller":
            {
              // Client is requesting the active controller
              if (!clientId) {
                console.error(`[${new Date().toISOString()}] ERROR: Client not registered for get-controller request`);
                return;
              }

              // Get the current active controller
              const activeController = await getActiveController();

              // Send the controller info back to the client
              socket.send(JSON.stringify({
                type: "controller-info",
                controllerId: activeController,
              }));

              // Essential log - track controller info requests
              console.log(
                `[${new Date().toISOString()}] CONTROLLER-INFO: Sent controller info to ${clientId}: ${
                  activeController || "none"
                }`,
              );
            }
            break;

          case "heartbeat":
            // Simple heartbeat to keep connection alive - no state tracking
            // Client ID must be set by a previous register message
            break;

          // Controller-kicked notification
          case "controller-kicked":
            {
              if (!clientId) {
                console.error("Client not registered");
                return;
              }

              const kickTargetId = message.target;
              if (!kickTargetId) {
                console.error("Target ID missing in controller-kicked message");
                return;
              }

              // Non-essential log - remove
              // console.log(
              //   `SIGNAL: Controller-kicked message from ${clientId} to ${kickTargetId}`,
              // );

              // Format the kick message
              const kickMessage = {
                type: "controller-kicked",
                newControllerId: message.newControllerId,
                source: clientId,
              };

              // Try direct delivery to the kicked controller
              const kickedControllerSocket = activeConnections.get(
                kickTargetId,
              );
              if (
                kickedControllerSocket &&
                kickedControllerSocket.readyState === WebSocket.OPEN
              ) {
                // Non-essential log - remove
                // console.log(
                //   `SIGNAL: Direct delivery of controller-kicked from ${clientId} to ${kickTargetId}`,
                // );
                kickedControllerSocket.send(JSON.stringify(kickMessage));
                // Non-essential log - remove
                // console.log(
                //   `SIGNAL: Delivered controller-kicked to ${kickTargetId}`,
                // );
              } else {
                // Queue the kick message for later delivery
                // Non-essential log - remove
                // console.log(
                //   `SIGNAL: Target ${kickTargetId} not connected, queuing kick message`,
                // );
                await queueMessage(kv, kickTargetId, kickMessage);
                // Non-essential log - remove
                // console.log(
                //   `SIGNAL: Queued controller-kicked for ${kickTargetId}`,
                // );
              }
            }
            break;

          // Core WebRTC Signaling Messages - pure relay
          case "offer":
          case "answer":
          case "ice-candidate":
            {
              if (!clientId) {
                console.error(`[${new Date().toISOString()}] ERROR: Client not registered for ${message.type} message`);
                return;
              }

              const targetId = message.target;
              if (!targetId) {
                console.error(`[${new Date().toISOString()}] ERROR: Target ID missing in ${message.type} message from ${clientId}`);
                return;
              }

              // Non-essential log - remove
              // console.log(
              //   `[${new Date().toISOString()}] SIGNAL: ${message.type.toUpperCase()} message from ${clientId} to ${targetId}`,
              // );
              
              if (message.type === "offer") {
                // Non-essential log - remove
                // console.log(`[${new Date().toISOString()}] OFFER DETAILS: Client ${clientId} is initiating connection to ${targetId}`);
                // Non-essential log - remove
                // console.log(`[${new Date().toISOString()}] OFFER CONTENT:`, JSON.stringify(message).substring(0, 200) + "...");
              } else if (message.type === "answer") {
                // Non-essential log - remove
                // console.log(`[${new Date().toISOString()}] ANSWER DETAILS: Controller ${clientId} is accepting connection from ${targetId}`);
                // Non-essential log - remove
                // console.log(`[${new Date().toISOString()}] ANSWER CONTENT:`, JSON.stringify(message).substring(0, 200) + "...");
              } else if (message.type === "ice-candidate") {
                // Non-essential log - remove
                // console.log(`[${new Date().toISOString()}] ICE DETAILS: ${clientId} sending candidate to ${targetId} (${message.data ? 'with data' : 'null candidate'})`);
                // Non-essential log - remove
                // console.log(`[${new Date().toISOString()}] ICE CANDIDATE:`, JSON.stringify(message.data || {}).substring(0, 100));
              }

              // Format signal message with source information and handle both data and sdp fields
              let formattedData = message.data || message.sdp;
              
              // Special handling for ICE candidates
              if (message.type === "ice-candidate" && formattedData) {
                // Ensure ICE candidates have required fields
                if (typeof formattedData === 'object' && formattedData.candidate !== undefined) {
                  if (!formattedData.sdpMid && formattedData.sdpMLineIndex === undefined) {
                    // Non-essential log - remove
                    // console.log(`[${new Date().toISOString()}] FIXING ICE CANDIDATE: Adding default sdpMid/sdpMLineIndex`);
                    formattedData = {
                      ...formattedData,
                      sdpMid: formattedData.sdpMid || "0",
                      sdpMLineIndex: formattedData.sdpMLineIndex !== undefined ? formattedData.sdpMLineIndex : 0
                    };
                  }
                }
              }
              
              const signalMessage = {
                type: message.type,
                data: formattedData,
                source: clientId,
              };

              // Try direct delivery if target is connected to this instance
              const targetSocket = activeConnections.get(targetId);
              if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                // Non-essential log - remove
                // console.log(
                //   `[${new Date().toISOString()}] DELIVERY: Direct delivery of ${message.type} from ${clientId} to ${targetId}`,
                // );
                try {
                  // Log full message being sent for debugging
                  // Non-essential log - remove
                  // console.log(`[${new Date().toISOString()}] SENDING: ${message.type} message to ${targetId}, data present: ${!!signalMessage.data}`);
                  
                  targetSocket.send(JSON.stringify(signalMessage));
                  // Non-essential log - remove
                  // console.log(`[${new Date().toISOString()}] SUCCESS: Delivered ${message.type} to ${targetId}`);
                } catch (error) {
                  console.error(`[${new Date().toISOString()}] ERROR: Failed to deliver ${message.type} to ${targetId}: ${error}`);
                }
              } else {
                // Queue message for later delivery
                // Non-essential log - remove
                // console.log(
                //   `[${new Date().toISOString()}] QUEUE: Target ${targetId} not connected (socket: ${targetSocket ? 'exists' : 'null'}, state: ${targetSocket ? targetSocket.readyState : 'N/A'}), queuing message`,
                // );
                try {
                  // Log message being queued for debugging
                  // Non-essential log - remove
                  // console.log(`[${new Date().toISOString()}] QUEUEING: ${message.type} message for ${targetId}, data present: ${!!signalMessage.data}`);
                  
                  await queueMessage(kv, targetId, signalMessage);
                  // Non-essential log - remove
                  // console.log(`[${new Date().toISOString()}] QUEUE: Successfully queued ${message.type} for ${targetId}`);
                } catch (error) {
                  console.error(`[${new Date().toISOString()}] ERROR: Failed to queue ${message.type} for ${targetId}: ${error}`);
                }
              }
            }
            break;

          default:
            // Non-essential log - remove
            // console.log(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    };

    socket.onclose = async () => {
      // Simple connection cleanup - remove from active connections
      if (clientId) {
        activeConnections.delete(clientId);
        // Essential log - track client disconnection
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
