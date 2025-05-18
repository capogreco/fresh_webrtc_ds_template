import { Signal, useSignal, computed } from "@preact/signals";
import { useCallback, useEffect, useRef } from "preact/hooks";
import { fetchIceServers } from "../../lib/webrtc.ts";

// Message types for signaling
export interface BaseSignalMessage {
  source: string;
  target?: string;
  type: string;
}

export interface OfferMessage extends BaseSignalMessage {
  type: "offer";
  data: RTCSessionDescriptionInit;
}

export interface AnswerMessage extends BaseSignalMessage {
  type: "answer";
  data: RTCSessionDescriptionInit;
}

export interface IceCandidateMessage extends BaseSignalMessage {
  type: "ice-candidate";
  data: RTCIceCandidateInit | null;
}

export type SignalingMessage = OfferMessage | AnswerMessage | IceCandidateMessage;

/**
 * Custom hook for managing WebRTC connections with reactive signals
 */
export function useWebRTCConnection(
  localId: Signal<string>,
  addLog: (message: string) => void = () => {},
) {
  // Peer connection state
  const peerConnection = useSignal<RTCPeerConnection | null>(null);
  const dataChannel = useSignal<RTCDataChannel | null>(null);
  const targetId = useSignal("");
  const isConnected = useSignal(false);
  const connectionState = useSignal<RTCPeerConnectionState | null>(null);
  const iceConnectionState = useSignal<RTCIceConnectionState | null>(null);
  const iceGatheringState = useSignal<RTCIceGatheringState | null>(null);
  const signalingState = useSignal<RTCSignalingState | null>(null);
  
  // Message handling
  const receivedMessages = useSignal<any[]>([]);
  const lastReceivedMessage = useSignal<any | null>(null);

  // Error state
  const error = useSignal<Error | null>(null);

  // Computed value for better connection status
  const connectionStatus = computed(() => {
    if (error.value) return "error";
    if (!peerConnection.value) return "not_initialized";
    if (isConnected.value && dataChannel.value?.readyState === "open") return "connected";
    if (connectionState.value === "connecting" || connectionState.value === "new") return "connecting";
    if (connectionState.value === "failed" || connectionState.value === "closed") return "disconnected";
    return "initializing";
  });
  
  // Initialize WebRTC peer connection
  const initPeerConnection = useCallback(async () => {
    try {
      // Clean up any existing connection first
      if (peerConnection.value) {
        closePeerConnection();
      }
      
      error.value = null;
      
      // Get ICE servers from Twilio or fallback to default public STUN servers
      let iceServers;
      try {
        iceServers = await fetchIceServers();
        addLog("Using ICE servers from server");
      } catch (err) {
        addLog("Failed to get ICE servers, using defaults");
        iceServers = [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ];
      }
      
      // Create new RTCPeerConnection
      const newPeerConnection = new RTCPeerConnection({ iceServers });
      peerConnection.value = newPeerConnection;
      addLog("WebRTC peer connection initialized");
      
      // Set up event handlers
      setupPeerConnectionEventHandlers(newPeerConnection);
      
      return newPeerConnection;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      error.value = errorObj;
      addLog(`Error initializing peer connection: ${errorObj.message}`);
      console.error("Error initializing peer connection:", err);
      return null;
    }
  }, []);
  
  // Set up event handlers for the peer connection
  const setupPeerConnectionEventHandlers = useCallback((pc: RTCPeerConnection) => {
    // Track connection state changes
    pc.onconnectionstatechange = () => {
      connectionState.value = pc.connectionState;
      addLog(`Connection state changed: ${pc.connectionState}`);
      
      if (pc.connectionState === "connected") {
        isConnected.value = true;
      } else if (pc.connectionState === "disconnected" || 
                pc.connectionState === "failed" || 
                pc.connectionState === "closed") {
        isConnected.value = false;
      }
    };
    
    // Track ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      iceConnectionState.value = pc.iceConnectionState;
      addLog(`ICE connection state changed: ${pc.iceConnectionState}`);
    };
    
    // Track ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      iceGatheringState.value = pc.iceGatheringState;
      addLog(`ICE gathering state changed: ${pc.iceGatheringState}`);
    };
    
    // Track signaling state changes
    pc.onsignalingstatechange = () => {
      signalingState.value = pc.signalingState;
      addLog(`Signaling state changed: ${pc.signalingState}`);
    };
    
    // Handle incoming data channels
    pc.ondatachannel = (event) => {
      addLog(`Received data channel: ${event.channel.label}`);
      setupDataChannel(event.channel);
    };
    
    // Handle negotiation needed
    pc.onnegotiationneeded = async () => {
      addLog("Negotiation needed");
      
      if (!targetId.value) {
        addLog("No target ID set for negotiation");
        return;
      }
      
      try {
        await createAndSendOffer();
      } catch (err) {
        addLog(`Error handling negotiation: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
  }, [targetId.value]);
  
  // Set up event handlers for the data channel
  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    dataChannel.value = channel;
    
    channel.onopen = () => {
      addLog(`Data channel opened: ${channel.label}`);
      isConnected.value = true;
    };
    
    channel.onclose = () => {
      addLog(`Data channel closed: ${channel.label}`);
      isConnected.value = false;
    };
    
    channel.onmessage = (event) => {
      try {
        // Try to parse JSON messages
        let parsedData;
        if (typeof event.data === "string" && event.data.startsWith("{")) {
          parsedData = JSON.parse(event.data);
        } else {
          parsedData = event.data;
        }
        
        // Store the received message
        lastReceivedMessage.value = parsedData;
        receivedMessages.value = [...receivedMessages.value, parsedData];
        
        // Log the received message
        if (typeof parsedData === "object") {
          addLog(`Received message: ${parsedData.type || "unknown type"}`);
        } else {
          addLog(`Received: ${String(event.data).substring(0, 50)}${String(event.data).length > 50 ? "..." : ""}`);
        }
      } catch (err) {
        console.error("Error processing received message:", err);
        addLog(`Error processing message: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    
    channel.onerror = (event) => {
      const errorEvent = event as RTCErrorEvent;
      addLog(`Data channel error: ${errorEvent.error.message}`);
      error.value = errorEvent.error;
    };
  }, []);
  
  // Create a data channel and set it up
  const createDataChannel = useCallback((label: string = "data") => {
    if (!peerConnection.value) {
      addLog("Cannot create data channel: No peer connection");
      return null;
    }
    
    try {
      const channel = peerConnection.value.createDataChannel(label);
      setupDataChannel(channel);
      addLog(`Created data channel: ${label}`);
      return channel;
    } catch (err) {
      addLog(`Error creating data channel: ${err instanceof Error ? err.message : String(err)}`);
      error.value = err instanceof Error ? err : new Error(String(err));
      return null;
    }
  }, []);
  
  // Create an offer and set local description
  const createAndSendOffer = useCallback(async () => {
    if (!peerConnection.value || !targetId.value) {
      addLog("Cannot create offer: No peer connection or target ID");
      return;
    }
    
    try {
      const offer = await peerConnection.value.createOffer();
      addLog("Offer created");
      
      await peerConnection.value.setLocalDescription(offer);
      addLog("Local description set");
      
      // The caller needs to send this offer via signaling
      return {
        type: "offer" as const,
        source: localId.value,
        target: targetId.value,
        data: offer
      };
    } catch (err) {
      addLog(`Error creating offer: ${err instanceof Error ? err.message : String(err)}`);
      error.value = err instanceof Error ? err : new Error(String(err));
      return null;
    }
  }, [targetId.value, localId.value]);
  
  // Handle an incoming offer
  const handleOffer = useCallback(async (message: OfferMessage) => {
    addLog(`Handling offer from: ${message.source}`);
    
    // Store the sender as target for future communication
    targetId.value = message.source;
    
    try {
      // Initialize peer connection if not exists
      const pc = peerConnection.value || await initPeerConnection();
      if (!pc) {
        throw new Error("Failed to initialize peer connection");
      }
      
      // Set remote description from offer
      await pc.setRemoteDescription(new RTCSessionDescription(message.data));
      addLog("Remote description set from offer");
      
      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      addLog("Created answer and set local description");
      
      // Return the answer message to be sent via signaling
      return {
        type: "answer" as const,
        source: localId.value,
        target: message.source,
        data: answer
      };
    } catch (err) {
      addLog(`Error handling offer: ${err instanceof Error ? err.message : String(err)}`);
      error.value = err instanceof Error ? err : new Error(String(err));
      return null;
    }
  }, [localId.value, initPeerConnection]);
  
  // Handle an incoming answer
  const handleAnswer = useCallback(async (message: AnswerMessage) => {
    addLog(`Handling answer from: ${message.source}`);
    
    if (!peerConnection.value) {
      addLog("No peer connection to handle answer");
      return false;
    }
    
    try {
      await peerConnection.value.setRemoteDescription(new RTCSessionDescription(message.data));
      addLog("Remote description set from answer");
      return true;
    } catch (err) {
      addLog(`Error handling answer: ${err instanceof Error ? err.message : String(err)}`);
      error.value = err instanceof Error ? err : new Error(String(err));
      return false;
    }
  }, []);
  
  // Handle an incoming ICE candidate
  const handleIceCandidate = useCallback(async (message: IceCandidateMessage) => {
    addLog(`Handling ICE candidate from: ${message.source}`);
    
    if (!peerConnection.value) {
      addLog("No peer connection to handle ICE candidate");
      return false;
    }
    
    try {
      await peerConnection.value.addIceCandidate(
        message.data ? new RTCIceCandidate(message.data) : null
      );
      addLog("Added ICE candidate");
      return true;
    } catch (err) {
      addLog(`Error handling ICE candidate: ${err instanceof Error ? err.message : String(err)}`);
      error.value = err instanceof Error ? err : new Error(String(err));
      return false;
    }
  }, []);
  
  // Send a message through the data channel
  const sendMessage = useCallback((message: unknown) => {
    if (!dataChannel.value || dataChannel.value.readyState !== "open") {
      addLog("Cannot send message: Data channel not open");
      return false;
    }
    
    try {
      const messageToSend = typeof message === "string" 
        ? message 
        : JSON.stringify(message);
      
      dataChannel.value.send(messageToSend);
      
      addLog(`Sent: ${typeof message === "object" ? JSON.stringify(message).substring(0, 50) + "..." : message}`);
      return true;
    } catch (err) {
      addLog(`Error sending message: ${err instanceof Error ? err.message : String(err)}`);
      error.value = err instanceof Error ? err : new Error(String(err));
      return false;
    }
  }, []);
  
  // Main connection function that handles the whole connection process
  const connect = useCallback(async (peerId: string) => {
    if (isConnected.value) {
      addLog("Already connected, disconnecting first");
      closePeerConnection();
    }
    
    targetId.value = peerId;
    addLog(`Connecting to peer: ${peerId}`);
    
    try {
      // Initialize peer connection
      const pc = await initPeerConnection();
      if (!pc) {
        throw new Error("Failed to initialize peer connection");
      }
      
      // Create data channel
      createDataChannel();
      
      // Create and return offer to be sent via signaling
      return await createAndSendOffer();
    } catch (err) {
      addLog(`Error connecting: ${err instanceof Error ? err.message : String(err)}`);
      error.value = err instanceof Error ? err : new Error(String(err));
      return null;
    }
  }, [isConnected.value, initPeerConnection, createDataChannel, createAndSendOffer]);
  
  // Close peer connection and clean up
  const closePeerConnection = useCallback(() => {
    if (dataChannel.value) {
      dataChannel.value.close();
      dataChannel.value = null;
    }
    
    if (peerConnection.value) {
      peerConnection.value.close();
      peerConnection.value = null;
    }
    
    isConnected.value = false;
    connectionState.value = null;
    iceConnectionState.value = null;
    iceGatheringState.value = null;
    signalingState.value = null;
    
    addLog("WebRTC connection closed");
  }, []);
  
  // Process an incoming signaling message
  const handleSignalingMessage = useCallback(async (message: SignalingMessage) => {
    try {
      switch (message.type) {
        case "offer":
          return await handleOffer(message);
        
        case "answer":
          return await handleAnswer(message);
        
        case "ice-candidate":
          return await handleIceCandidate(message);
        
        default:
          addLog(`Unknown signaling message type: ${(message as any).type}`);
          return null;
      }
    } catch (err) {
      addLog(`Error handling signaling message: ${err instanceof Error ? err.message : String(err)}`);
      error.value = err instanceof Error ? err : new Error(String(err));
      return null;
    }
  }, [handleOffer, handleAnswer, handleIceCandidate]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      closePeerConnection();
    };
  }, []);
  
  return {
    // State signals
    peerConnection,
    dataChannel,
    targetId,
    isConnected,
    connectionState,
    iceConnectionState,
    iceGatheringState,
    signalingState,
    connectionStatus,
    receivedMessages,
    lastReceivedMessage,
    error,
    
    // Methods
    initPeerConnection,
    createDataChannel,
    connect,
    closePeerConnection,
    sendMessage,
    handleSignalingMessage,
    
    // Internal handlers exposed for advanced usage
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    createAndSendOffer,
  };
}