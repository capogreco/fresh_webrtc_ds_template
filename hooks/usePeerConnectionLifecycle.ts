// fresh_webrtc_ds_template/hooks/usePeerConnectionLifecycle.ts

import { useEffect, useCallback, useRef } from "preact/hooks";
import { useSignal, type Signal } from "@preact/signals";

// --------------------------------------------------------------------------------
// Type and Interface Definitions
// --------------------------------------------------------------------------------

export type LoggerFn = (text: string) => void;

export type DataMessageHandlerFn = (
  event: MessageEvent,
  channel: RTCDataChannel,
  prefix?: string,
) => void;

export interface WebSocketSignaling {
  sendSignalMessage: (message: object) => boolean;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface UsePeerConnectionLifecycleOptions {
  clientIdSignal: Signal<string>;
  targetIdSignal: Signal<string | null>;
  webSocketSignaling: WebSocketSignaling;
  onDataMessageHandler: DataMessageHandlerFn;
  addLog: LoggerFn;
  fetchIceServersFn?: () => Promise<IceServerConfig[]>;
}

export interface UsePeerConnectionLifecycleReturn {
  peerConnectionSignal: Signal<RTCPeerConnection | null>;
  reliableControlChannelSignal: Signal<RTCDataChannel | null>;
  streamingUpdatesChannelSignal: Signal<RTCDataChannel | null>;
  webRtcConnectedSignal: Signal<boolean>;
  peerConnectionStateSignal: Signal<RTCPeerConnectionState | null>;
  iceConnectionStateSignal: Signal<RTCIceConnectionState | null>;

  initiateConnection: () => Promise<void>;
  processOffer: (offer: RTCSessionDescriptionInit, fromId: string) => Promise<void>;
  processAnswer: (answer: RTCSessionDescriptionInit, fromId: string) => Promise<void>;
  addRemoteIceCandidate: (candidate: RTCIceCandidateInit | null, fromId: string) => Promise<void>;
  closeConnection: (isUserInitiated?: boolean) => void;
  sendDataOnChannel: (channelLabel: "reliable_control" | "streaming_updates", jsonDataString: string) => boolean;
}

const RELIABLE_CONTROL_CHANNEL_LABEL = "reliable_control";
const STREAMING_UPDATES_CHANNEL_LABEL = "streaming_updates";

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// --------------------------------------------------------------------------------
// Hook Implementation
// --------------------------------------------------------------------------------

export default function usePeerConnectionLifecycle(
  options: UsePeerConnectionLifecycleOptions,
): UsePeerConnectionLifecycleReturn {
  const {
    clientIdSignal,
    targetIdSignal,
    webSocketSignaling,
    onDataMessageHandler,
    addLog,
    fetchIceServersFn,
  } = options;

  const peerConnectionSignal = useSignal<RTCPeerConnection | null>(null);
  const reliableControlChannelSignal = useSignal<RTCDataChannel | null>(null);
  const streamingUpdatesChannelSignal = useSignal<RTCDataChannel | null>(null);
  const webRtcConnectedSignal = useSignal<boolean>(false);
  const peerConnectionStateSignal = useSignal<RTCPeerConnectionState | null>(null);
  const iceConnectionStateSignal = useSignal<RTCIceConnectionState | null>(null);

  const isNegotiatingRef = useRef<boolean>(false);
  const makingOfferRef = useRef<boolean>(false);
  const politeRef = useRef<boolean>(false); // Assume client is polite by default, controller is assertive.
                                          // This logic might need refinement based on who initiates.
                                          // For client-initiated offer, client is assertive initially.
  const queuedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Refs for reconnection and heartbeat logic
  const reconnectionTimerRef = useRef<number | null>(null);
  const reconnectionNeededRef = useRef<boolean>(false);
  const isUserInitiatedCloseRef = useRef<boolean>(false); // Tracks if closeConnection was called due to unmount or explicit user action
  const heartbeatIntervalRef = useRef<number | null>(null);
  const reconnectionAttemptCountRef = useRef<number>(0);
  const MAX_RECONNECTION_ATTEMPTS = 5; // Max auto-reconnection attempts

  const log = useCallback((message: string, level: "info" | "error" | "warn" = "info") => {
    const currentClientId: string = clientIdSignal.value;
    const prefix = "[PCL][" + currentClientId + "]";
    const fullMessage = prefix + " " + message;
    if (level === "error") console.error(fullMessage);
    else if (level === "warn") console.warn(fullMessage);
    else console.log(fullMessage);
    addLog(fullMessage);
  }, [addLog, clientIdSignal]);

  const _fetchIceServers = useCallback(async (): Promise<IceServerConfig[]> => {
    if (fetchIceServersFn) {
      try {
        const servers = await fetchIceServersFn();
        log("Fetched custom ICE servers.");
        return servers;
      } catch (error) {
        log(`Error fetching custom ICE servers: ${error instanceof Error ? error.message : String(error)}. Using defaults.`, "warn");
        return DEFAULT_ICE_SERVERS;
      }
    }
    log("Using default ICE servers.");
    return DEFAULT_ICE_SERVERS;
  }, [fetchIceServersFn, log]);
  const _processQueuedIceCandidates = useCallback(async () => {
    if (!peerConnectionSignal.value || !peerConnectionSignal.value.remoteDescription) {
      return;
    }
    log(`Processing ${queuedIceCandidatesRef.current.length} queued ICE candidates.`);
    while (queuedIceCandidatesRef.current.length > 0) {
      const candidate = queuedIceCandidatesRef.current.shift();
      if (candidate) {
        try {
          // Skip empty candidates
          if (candidate.candidate === "" || candidate.candidate === null) {
            log("Skipping empty queued ICE candidate.");
            continue;
          }
          
          // Fix missing sdpMid or sdpMLineIndex if needed
          if (!candidate.sdpMid && candidate.sdpMLineIndex === undefined) {
            log("Queued ICE candidate missing sdpMid and sdpMLineIndex. Adding default values.", "warn");
            const fixedCandidate = {
              ...candidate,
              sdpMid: "0",
              sdpMLineIndex: 0
            };
            await peerConnectionSignal.value.addIceCandidate(new RTCIceCandidate(fixedCandidate));
          } else {
            await peerConnectionSignal.value.addIceCandidate(new RTCIceCandidate(candidate));
          }
          log("Successfully added queued ICE candidate.");
        } catch (error) {
          log(`Error adding queued ICE candidate: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
      }
    }
  }, [peerConnectionSignal, log]);
  
  const closeConnection = useCallback((isUserInitiated: boolean = true) => {
    log(`Closing WebRTC connection. User initiated: ${isUserInitiated}`);
    console.log(`[PCL][${clientIdSignal.value}] Closing WebRTC connection. User initiated: ${isUserInitiated}`);
    isUserInitiatedCloseRef.current = isUserInitiated; // Set this ref based on the argument
    
    // Clear reconnection timer if any was pending
    if (reconnectionTimerRef.current) {
      clearTimeout(reconnectionTimerRef.current);
      reconnectionTimerRef.current = null;
      console.log(`[PCL][${clientIdSignal.value}] Cleared pending reconnection timer during closeConnection.`);
    }

    // Clear heartbeat interval when connection closes
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
      log("Heartbeat mechanism stopped due to connection closure", "info");
    }
    
    // First update UI state to show disconnected
    webRtcConnectedSignal.value = false;
    peerConnectionStateSignal.value = "closed";
    iceConnectionStateSignal.value = "closed";

    // Now close the data channels
    if (reliableControlChannelSignal.value) {
      try {
        if (reliableControlChannelSignal.value.readyState === "open" || reliableControlChannelSignal.value.readyState === "connecting") {
          // Send a disconnection message if possible
          if (reliableControlChannelSignal.value.readyState === "open") {
            try {
              reliableControlChannelSignal.value.send(JSON.stringify({
                type: "disconnect_notification",
                reason: isUserInitiated ? "user_action" : "connection_lost",
                timestamp: Date.now(),
                clientId: clientIdSignal.value
              }));
              log("Sent disconnect notification before closing channel");
            } catch (e) {
              // Ignore errors when sending disconnect notification
            }
          }
          reliableControlChannelSignal.value.close();
        }
      } catch (err) {
        log(`Error closing reliable control channel: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
      reliableControlChannelSignal.value = null;
    }
    
    if (streamingUpdatesChannelSignal.value) {
      try {
        if (streamingUpdatesChannelSignal.value.readyState === "open" || streamingUpdatesChannelSignal.value.readyState === "connecting") {
          streamingUpdatesChannelSignal.value.close();
        }
      } catch (err) {
        log(`Error closing streaming updates channel: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
      streamingUpdatesChannelSignal.value = null;
    }

    // Finally close the peer connection
    if (peerConnectionSignal.value) {
      try {
        if (peerConnectionSignal.value.signalingState !== "closed") {
          peerConnectionSignal.value.close();
        }
      } catch (err) {
        log(`Error closing peer connection: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
      peerConnectionSignal.value = null;
    }
    
    // Reset all state
    isNegotiatingRef.current = false;
    makingOfferRef.current = false;
    queuedIceCandidatesRef.current = [];

    if (!isUserInitiated) {
      log("WebRTC connection lost or failed non-user initiated.", "warn");
  
      // Set a flag for automatic reconnection instead of calling initiateConnection directly
      // This avoids circular reference between closeConnection and initiateConnection
      if (targetIdSignal.value) {
        reconnectionNeededRef.current = true;
        setTimeout(() => {
          if (reconnectionNeededRef.current && !webRtcConnectedSignal.value && targetIdSignal.value && !isUserInitiatedCloseRef.current) {
            log("Reconnection needed flag set - connection will be reestablished", "info");
            console.log(`[PCL][${clientIdSignal.value}] Reconnection flag will trigger initiateConnection via monitor.`);
            // The monitoring effect will pick this up.
            // No direct call to initiateConnection here.
          } else {
            log("Auto-reconnect not scheduled (no target, or user-initiated close).", "info");
            console.log(`[PCL][${clientIdSignal.value}] Auto-reconnect not scheduled. Target: ${targetIdSignal.value}, User-initiated: ${isUserInitiatedCloseRef.current}`);
          }
        }, 5000); // Wait 5 seconds before setting reconnection flag
      }
    }
  }, [log, peerConnectionSignal, reliableControlChannelSignal, streamingUpdatesChannelSignal, webRtcConnectedSignal, peerConnectionStateSignal, iceConnectionStateSignal, clientIdSignal, targetIdSignal]);


  const _setupDataChannel = useCallback((channel: RTCDataChannel) => {
    log(`Setting up data channel: ${channel.label}, ID: ${channel.id}, Ordered: ${channel.ordered}, MaxRetransmits: ${channel.maxRetransmits}`);
    console.log(`[PCL] Setting up data channel: ${channel.label}, state: ${channel.readyState}`);
    
    if (channel.label === RELIABLE_CONTROL_CHANNEL_LABEL) {
      reliableControlChannelSignal.value = channel;
      // If channel is already open, update connection state immediately
      if (channel.readyState === "open") {
        log("Reliable control channel is already open - updating connection state", "info");
        webRtcConnectedSignal.value = true;
      }
    } else if (channel.label === STREAMING_UPDATES_CHANNEL_LABEL) {
      streamingUpdatesChannelSignal.value = channel;
    } else {
      log(`Received data channel with unknown label: ${channel.label}`, "warn");
      return; // Don't set up handlers for unknown channels
    }

    channel.onopen = () => {
      log(`Data channel "${channel.label}" opened.`);
      console.log(`[PCL][${clientIdSignal.value}] Data channel ONOPEN: "${channel.label}", ID: ${channel.id}, ReadyState: ${channel.readyState}`);
      if (channel.label === RELIABLE_CONTROL_CHANNEL_LABEL) {
        log("Reliable control channel established - connection ready", "info");
        webRtcConnectedSignal.value = true;
        // Notify UI of the connection status change immediately with a separate log
        log("WebRTC connection established successfully", "info");
        console.log(`[PCL][${clientIdSignal.value}] WebRTC connection ESTABLISHED (via reliable channel open)`);
        console.log(`[PCL_DEBUG][${clientIdSignal.value}] RELIABLE_CONTROL_CHANNEL_LABEL (${RELIABLE_CONTROL_CHANNEL_LABEL}) ONOPEN FIRED AND webRtcConnectedSignal SET TO TRUE.`);
        
        // Clear any reconnection timers
        if (reconnectionTimerRef.current) {
          clearTimeout(reconnectionTimerRef.current);
          reconnectionTimerRef.current = null;
          console.log(`[PCL][${clientIdSignal.value}] Cleared reconnection timer as channel is open.`);
        }
        
        // Set up heartbeat interval to keep connection alive
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        const timerId = setInterval(() => {
          if (reliableControlChannelSignal.value?.readyState === "open" && webRtcConnectedSignal.value) {
            const heartbeatMsg = JSON.stringify({
              type: "heartbeat_ping",
              timestamp: Date.now(),
              clientId: clientIdSignal.value
            });
            const success = sendDataOnChannel(RELIABLE_CONTROL_CHANNEL_LABEL, heartbeatMsg);
            if (!success && webRtcConnectedSignal.value) { // sendDataOnChannel logs failures
              console.warn(`[PCL][${clientIdSignal.value}] Heartbeat send failed via sendDataOnChannel.`);
            }
            // else: Successfully sent or channel not open, sendDataOnChannel handles logging/state.
          }
        }, 15000);
        heartbeatIntervalRef.current = timerId; // Deno's setInterval returns number, assignable to number | null
        log("Heartbeat mechanism activated to maintain connection", "info");
        console.log(`[PCL][${clientIdSignal.value}] Heartbeat mechanism activated.`);
        
        // Send a test heartbeat message to ensure the channel is working
        try {
          const heartbeatMsg = JSON.stringify({ 
            type: "connection_established", 
            timestamp: Date.now(), 
            clientId: clientIdSignal.value,
            targetId: targetIdSignal.value,
            readyState: channel.readyState,
            label: channel.label
          });
          
          setTimeout(() => { // Give a tiny delay
            if (channel.readyState === "open") { // Check again before sending
              sendDataOnChannel(RELIABLE_CONTROL_CHANNEL_LABEL, heartbeatMsg);
              // Log is inside sendDataOnChannel or handled by its potential failure path
              console.log(`[PCL][${clientIdSignal.value}] Attempted to send initial connection_established message via sendDataOnChannel.`);
            } else {
              console.warn(`[PCL][${clientIdSignal.value}] Reliable channel not open when trying to send initial message. State: ${channel.readyState}`);
            }
          }, 100);
        } catch (err) { // This catch is for errors in preparing the message, not sending.
          log(`Failed to prepare initial connection_established message: ${err instanceof Error ? err.message : String(err)}`, "warn");
        }
      }
    };

    channel.onclose = (event: Event) => {
      log(`Data channel "${channel.label}" closed.`);
      console.log(`[PCL][${clientIdSignal.value}] Data channel ONCLOSE: "${channel.label}", ID: ${channel.id}. Event:`, event);
      if (channel.label === RELIABLE_CONTROL_CHANNEL_LABEL) {
        log("Reliable control channel closed - connection lost", "warn");
        console.warn(`[PCL][${clientIdSignal.value}] Reliable control channel closed.`);
        
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
          log("Heartbeat mechanism stopped due to channel closure", "info");
          console.log(`[PCL][${clientIdSignal.value}] Heartbeat mechanism stopped.`);
        }
        
        if (webRtcConnectedSignal.value) {
          webRtcConnectedSignal.value = false;
          log("WebRTC connection lost", "warn");
          console.warn(`[PCL][${clientIdSignal.value}] WebRTC connection marked as LOST.`);
          
          if (targetIdSignal.value && !isUserInitiatedCloseRef.current) { // Only auto-reconnect if not user-initiated
            log(`Will attempt to reconnect to ${targetIdSignal.value} in 5 seconds due to unexpected channel close`, "info");
            console.log(`[PCL][${clientIdSignal.value}] Scheduling auto-reconnect.`);
            
            if (reconnectionTimerRef.current) clearTimeout(reconnectionTimerRef.current);
            
            reconnectionTimerRef.current = setTimeout(() => {
              if (!webRtcConnectedSignal.value && targetIdSignal.value) {
                log("Attempting to reconnect after data channel closed", "info");
                console.log(`[PCL][${clientIdSignal.value}] Auto-reconnecting...`);
                isUserInitiatedCloseRef.current = false; // Reset before new attempt
                initiateConnection().catch(err => {
                  log(`Reconnection attempt failed: ${err instanceof Error ? err.message : String(err)}`, "error");
                  console.error(`[PCL][${clientIdSignal.value}] Reconnection attempt failed:`, err);
                });
              }
              reconnectionTimerRef.current = null;
            }, 5000);
          }
        }
        
        // If not planning to reconnect (e.g. user closed, or max retries hit), ensure full cleanup
        if (!reconnectionTimerRef.current && 
            (!targetIdSignal.value || isUserInitiatedCloseRef.current || reconnectionAttemptCountRef.current >= MAX_RECONNECTION_ATTEMPTS) &&
            peerConnectionSignal.value && 
            (peerConnectionSignal.value.connectionState !== "closed" && 
             peerConnectionSignal.value.connectionState !== "disconnected")) {
          log("Reliable channel closed, peer connection still active, and no further reconnects planned - performing full cleanup.", "info");
          console.log(`[PCL][${clientIdSignal.value}] Cleaning up peer connection as reliable channel closed and no further reconnects are planned.`);
          closeConnection(false); 
        }
      }
    };

    channel.onmessage = (event: MessageEvent) => {
      onDataMessageHandler(event, channel, clientIdSignal.value);
    };

    channel.onerror = (event: Event) => {
      const errorEvent = event as RTCErrorEvent;
      log('Data channel \"' + channel.label + '\" error: ' + (errorEvent.error?.message || "Unknown error"), "error");
      console.error(`[PCL][${clientIdSignal.value}] Data channel ONERROR: \"${channel.label}\", ID: ${channel.id}. Error:`, errorEvent.error, "Full event:", event);
      if (channel.label === RELIABLE_CONTROL_CHANNEL_LABEL) {
        log(`Error on reliable control channel. Connection may be compromised. Current state: ${webRtcConnectedSignal.value}`, "error");
        if (webRtcConnectedSignal.value) { 
            webRtcConnectedSignal.value = false; // Mark as disconnected
            // Trigger reconnection logic if it was an unexpected error
            if (!isUserInitiatedCloseRef.current && targetIdSignal.value) {
                reconnectionNeededRef.current = true;
                console.log(`[PCL][${clientIdSignal.value}] Reconnection flag set due to reliable channel error.`);
            }
        }
      }
    };
  }, [log, peerConnectionSignal, reliableControlChannelSignal, streamingUpdatesChannelSignal, webRtcConnectedSignal, onDataMessageHandler, clientIdSignal, targetIdSignal]);

  const _createPeerConnection = useCallback(async (iceServers: IceServerConfig[]): Promise<RTCPeerConnection> => {
    if (peerConnectionSignal.value) {
      log("Existing peer connection found, closing it before creating a new one.");
      closeConnection(false); // Close existing silently
    }
    
    log("Creating new RTCPeerConnection.");
    const configuration: RTCConfiguration = { iceServers };
    const pc = new RTCPeerConnection(configuration);
    peerConnectionSignal.value = pc; // Assign early so event handlers have it

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        if (!targetIdSignal.value) {
          log("Cannot send ICE candidate: targetId is null.", "warn");
          return;
        }
        log(`Sending ICE candidate to ${targetIdSignal.value}`);
        webSocketSignaling.sendSignalMessage({
          type: "ice-candidate",
          target: targetIdSignal.value,
          candidate: event.candidate.toJSON(),
        });
      } else {
        log("ICE candidate gathering complete.");
      }
    };

    pc.oniceconnectionstatechange = () => {
      iceConnectionStateSignal.value = pc.iceConnectionState;
      log(`ICE connection state changed: ${pc.iceConnectionState}`);
      console.log(`[PCL][${clientIdSignal.value}] ICE connection state changed to: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === "checking") {
        // When ICE is checking, we're establishing a connection
        log("ICE connection checking - attempting to establish connection");
      } else if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        // When ICE is connected, make sure our connection state is updated
        log("ICE connection established successfully");
        if (reliableControlChannelSignal.value && 
            reliableControlChannelSignal.value.readyState === "open" && 
            !webRtcConnectedSignal.value) {
          log("Data channel is open but connection state was not updated - fixing", "info");
          webRtcConnectedSignal.value = true;
        }
      } else if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "closed") {
        log(`ICE connection problematic (${pc.iceConnectionState}). Closing WebRTC connection.`, "warn");
        webRtcConnectedSignal.value = false;
        
        // Don't immediately close - wait briefly to see if it recovers
        setTimeout(() => {
          if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "closed") {
            log("ICE connection still problematic after delay - cleaning up", "warn");
            closeConnection(false); // Non-user initiated close
          }
        }, 2000);
      }
    };

    pc.onconnectionstatechange = () => {
      peerConnectionStateSignal.value = pc.connectionState;
      log(`Peer connection state changed: ${pc.connectionState}`);
      console.log(`[PCL][${clientIdSignal.value}] Peer connection state changed to: ${pc.connectionState}`);
      
      if (pc.connectionState === "connecting") {
        log("Peer connection is being established");
      } else if (pc.connectionState === "connected") {
        log("Peer connection established.");
        // Process any candidates that arrived early
        _processQueuedIceCandidates();
        
        // If data channel is already open but connected signal wasn't set
        // (happens sometimes due to event order variations)
        if (reliableControlChannelSignal.value && 
            reliableControlChannelSignal.value.readyState === "open" && 
            !webRtcConnectedSignal.value) {
          log("Peer connection established and reliable channel open, but webRtcConnectedSignal was false - fixing status", "info");
          webRtcConnectedSignal.value = true;
          // Send a heartbeat immediately to confirm connection works
          try {
            const heartbeatMsg = JSON.stringify({ 
              type: "connection_established", 
              timestamp: Date.now(), 
              clientId: clientIdSignal.value,
              message: "Connection established successfully" 
            });
            reliableControlChannelSignal.value.send(heartbeatMsg);
            log("Sent heartbeat on existing reliable channel after connection established");
          } catch (err) {
            log(`Failed to send heartbeat: ${err instanceof Error ? err.message : String(err)}`, "warn");
          }
        }
        
        // Schedule periodic heartbeats to maintain the connection
        setInterval(() => {
          if (reliableControlChannelSignal.value?.readyState === "open" && webRtcConnectedSignal.value) {
            try {
              const pingMsg = JSON.stringify({ 
                type: "heartbeat_ping", 
                timestamp: Date.now(), 
                clientId: clientIdSignal.value 
              });
              reliableControlChannelSignal.value.send(pingMsg);
              // Don't log every heartbeat to avoid spam
            } catch (err) {
              // Only log heartbeat errors if we're still connected
              if (webRtcConnectedSignal.value) {
                log(`Failed to send heartbeat: ${err instanceof Error ? err.message : String(err)}`, "warn");
              }
            }
          }
        }, 10000); // Send heartbeat every 10 seconds
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        log(`Peer connection problematic (${pc.connectionState}). Closing WebRTC connection.`, "warn");
        console.log(`[PCL][${clientIdSignal.value}] Peer connection failed/disconnected/closed: ${pc.connectionState}`);
        
        // Set the connected state to false for the UI
        webRtcConnectedSignal.value = false;
        
        // Give it a brief moment to recover before fully closing
        setTimeout(() => {
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
            log("Connection still problematic after delay, initiating cleanup", "warn");
            closeConnection(false); // Non-user initiated close
          }
        }, 2000);
      }
    };

    pc.ondatachannel = (event: RTCDataChannelEvent) => {
      log(`Remote data channel received: ${event.channel.label}, state: ${event.channel.readyState}`);
      console.log(`[PCL] Remote data channel received: ${event.channel.label}, readyState: ${event.channel.readyState}`);
      // Process the new data channel
      _setupDataChannel(event.channel);
      
      // If this is the reliable control channel and it's already open, update the connection status immediately
      if (event.channel.label === RELIABLE_CONTROL_CHANNEL_LABEL && event.channel.readyState === "open") {
        log("Reliable control channel received and already open - connection ready", "info");
        webRtcConnectedSignal.value = true;
      }
    };

    pc.onnegotiationneeded = () => {
      log("Negotiation needed. Current signaling state: " + pc.signalingState);
      // This event can be complex to handle for "perfect negotiation".
      // For a client that usually initiates offers, or responds to offers,
      // this might indicate a need to re-negotiate if parameters change that require it.
      // Simple politeness check:
      if (isNegotiatingRef.current || makingOfferRef.current || pc.signalingState !== "stable") {
          log("Skipping onnegotiationneeded due to ongoing negotiation or unstable state.", "warn");
          return;
      }
      // If this client is "polite" (e.g., it was the one that received an offer),
      // it might re-initiate an offer here if needed.
      // For now, just logging. In a client-initiates-offer model, this event might be less critical to act upon
      // immediately unless track transceivers are being added/removed dynamically.
    };
    
    return pc;
  }, [log, peerConnectionSignal, closeConnection, targetIdSignal, webSocketSignaling, _setupDataChannel, _processQueuedIceCandidates, iceConnectionStateSignal, peerConnectionStateSignal, webRtcConnectedSignal, reliableControlChannelSignal]);

  const initiateConnection = useCallback(async (): Promise<void> => {
    if (!targetIdSignal.value) {
      log("Cannot initiate connection: no target ID set.", "warn");
      return;
    }
    
    // Track reconnection attempts to avoid infinite loops
    if (reconnectionNeededRef.current) {
      reconnectionAttemptCountRef.current++;
      log(`Reconnection attempt ${reconnectionAttemptCountRef.current}/${MAX_RECONNECTION_ATTEMPTS}`, "info");
      
      if (reconnectionAttemptCountRef.current > MAX_RECONNECTION_ATTEMPTS) {
        log("Maximum reconnection attempts reached - giving up", "warn");
        reconnectionNeededRef.current = false;
        reconnectionAttemptCountRef.current = 0;
        return;
      }
    } else {
      // Reset counter for new connection attempts
      reconnectionAttemptCountRef.current = 0;
    }
  
    // Cancel any pending reconnection timers
    if (reconnectionTimerRef.current) {
      clearTimeout(reconnectionTimerRef.current);
      reconnectionTimerRef.current = null;
    }
  
    // Check if we already have an active peer connection
    if (peerConnectionSignal.value) {
      // If we already have a connection in a good state, don't create a new one
      if (webRtcConnectedSignal.value && 
          reliableControlChannelSignal.value?.readyState === "open" &&
          peerConnectionSignal.value.connectionState === "connected") {
        log("Already have an active connection. Not initiating a new one.", "info");
        console.log(`[PCL][${clientIdSignal.value}] initiateConnection: Already connected. Aborting new initiation.`);
        reconnectionNeededRef.current = false; // Clear any pending reconnection flags
        reconnectionAttemptCountRef.current = 0; // Reset counter
        return;
      }
      
      log("Existing peer connection found, closing it before creating a new one.");
      console.log(`[PCL][${clientIdSignal.value}] initiateConnection: Closing existing PC before creating new one. Current state: ${peerConnectionSignal.value?.connectionState}`);
      closeConnection(false); // Close the existing connection, ensuring it's not marked as user-initiated for reconnection logic.
    }
    
    if (isNegotiatingRef.current) {
      log("Cannot initiate connection: negotiation or offer already in progress.", "warn");
      return;
    }
  
    // This client is initiating, so it's not polite in this exchange.
    // politeRef.current = false; // Or set based on role. Controller is usually assertive.

    log(`Initiating WebRTC connection to ${targetIdSignal.value}`);
    console.log(`[PCL][${clientIdSignal.value}] Initiating WebRTC connection to ${targetIdSignal.value}`);
    
    isUserInitiatedCloseRef.current = false; // Reset this flag on new initiation attempt
    isNegotiatingRef.current = true;
    makingOfferRef.current = true;

    try {
      const iceServers = await _fetchIceServers();
        const pc = await _createPeerConnection(iceServers);

        log("Creating data channels (as offerer).");
        const reliableDc = pc.createDataChannel(RELIABLE_CONTROL_CHANNEL_LABEL, { ordered: true });
        const streamingDc = pc.createDataChannel(STREAMING_UPDATES_CHANNEL_LABEL, { ordered: false, maxRetransmits: 0 });
        _setupDataChannel(reliableDc);
        _setupDataChannel(streamingDc);

        log("Creating SDP offer.");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer); // errors caught by try/catch

      isNegotiatingRef.current = false;
      makingOfferRef.current = false;

      log("Local description set with offer.");

      if (pc.localDescription) { // Ensure localDescription is not null
        webSocketSignaling.sendSignalMessage({
          type: "offer",
          target: targetIdSignal.value,
          data: pc.localDescription.toJSON ? pc.localDescription.toJSON() : pc.localDescription,
        });
        log("Offer sent to signaling server.");
      } else {
        log("Failed to create local description for offer.", "error");
        throw new Error("Local description was null after createOffer/setLocalDescription");
      }

    } catch (error) {
      log(`Error during initiateConnection: ${error instanceof Error ? error.message : String(error)}`, "error");
      closeConnection(false);
    } finally {
      isNegotiatingRef.current = false;
      makingOfferRef.current = false;
    }
  }, [targetIdSignal, log, _fetchIceServers, _createPeerConnection, _setupDataChannel, webSocketSignaling, closeConnection, isNegotiatingRef, makingOfferRef]);

  const processOffer = useCallback(async (offerSdp: RTCSessionDescriptionInit, fromId: string) => {
    if (!offerSdp) {
      log("Cannot process offer: SDP is null.", "warn");
      return;
    }
    if (makingOfferRef.current && !politeRef.current) { 
      // Basic glare handling: if we are making an offer and we are not polite, ignore incoming offer.
      // A more robust solution involves rollback.
      log("Glare detected: Making offer and received an offer simultaneously. Ignoring incoming offer as non-polite peer.", "warn");
      return;
    }
    
    log(`Processing received offer from ${fromId}.`);
    log(`Offer data structure: ${JSON.stringify(offerSdp).substring(0, 100)}...`);
    isNegotiatingRef.current = true;
    
    // Update targetId if the offer comes from a new or different peer (relevant if not pre-set)
    if (targetIdSignal.value !== fromId) {
        log(`Offer from new/different peer ${fromId}, updating targetId.`, "info");
        targetIdSignal.value = fromId;
    }


    try {
      const iceServers = await _fetchIceServers();
      const pc = await _createPeerConnection(iceServers); // Will create or reuse/reset if needed

      log("Setting remote description from offer.");
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      log("Remote description set.");

      log("Creating SDP answer.");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("Local description set with answer.");
      
      if (pc.localDescription){
        webSocketSignaling.sendSignalMessage({
          type: "answer",
          target: fromId,
          sdp: pc.localDescription.toJSON(),
        });
        log("Answer sent to signaling server.");
      } else {
        log("Failed to create local description for answer.", "error");
        throw new Error("Local description was null after createAnswer/setLocalDescription");
      }
      
      await _processQueuedIceCandidates();

    } catch (error) {
      log(`Error processing offer: ${error instanceof Error ? error.message : String(error)}`, "error");
      closeConnection(false);
    } finally {
      isNegotiatingRef.current = false;
    }
  }, [targetIdSignal, log, _fetchIceServers, _createPeerConnection, webSocketSignaling, _processQueuedIceCandidates, closeConnection, isNegotiatingRef, makingOfferRef]);

  const processAnswer = useCallback(async (answerSdp: RTCSessionDescriptionInit, fromId: string) => {
    if (!peerConnectionSignal.value) {
      log("Cannot process answer: no peer connection.", "warn");
      return;
    }
    if (!answerSdp) {
      log("Cannot process answer: SDP is null.", "warn");
      return;
    }
    if (peerConnectionSignal.value.signalingState === "stable") {
      log("Cannot process answer: signaling state is already stable.", "warn");
      return; // Avoids race if answer already processed
    }

    log(`Processing received answer from ${fromId}.`);
    try {
      // Ensure answer has the proper type
      const formattedAnswer = !answerSdp.type ? { type: 'answer', sdp: answerSdp.sdp } : answerSdp;
      log(`Setting remote description with answer. Type: ${formattedAnswer.type}`);
      await peerConnectionSignal.value.setRemoteDescription(new RTCSessionDescription(formattedAnswer));
      log("Remote description set from answer.");
      await _processQueuedIceCandidates();
    } catch (error) {
      log(`Error processing answer: ${error instanceof Error ? error.message : String(error)}`, "error");
      closeConnection(false);
    }
  }, [peerConnectionSignal, log, _processQueuedIceCandidates, closeConnection]);

  const addRemoteIceCandidate = useCallback(async (candidateInfo: RTCIceCandidateInit | null, fromId: string) => {
    if (!peerConnectionSignal.value) {
      log("Cannot add remote ICE candidate: no peer connection.", "warn");
      return;
    }
    
    // Handle null candidate (often used as an "end of candidates" indicator)
    if (!candidateInfo) {
      log("Received null ICE candidate info (end-of-candidates indicator).", "info");
      return;
    }
    
    // Handle empty candidate string (also an "end of candidates" indicator)
    if (candidateInfo.candidate === "" || candidateInfo.candidate === null) {
      log("Received empty ICE candidate (end-of-candidates indicator).", "info");
      return;
    }

    log(`Adding remote ICE candidate from ${fromId}.`);
    try {
      // Queue candidate if remote description is not yet set
      if (!peerConnectionSignal.value.remoteDescription) {
        log("Remote description not set, queuing ICE candidate.");
        queuedIceCandidatesRef.current.push(candidateInfo);
      } else {
        // Fix missing sdpMid or sdpMLineIndex if needed
        if (!candidateInfo.sdpMid && candidateInfo.sdpMLineIndex === undefined) {
          log("ICE candidate missing sdpMid and sdpMLineIndex. Adding default values.", "warn");
          const fixedCandidate = {
            ...candidateInfo,
            sdpMid: "0",
            sdpMLineIndex: 0
          };
          await peerConnectionSignal.value.addIceCandidate(new RTCIceCandidate(fixedCandidate));
        } else {
          await peerConnectionSignal.value.addIceCandidate(new RTCIceCandidate(candidateInfo));
        }
        log("Remote ICE candidate added successfully.");
        
        // Check connection state - adding ICE candidates sometimes completes the connection
        // even if onconnectionstatechange hasn't fired yet
        if (peerConnectionSignal.value.connectionState === "connected" &&
            reliableControlChannelSignal.value &&
            reliableControlChannelSignal.value.readyState === "open" &&
            !webRtcConnectedSignal.value) {
          log("Connection appears established after ICE candidate, but status wasn't updated - fixing", "info");
          webRtcConnectedSignal.value = true;
        }
      }
    } catch (error) {
      // Ignore benign errors like candidate already added or for a different transport
      if (!(error instanceof DOMException && (error.name === 'OperationError' || error.message.includes('transport')))) {
          log(`Error adding remote ICE candidate: ${error instanceof Error ? error.message : String(error)}`, "error");
      } else {
          log(`Ignoring benign error while adding ICE candidate: ${error.message}`, "info");
      }
    }
  }, [peerConnectionSignal, log]);
  
  const sendDataOnChannel = useCallback((channelLabel: "reliable_control" | "streaming_updates", jsonDataString: string): boolean => {
    let channel: RTCDataChannel | null = null;
    if (channelLabel === "reliable_control") {
      channel = reliableControlChannelSignal.value;
    } else if (channelLabel === "streaming_updates") {
      channel = streamingUpdatesChannelSignal.value;
    }

    // Try to extract message type for better logging
    let messageType = "unknown";
    try {
      const data = JSON.parse(jsonDataString);
      messageType = data.type || "unknown";
    } catch (e) {
      // Not JSON or no type field, using default
    }

    // Check if the connection is in a good state
    const peerConnection = peerConnectionSignal.value;
    const connectionActive = peerConnection && 
                             (peerConnection.connectionState === "connected" || peerConnection.connectionState === "connecting") &&
                             (peerConnection.iceConnectionState === "connected" || peerConnection.iceConnectionState === "checking" || peerConnection.iceConnectionState === "completed");
    
    if (!connectionActive && webRtcConnectedSignal.value) {
      log("Peer connection is not in active state but webRtcConnectedSignal is true - fixing status", "warn");
      webRtcConnectedSignal.value = false;
    }

    if (channel && channel.readyState === "open") {
      try {
        channel.send(jsonDataString);
        if (channelLabel === "reliable_control") {
          // Add minimal logging for reliable channel messages to avoid spam
          console.log(`[PCL][${clientIdSignal.value}] Sent ${messageType} message on ${channelLabel}`);
        }
        return true;
      } catch (error) {
        log(`Error sending data on ${channelLabel}: ${error instanceof Error ? error.message : String(error)}`, "error");
        console.error(`[PCL][${clientIdSignal.value}] Error sending ${messageType} on ${channelLabel}:`, error);
        
        if (channelLabel === "reliable_control") {
          // Control channel errors might indicate connection issues
          webRtcConnectedSignal.value = false;
          
          // Set reconnection flag instead of directly calling initiateConnection
          setTimeout(() => {
            if (!webRtcConnectedSignal.value && channel?.readyState !== "open" && targetIdSignal.value) {
              log("Setting reconnection flag after send error", "info");
              closeConnection(false);
              reconnectionNeededRef.current = true;
            }
          }, 2000);
        }
        return false;
      }
    } else {
      log(`Cannot send data: channel ${channelLabel} is not open or does not exist. State: ${channel?.readyState}`, "warn");
      if (channelLabel === "reliable_control" && webRtcConnectedSignal.value) {
        log("Control channel unavailable but connection was marked as active - fixing status", "warn");
        webRtcConnectedSignal.value = false;
        
        // Set reconnection flag if the channel should be available but isn't
        if (connectionActive && targetIdSignal.value) {
          setTimeout(() => {
            if (!webRtcConnectedSignal.value && targetIdSignal.value) {
              log("Setting reconnection flag due to missing channel", "info");
              closeConnection(false);
              reconnectionNeededRef.current = true;
            }
          }, 2000);
        }
      }
      return false;
    }
  }, [reliableControlChannelSignal, streamingUpdatesChannelSignal, log, peerConnectionSignal, webRtcConnectedSignal, clientIdSignal, targetIdSignal, closeConnection, initiateConnection]);


  // Effect to monitor reconnection flag and reinitiate connection when needed
  useEffect(() => {
    const checkConnectionNeeded = () => {
      if (reconnectionNeededRef.current && targetIdSignal.value && !webRtcConnectedSignal.value && !isUserInitiatedCloseRef.current) {
        log("Reconnection needed flag detected - initiating connection...", "info");
        console.log(`[PCL][${clientIdSignal.value}] Monitoring effect: Reconnection flag detected. Attempting to initiate connection.`);
        // Reset flag before attempting. If initiateConnection fails, it might set it again.
        // This also relies on initiateConnection checking reconnectionAttemptCountRef.
        reconnectionNeededRef.current = false;
        initiateConnection().catch(err => {
          log(`Auto-reconnection attempt failed: ${err instanceof Error ? err.message : String(err)}`, "error");
          console.error(`[PCL][${clientIdSignal.value}] Monitoring effect: Auto-reconnection attempt failed:`, err);
          // If it fails, and we haven't exceeded max attempts, the flag might be set again by other logic.
        });
      } else if (reconnectionNeededRef.current && isUserInitiatedCloseRef.current) {
        console.log(`[PCL][${clientIdSignal.value}] Monitoring effect: Reconnection flag is set, but close was user-initiated. Clearing flag.`);
        reconnectionNeededRef.current = false; // Clear if user initiated the close
        reconnectionAttemptCountRef.current = 0; // Reset attempts
      }
    };

    // Check immediately upon dependency change
    checkConnectionNeeded();

    // Set up interval to check periodically as a fallback
    const monitorInterval = setInterval(checkConnectionNeeded, 3000); // Check every 3 seconds

    return () => {
      clearInterval(monitorInterval);
      console.log(`[PCL][${clientIdSignal.value}] Monitoring effect for reconnection cleaned up.`);
    };
  }, [initiateConnection, targetIdSignal, webRtcConnectedSignal, log, clientIdSignal, reconnectionNeededRef, isUserInitiatedCloseRef]);

  // Effect for cleanup on unmount
  useEffect(() => {
    const pc = peerConnectionSignal.value; // Capture current value for cleanup
    return () => {
      log("Unmounting usePeerConnectionLifecycle. Closing connection.");
      
      // Clear heartbeat interval on unmount
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // Check if pc is still the one in the signal, to avoid closing a new connection if re-renders happened.
      // However, simpler to just call the closeConnection which has internal checks.
      isUserInitiatedCloseRef.current = true; // Mark this as a user-initiated close
      closeConnection(true); // User (component unmount) initiated
    };
  }, [closeConnection, peerConnectionSignal]); // isUserInitiatedCloseRef is a ref, not needed in deps


  return {
    peerConnectionSignal,
    reliableControlChannelSignal,
    streamingUpdatesChannelSignal,
    webRtcConnectedSignal,
    peerConnectionStateSignal,
    iceConnectionStateSignal,
    initiateConnection,
    processOffer,
    processAnswer,
    addRemoteIceCandidate,
    closeConnection,
    sendDataOnChannel,
  };
}