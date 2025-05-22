import { Signal, useSignal } from "@preact/signals";
import { useCallback, useEffect, useRef } from "preact/hooks";
import {
  AnswerMessage,
  IceCandidateMessage,
  OfferMessage,
  SignalingMessage,
  BaseSignalMessage,
} from "../../lib/types/signalingMessages.ts";

// Constants for reconnection limits
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 3000;

// Completely disable WebSocket debugging
const DEBUG_WS = false; 


// New Callback Type Definitions
export type OnOpenFn = (event: Event) => void;
export type OnCloseFn = (event: CloseEvent, details: { wasClean: boolean; code: number; reason: string; isUserInitiated?: boolean }) => void;
export type OnErrorFn = (event: Event) => void;

export type OnOfferReceivedFn = (message: OfferMessage) => void;
export type OnAnswerReceivedFn = (message: AnswerMessage) => void;
export type OnIceCandidateReceivedFn = (message: IceCandidateMessage) => void;
// For other messages not covered by specific handlers, we can have a more general one
export type OnGenericMessageFn = (message: BaseSignalMessage & { data?: unknown; [key: string]: unknown }) => void;


// Updated Props Interface
export interface UseWebSocketSignalingProps {
  localId: Signal<string>; // Use this as the primary client identifier

  // Lifecycle Callbacks
  onOpen?: OnOpenFn;
  onClose?: OnCloseFn;
  onError?: OnErrorFn;

  // Specific Message Handler Callbacks
  onOfferReceived?: OnOfferReceivedFn;
  onAnswerReceived?: OnAnswerReceivedFn;
  onIceCandidateReceived?: OnIceCandidateReceivedFn;
  
  // Other existing specific handlers (can be refined if needed)
  onControllerKicked?: (newControllerId: string, reason?: string) => void; // Added reason based on common patterns
  onClientDisconnected?: (clientId: string) => void;
  onServerError?: (errorMessage: string, details?: string) => void;
  
  // A general message handler for types not specifically covered above,
  // or for messages that don't fit the Offer/Answer/ICE structure.
  onGenericMessage?: OnGenericMessageFn; 

  // --- Legacy/Review ---
  // controllerId?: Signal<string>; // REVIEW: Is this still needed if localId is primary?
  // The old onSignalingMessage, onOfferReceived (legacy), onAnswerReceived (legacy), onIceCandidateReceived (legacy)
  // are intentionally removed as they are replaced by the new specific and generic handlers.
}

export interface UseWebSocketSignalingReturn {
  isConnectedSignal: Signal<boolean>; // Renamed
  isController: Signal<boolean>; // Whether this instance is a controller
  sendMessage: (message: BaseSignalMessage & { data?: unknown; target?: string; [key: string]: unknown }) => boolean; // Returns boolean, uses a broader message type
  connect: () => Promise<void>; // Function to initiate WebSocket connection
  disconnect: (isUserInitiated?: boolean) => void; // Added isUserInitiated
}

export function useWebSocketSignaling({
  localId,
  // Legacy controllerId is removed from props, localId is now mandatory
  onOpen,
  onClose,
  onError,
  onOfferReceived, // Note: These are the new Fn types
  onAnswerReceived,
  onIceCandidateReceived,
  onControllerKicked,
  onClientDisconnected,
  onServerError,
  onGenericMessage, // New general message handler
}: UseWebSocketSignalingProps): UseWebSocketSignalingReturn {
  // Create a signal for the effective ID - initialized from localId
  const effectiveId = useSignal<string>(localId.value || ""); // Use empty string as fallback

  const socket = useSignal<WebSocket | null>(null);
  const isConnectedSignal = useSignal<boolean>(false);
  const heartbeatInterval = useSignal<number | null>(null);
  const wsUrl = useSignal<string>(""); // To store the WebSocket URL for logging on disconnect
  const isController = useSignal<boolean>(false); // Whether this instance is a controller
  
  // References for reconnection logic
  const reconnectAttemptsRef = useRef<number>(0);
  const isReconnectingRef = useRef<boolean>(false);
  const maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS; // From constant defined at top
  
  // State for robust reconnection logic
  const intentionallyDisconnectedSocketRef = useRef(false);
  const autoConnectAttempted = useSignal(false);

  // Effect to keep effectiveId in sync with localId
  useEffect(() => {
    if (localId.value !== effectiveId.value) {
      effectiveId.value = localId.value || "";
    }
  }, [localId.value, effectiveId]);

  const connect = useCallback((): Promise<void> => {
    const log = (msg: string) => null; // All WebSocket debug logs disabled
    log(`[WebSocketHook] connect() called. Current socket: ${socket.value ? "exists" : "null"}.`);
    
    // If already connected or connecting, don't create a new connection
    if (socket.value && 
        (socket.value.readyState === WebSocket.OPEN || 
         socket.value.readyState === WebSocket.CONNECTING)) {
      log("[WebSocketHook] Already connected or connecting. Ignoring connect() call.");
      return Promise.resolve(); // Resolve immediately if already connected or connecting
    }
    
    // If already reconnecting, don't try again
    if (isReconnectingRef.current) {
      log("[WebSocketHook] Reconnection already in progress. Ignoring connect() call.");
      return Promise.resolve();
    }
    
    // Set reconnecting flag
    isReconnectingRef.current = true;

    // Prevent connection if effectiveId is not set
      // Always update effectiveId with the latest value from localId
      effectiveId.value = localId.value || "";
    
      if (effectiveId.value === "") {
        const errorMsg =
          `[WebSocketHook] PREVENTING CONNECTION: Invalid or missing ID ('${effectiveId.value}'). Cannot connect to WebSocket.`;
        console.warn(errorMsg); // Changed to console.warn as it's a recoverable issue by setting ID
        // Immediately reject the promise and do not proceed with WebSocket creation
        isReconnectingRef.current = false; // Reset flag since we're not connecting
        return Promise.reject(
          new Error("Invalid ID for WebSocket connection."),
        );
      }
  
    // Check if we've exceeded reconnection attempts
    if (reconnectAttemptsRef.current >= maxReconnectAttempts && autoConnectAttempted.value) {
      console.warn(`[WebSocketHook] Maximum reconnection attempts (${maxReconnectAttempts}) reached. Not attempting to reconnect.`);
      isReconnectingRef.current = false;
      return Promise.reject(new Error("Maximum reconnection attempts reached"));
    }
  
    // Increment reconnect attempts if this is an automatic reconnect
    if (autoConnectAttempted.value) {
      reconnectAttemptsRef.current++;
      // Reconnection attempt
    }

    return new Promise<void>((resolve, reject) => {
      // deno-lint-ignore no-window
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // deno-lint-ignore no-window
      const calculatedWsUrl = `${protocol}//${window.location.host}/api/signal`;
      wsUrl.value = calculatedWsUrl; // Store for later use (e.g. logging)
      // Attempting to connect to WebSocket
      
      let ws: WebSocket;
      try {
        ws = new WebSocket(calculatedWsUrl);
      } catch (error) {
        console.error(`[WebSocketHook] Error creating WebSocket: ${error}`);
        isReconnectingRef.current = false; // Reset reconnecting flag on error
        reject(error);
        return;
      }

      ws.onopen = (event) => {
        socket.value = ws;
        isConnectedSignal.value = true;
        // Non-essential log: WebSocket connected to server
      
        onOpen?.(event); // Call the new onOpen callback

        // Reset reconnection flags on successful connection
        // Non-essential log: Resetting flags
        autoConnectAttempted.value = false;
        intentionallyDisconnectedSocketRef.current = false;
        reconnectAttemptsRef.current = 0; // Reset counter on successful connection
        isReconnectingRef.current = false; // No longer reconnecting

        try {
          // Double-check effectiveId one more time
          effectiveId.value = localId.value || "";
          
          if (effectiveId.value === "") {
            const errorMsg =
              `[WebSocketHook] [CRITICAL] Registration aborted: Invalid or missing ID ('${effectiveId.value}') at the time of onopen. Closing WebSocket.`;
            console.error(errorMsg);
            ws.close(1008, "Invalid ID for registration."); // 1008: Policy Violation
            reject(
              new Error("Invalid ID for registration at onopen."),
            ); // Reject the connect promise
            return; // Do not proceed to send
          }

          ws.send(JSON.stringify({
            type: "register",
            role: "client", // Hard-coded for now, use isController.value when implemented
            id: effectiveId.value,
          }));
          // Non-essential log: Register message sent

          if (heartbeatInterval.value !== null) {
            clearInterval(heartbeatInterval.value);
          }
          // Starting heartbeat interval
          heartbeatInterval.value = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "heartbeat" }));
            } else {
              // Non-essential log: Skipping heartbeat due to closed socket
            }
          }, 30000) as unknown as number; // Interval in ms
          resolve();
        } catch (sendError) {
          const error = sendError as Error;
          console.error(
            `[WebSocketHook] Error sending register message to ${calculatedWsUrl}:`,
            error,
          );
          console.error(
            `[WebSocketHook] Error during registration send: ${error.message}`
          );
          reject(error); // Reject the promise if registration send fails
        }
      };

      ws.onerror = (event) => {
        const errorMessage = event instanceof ErrorEvent ? event.message : "Unknown WebSocket error";
        console.warn(`[WebSocketHook] WebSocket error: ${errorMessage}. intentional: ${intentionallyDisconnectedSocketRef.current}, autoAttempt: ${autoConnectAttempted.value}`);
        
        onError?.(event); // Call the new onError callback
        
        // If the socket is still in a state where onclose might not fire reliably (e.g., error before open),
        // or to ensure consistent state handling through onclose:
        if (ws && ws.readyState !== WebSocket.CLOSED) {
          // Non-essential log: Explicitly closing socket after error
          try {
            ws.close(); // This will trigger the ws.onclose handler
          } catch (closeError) {
            console.warn(`[WebSocketHook] Error closing WebSocket: ${closeError}`);
          }
        }
        
        // Only reject if this is the initial connection attempt, not a reconnection
        if (!autoConnectAttempted.value) {
          reject(new Error("WebSocket connection error")); 
        }
      };

      ws.onclose = (event) => {
        // Non-essential log: WebSocket closed with details
        // console.log(
        //  `[WebSocketHook] WebSocket disconnected from ${wsUrl.value}. Code: ${event.code}, Reason: \'${event.reason || "N/A"}\', Clean: ${event.wasClean}. intentional: ${intentionallyDisconnectedSocketRef.current}, autoAttempt: ${autoConnectAttempted.value}`
        // );
        const wasUserInitiated = intentionallyDisconnectedSocketRef.current;
        isConnectedSignal.value = false; // This was already updated in a previous edit
        
        // Reset reconnecting flag
        isReconnectingRef.current = false;
        
        // if (socket.value === ws) { // This logic is fine, no change needed based on this specific old_text block
        // socket.value = null;
        // }
        if (heartbeatInterval.value !== null) {
          clearInterval(heartbeatInterval.value);
          heartbeatInterval.value = null;
          // Non-essential log: Cleared heartbeat interval
        }
        
        onClose?.(event, { 
          wasClean: event.wasClean, 
          code: event.code, 
          reason: event.reason, 
          isUserInitiated: wasUserInitiated 
        });


        // Note: This promise (from connect()) might have already resolved (onopen) or rejected (onerror).
        // A close event doesn't re-reject a resolved/rejected promise.

        if (wasUserInitiated) { // Use the captured value
          // Non-essential log: Intentional disconnect, no reconnect needed
          intentionallyDisconnectedSocketRef.current = false; 
        } else if (autoConnectAttempted.value) {
          // Non-essential log: Auto-reconnect already in progress, no action needed
          // Potentially set autoConnectAttempted.value = false here if this marks the end of a failed attempt cycle,
          // to allow a *new* trigger (e.g. manual, or a different event) to try again.
          // For now, let's assume onopen is the only place it's reset to false.
        } else {
          // Keep important reconnection log
          console.log(`[WebSocketHook] Unexpected close. Scheduling reconnect. Setting autoAttempt=true.`);
          autoConnectAttempted.value = true; 
          setTimeout(() => {
            // Non-essential log: Calling connect from setTimeout after disconnect
            connect().catch(err => { // Call the hook's own connect method
              console.warn("[WebSocketHook] Reconnect attempt from onclose failed to initiate:", err);
              // If connect() itself rejects (e.g. bad ID), we might need to reset autoConnectAttempted
              // to allow another trigger, or implement exponential backoff.
              // For now, if connect() rejects, autoConnectAttempted remains true until a successful onopen.
            }); 
          }, 3000 + Math.floor(Math.random() * 2000)); // Retry with jitter
        }
      };

      ws.onmessage = (event) => {
        try {
          const messageData = event.data;
          if (typeof messageData !== "string") {
            console.warn(
              "[WebSocketHook] Received non-string WebSocket message:",
              messageData,
            );
            console.warn("[WebSocketHook] Received non-string WebSocket message.");
            return;
          }
          // Ensure parsedMessage has a base type that includes 'type' and 'source' for logging,
          // and can be cast to more specific types.
          const parsedMessage = JSON.parse(messageData) as BaseSignalMessage & { data?: unknown; [key: string]: unknown };

          // For debugging:
          // console.log(`[WebSocketHook] Raw message received: ${JSON.stringify(parsedMessage)}`);

          switch (parsedMessage.type) {
            case "controller-kicked":
              // Keep important controller status log
              console.log(
                `[WebSocketHook] Controller kicked. New controller: ${parsedMessage.newControllerId}`
              );
              if (onControllerKicked) {
                onControllerKicked(parsedMessage.newControllerId as string);
              }
              break;
            case "offer":
              // Non-essential log: Received WebRTC offer from client
              onOfferReceived?.(parsedMessage as OfferMessage);
              break;
            case "answer":
              // Non-essential log: Received WebRTC answer from client
              onAnswerReceived?.(parsedMessage as AnswerMessage);
              break;
            case "ice-candidate":
              // Non-essential log: Received ICE candidate from client
              onIceCandidateReceived?.(parsedMessage as IceCandidateMessage);
              break;
            case "client-disconnected":
              // Keep important client status log
              console.log(
                `[WebSocketHook] Client ${parsedMessage.clientId} reported disconnection.`
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
              console.error(
                `[WebSocketHook] Server error: ${parsedMessage.message} ${
                  parsedMessage.details || ""
                }`
              );
              if (onServerError) {
                onServerError(
                  parsedMessage.message as string,
                  parsedMessage.details as string | undefined,
                );
              }
              break;
            default:
              // Attempt to call the generic message handler
              if (onGenericMessage) {
                onGenericMessage(parsedMessage); // parsedMessage is already BaseSignalMessage & { data?: unknown; [key: string]: unknown }
              } else {
                // Log if no generic handler is provided and the message type wasn't specifically handled
                console.warn(
                  `[WebSocketHook] Received unhandled WebSocket message type: '${parsedMessage.type || "unknown"}', no onGenericMessage handler provided.`
                );
                // Non-essential log: Unhandled message details
                // console.log(
                //   "[WebSocketHook] Full unhandled WebSocket message:",
                //   parsedMessage,
                // );
              }
              break;
          }
        } catch (err) {
          const error = err as Error;
          console.error(
            "[WebSocketHook] Error processing WebSocket message:",
            error,
            "Raw data:",
            event.data,
          );
          console.error(
            `[WebSocketHook] Error processing message: ${error.message}. Data: ${event.data}`
          );
        }
      };
    });
  }, [
    effectiveId,
    socket,
    isConnectedSignal, // Added as it's used in connect's logic implicitly via isConnectedSignal.value
    heartbeatInterval,
    wsUrl,
    onOpen, // New callback
    onClose, // New callback
    onError, // New callback
    onOfferReceived, // New specific message handler
    onAnswerReceived, // New specific message handler
    onIceCandidateReceived, // New specific message handler
    onGenericMessage, // New generic message handler
    onControllerKicked,
    onClientDisconnected,
    onServerError,
    intentionallyDisconnectedSocketRef,
    autoConnectAttempted,
  ]); // Dependencies for useCallback

  const disconnect = useCallback((isUserInitiated?: boolean) => {
    // Non-essential log: Disconnect method called
    // console.log(`[WebSocketHook] disconnect(${isUserInitiated !== undefined ? `isUserInitiated: ${isUserInitiated}` : ''}) called.`);
    // If isUserInitiated is true, or if it's undefined (meaning it's a general disconnect call, assume user intent or important programmatic)
    // If isUserInitiated is explicitly false (e.g. from unmount cleanup), we might not want to set this,
    // but current onClose logic relies on this ref to determine if reconnect should be suppressed.
    // For now, any call to disconnect() implies an intentional stop that should prevent auto-reconnect.
    intentionallyDisconnectedSocketRef.current = true; 
    
    if (heartbeatInterval.value !== null) {
      clearInterval(heartbeatInterval.value);
      heartbeatInterval.value = null;
      // Non-essential log: Heartbeat cleared
      // console.log(
      //   "[WebSocketHook] Cleared heartbeat interval on manual disconnect."
      // );
    }
    if (socket.value) {
      // Non-essential log: Manual WebSocket close
      // console.log(
      //   `[WebSocketHook] Manually closing WebSocket connection to ${wsUrl.value}.`
      // );
      socket.value.close(1000, "User initiated disconnect"); // 1000: Normal Closure
      // onclose handler will set socket.value to null and isConnectedSignal.value to false
    } else {
      console.warn(
        "[WebSocketHook] Disconnect called but no active WebSocket connection."
      );
    }
  }, [socket, heartbeatInterval, wsUrl, intentionallyDisconnectedSocketRef]);

  const sendMessage = useCallback((message: BaseSignalMessage & { data?: unknown; target?: string; [key: string]: unknown }): boolean => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      try {
        socket.value.send(JSON.stringify(message));
        // console.log(`[WebSocketHook] Sent message: ${JSON.stringify(message)}`); // Optional: for debugging
        return true; // Send was attempted
      } catch (error) {
        const e = error as Error;
        console.error("[WebSocketHook] Error sending message:", e);
        console.error(`[WebSocketHook] Error sending message: ${e.message}`);
        return false; // Send attempted but failed
      }
    } else {
      console.warn(
        "[WebSocketHook] WebSocket not connected or not open. Message not sent."
      );
      console.warn(
        "[WebSocketHook] WebSocket not connected/open. Message not sent:",
        message,
      );
      return false; // Send not attempted
    }
  }, [socket]);

  // Effect for automatic cleanup when the component using the hook unmounts
  useEffect(() => {
    return () => {
      // Non-essential log: Component unmounting
      // console.log("[WebSocketHook] Unmounting. Cleaning up WebSocket.");
      disconnect(false); // Indicate this is not a direct user action, but cleanup
    };
  }, [disconnect]); // Dependency on disconnect (which is stable due to useCallback)

  return {
    isConnectedSignal,
    isController,
    sendMessage,
    connect,
    disconnect,
  };
}

export default useWebSocketSignaling;
