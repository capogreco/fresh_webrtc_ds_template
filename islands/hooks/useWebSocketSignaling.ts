import { Signal, useSignal } from "@preact/signals";
import { useCallback, useEffect } from "preact/hooks";
import { 
  SignalingMessage,
  OfferMessage, 
  AnswerMessage, 
  IceCandidateMessage 
} from "./useWebRTCConnection.ts";

// Types for messages
export interface WebSocketMessage {
  type: string;
  target?: string;
  data?: unknown;
  id?: string;
  source?: string;
  [key: string]: unknown; // Allow other properties
}

export interface UseWebSocketSignalingProps {
  localId?: Signal<string>; // The ID to register with the signaling server (new name)
  controllerId?: Signal<string>; // Legacy support for old parameter name
  addLog: (logText: string) => void; // Callback to log messages in the parent component
  onSignalingMessage?: (message: SignalingMessage) => void; // General handler for all WebRTC signaling messages
  onOfferReceived?: (message: { source: string; data: RTCSessionDescriptionInit; type: "offer" }) => void; // Legacy callback
  onAnswerReceived?: (message: { source: string; data: RTCSessionDescriptionInit; type: "answer" }) => void; // Legacy callback
  onIceCandidateReceived?: (message: { source: string; data: RTCIceCandidateInit; type: "ice-candidate" }) => void; // Legacy callback
  onControllerKicked?: (newControllerId: string) => void;
  onClientDisconnected?: (clientId: string) => void;
  onServerError?: (errorMessage: string, details?: string) => void;
  // Add other specific message handlers as needed
}

export interface UseWebSocketSignalingReturn {
  isConnected: Signal<boolean>; // Signal indicating WebSocket connection status
  sendMessage: (message: WebSocketMessage) => void; // Function to send a message via WebSocket
  connect: () => Promise<void>; // Function to initiate WebSocket connection
  disconnect: () => void; // Function to close WebSocket connection
}

export function useWebSocketSignaling({
  localId,
  controllerId,
  addLog,
  onSignalingMessage,
  onOfferReceived,
  onAnswerReceived,
  onIceCandidateReceived,
  onControllerKicked,
  onClientDisconnected,
  onServerError,
}: UseWebSocketSignalingProps): UseWebSocketSignalingReturn {
  // Handle backward compatibility - use localId if provided, otherwise controllerId
  const effectiveId = localId || controllerId || useSignal("");
    
  const socket = useSignal<WebSocket | null>(null);
  const isConnected = useSignal<boolean>(false);
  const heartbeatInterval = useSignal<number | null>(null);
  const wsUrl = useSignal<string>(""); // To store the WebSocket URL for logging on disconnect

  const connect = useCallback((): Promise<void> => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      addLog("[WebSocketHook] WebSocket is already connected.");
      return Promise.resolve();
    }

    // Prevent connection if effectiveId is not set
    if (effectiveId.value === "") {
      const errorMsg =
        `[WebSocketHook] PREVENTING CONNECTION: Invalid or missing ID ('${effectiveId.value}'). Cannot connect to WebSocket.`;
      addLog(errorMsg);
      console.error(errorMsg);
      // Immediately reject the promise and do not proceed with WebSocket creation
      return Promise.reject(
        new Error("Invalid ID for WebSocket connection."),
      );
    }

    return new Promise<void>((resolve, reject) => {
      // deno-lint-ignore no-window
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // deno-lint-ignore no-window
      const calculatedWsUrl = `${protocol}//${window.location.host}/api/signal`;
      wsUrl.value = calculatedWsUrl; // Store for later use (e.g. logging)
      addLog(
        `[WebSocketHook] Attempting to connect to WebSocket: ${calculatedWsUrl} with ID: ${effectiveId.value}`,
      );
      const ws = new WebSocket(calculatedWsUrl);

      ws.onopen = () => {
        socket.value = ws;
        isConnected.value = true;
        addLog(
          `[WebSocketHook] Signaling server connected (WebSocket opened to ${calculatedWsUrl}). Registering with ID: ${
            effectiveId.value || "undefined!"
          }`,
        );

        try {
          if (effectiveId.value === "") {
              const errorMsg =
                `[WebSocketHook] [CRITICAL] Registration aborted: Invalid or missing ID ('${effectiveId.value}') at the time of onopen. Closing WebSocket.`;
              addLog(errorMsg);
              console.error(errorMsg);
              ws.close(1008, "Invalid ID for registration."); // 1008: Policy Violation
              reject(
                new Error("Invalid ID for registration at onopen."),
              ); // Reject the connect promise
              return; // Do not proceed to send
          }

          ws.send(JSON.stringify({
              type: "register",
              id: effectiveId.value,
            }));
            addLog(
              `[WebSocketHook] Sent register message with ID: ${effectiveId.value}`,
            );

          if (heartbeatInterval.value !== null) {
            clearInterval(heartbeatInterval.value);
          }
          addLog("[WebSocketHook] Starting WebSocket heartbeat interval.");
          heartbeatInterval.value = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "heartbeat" }));
            } else {
              addLog(
                "[WebSocketHook] Heartbeat: WebSocket not open, skipping send.",
              );
            }
          }, 30000) as unknown as number; // Interval in ms
          resolve();
        } catch (sendError) {
          const error = sendError as Error;
          console.error(
            `[WebSocketHook] Error sending register message to ${calculatedWsUrl}:`,
            error,
          );
          addLog(
            `[WebSocketHook] Error during registration send: ${error.message}`,
          );
          reject(error); // Reject the promise if registration send fails
        }
      };

      ws.onerror = (event) => {
        console.error("[WebSocketHook] WebSocket error event:", event);
        addLog(`[WebSocketHook] WebSocket error. Check console for details.`);
        isConnected.value = false;
        if (socket.value === ws) { // Clear only if it's the current socket
          socket.value = null;
        }
        if (heartbeatInterval.value !== null) {
          clearInterval(heartbeatInterval.value);
          heartbeatInterval.value = null;
          addLog(
            "[WebSocketHook] Cleared heartbeat interval due to WebSocket error.",
          );
        }
        reject(new Error("WebSocket connection error")); // Reject promise on error
      };

      ws.onclose = (event) => {
        addLog(
          `[WebSocketHook] WebSocket disconnected from ${wsUrl.value}. Code: ${event.code}, Reason: '${
            event.reason || "N/A"
          }', Clean: ${event.wasClean}`,
        );
        isConnected.value = false;
        if (socket.value === ws) { // Clear only if it's the current socket
          socket.value = null;
        }
        if (heartbeatInterval.value !== null) {
          clearInterval(heartbeatInterval.value);
          heartbeatInterval.value = null;
          addLog(
            "[WebSocketHook] Cleared heartbeat interval due to WebSocket close.",
          );
        }
        // Note: This promise (from connect()) might have already resolved (onopen) or rejected (onerror).
        // A close event doesn't re-reject a resolved/rejected promise.
        // Consider if specific logic is needed if close happens before open/error.
      };

      ws.onmessage = (event) => {
        try {
          const messageData = event.data;
          if (typeof messageData !== "string") {
            console.warn(
              "[WebSocketHook] Received non-string WebSocket message:",
              messageData,
            );
            addLog("[WebSocketHook] Received non-string WebSocket message.");
            return;
          }
          const parsedMessage = JSON.parse(messageData) as WebSocketMessage;

          // For debugging:
          // addLog(`[WebSocketHook] Raw message received: ${JSON.stringify(parsedMessage)}`);

          switch (parsedMessage.type) {
            case "controller-kicked":
              addLog(
                `[WebSocketHook] Controller kicked. New controller: ${parsedMessage.newControllerId}`,
              );
              if (onControllerKicked) {
                onControllerKicked(parsedMessage.newControllerId as string);
              }
              break;
            case "offer":
            case "answer":
            case "ice-candidate":
              const messageType = parsedMessage.type;
              addLog(
                `[WebSocketHook] Received ${messageType} from: ${parsedMessage.source}`,
              );
              
              // Forward to onSignalingMessage handler if provided
              if (onSignalingMessage) {
                // Use the new handler if available
                onSignalingMessage(parsedMessage as SignalingMessage);
              }
              // Also use legacy handlers if provided (for backward compatibility)
              else if (parsedMessage.type === "offer" && onOfferReceived) {
                onOfferReceived(parsedMessage as { source: string; data: RTCSessionDescriptionInit; type: "offer" });
              } else if (parsedMessage.type === "answer" && onAnswerReceived) {
                onAnswerReceived(parsedMessage as { source: string; data: RTCSessionDescriptionInit; type: "answer" });
              } else if (parsedMessage.type === "ice-candidate" && onIceCandidateReceived) {
                onIceCandidateReceived(parsedMessage as { source: string; data: RTCIceCandidateInit; type: "ice-candidate" });
              }
              break;
            case "client-disconnected":
              addLog(
                `[WebSocketHook] Client ${parsedMessage.clientId} reported disconnection.`,
              );
              if (onClientDisconnected) {
                onClientDisconnected(parsedMessage.clientId as string);
              }
              break;
            case "error": // Server-originated error messages
              console.error(
                "[WebSocketHook] Received error message from server:",
                parsedMessage.message,
                parsedMessage.details || "",
              );
              addLog(
                `[WebSocketHook] Server error: ${parsedMessage.message} ${
                  parsedMessage.details || ""
                }`,
              );
              if (onServerError) {
                onServerError(
                  parsedMessage.message as string,
                  parsedMessage.details as string | undefined,
                );
              }
              break;
            default:
              addLog(
                `[WebSocketHook] Received unhandled WebSocket message type: ${parsedMessage.type}`,
              );
              console.log(
                "[WebSocketHook] Received unhandled WebSocket message:",
                parsedMessage,
              );
          }
        } catch (err) {
          const error = err as Error;
          console.error(
            "[WebSocketHook] Error processing WebSocket message:",
            error,
            "Raw data:",
            event.data,
          );
          addLog(
            `[WebSocketHook] Error processing message: ${error.message}. Data: ${event.data}`,
          );
        }
      };
    });
  }, [
    effectiveId,
    addLog,
    socket,
    heartbeatInterval,
    wsUrl,
    onSignalingMessage,
    onOfferReceived,
    onAnswerReceived,
    onIceCandidateReceived,
    onControllerKicked,
    onClientDisconnected,
    onServerError,
  ]); // Dependencies for useCallback

  const disconnect = useCallback(() => {
    if (heartbeatInterval.value !== null) {
      clearInterval(heartbeatInterval.value);
      heartbeatInterval.value = null;
      addLog(
        "[WebSocketHook] Cleared heartbeat interval on manual disconnect.",
      );
    }
    if (socket.value) {
      addLog(
        `[WebSocketHook] Manually closing WebSocket connection to ${wsUrl.value}.`,
      );
      socket.value.close(1000, "Controller initiated disconnect"); // 1000: Normal Closure
      // onclose handler will set socket.value to null and isConnected.value to false
    } else {
      addLog(
        "[WebSocketHook] Disconnect called but no active WebSocket connection.",
      );
    }
  }, [socket, heartbeatInterval, addLog, wsUrl]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      try {
        socket.value.send(JSON.stringify(message));
        // addLog(`[WebSocketHook] Sent message: ${JSON.stringify(message)}`); // Optional: can be very verbose
      } catch (error) {
        const e = error as Error;
        console.error("[WebSocketHook] Error sending message:", e);
        addLog(`[WebSocketHook] Error sending message: ${e.message}`);
      }
    } else {
      addLog(
        "[WebSocketHook] WebSocket not connected or not open. Message not sent.",
      );
      console.warn(
        "[WebSocketHook] WebSocket not connected/open. Message not sent:",
        message,
      );
    }
  }, [socket, addLog]); // Dependencies for useCallback

  // Effect for automatic cleanup when the component using the hook unmounts
  useEffect(() => {
    return () => {
      addLog("[WebSocketHook] Unmounting. Cleaning up WebSocket.");
      disconnect();
    };
  }, [disconnect]); // Dependency on disconnect (which is stable due to useCallback)

  return {
    isConnected,
    sendMessage,
    connect,
    disconnect,
  };
}
