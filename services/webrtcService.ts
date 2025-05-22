import { Signal } from "@preact/signals";
import { WebSocketMessage } from "../islands/hooks/useWebSocketSignaling.ts";


export interface ConnectionInfo {
  peerConnection: RTCPeerConnection;
  reliableControlChannel: RTCDataChannel | null;
  streamingUpdatesChannel: RTCDataChannel | null;
  connected: boolean; // True if reliableControlChannel is open
}

export interface WebRTCServiceCallbacks {
  addLog: (text: string) => void;
  onConnectionStateChange: (clientId: string, connected: boolean) => void; // Overall WebRTC connection
  onDataChannelMessage: (clientId: string, channelLabel: string, data: unknown) => void;
  onDataChannelOpen: (clientId: string, dataChannel: RTCDataChannel) => void; // Called for each channel
  onDataChannelClose: (clientId: string, channelLabel: string) => void; // Called for each channel
  onClientRemoved: (clientId: string) => void;
}


export class WebRTCService {
  private connections: Map<string, ConnectionInfo>;
  private callbacks: WebRTCServiceCallbacks;
  private wsSignal: {
    sendMessage: (message: WebSocketMessage) => void;
  };
  private controllerId: Signal<string>;

  constructor(
    controllerId: Signal<string>,
    wsSignal: { sendMessage: (message: WebSocketMessage) => void },
    callbacks: WebRTCServiceCallbacks,
  ) {
    this.connections = new Map<string, ConnectionInfo>();
    this.callbacks = callbacks;
    this.wsSignal = wsSignal;
    this.controllerId = controllerId;
  }

  getConnections(): Map<string, ConnectionInfo> {
    return this.connections;
  }

  isConnected(clientId: string): boolean {
    const connection = this.connections.get(clientId);
    return !!connection && connection.connected;
  }

  async initRTC(clientId: string): Promise<void> {
    this.callbacks.addLog(`Initializing WebRTC connection to ${clientId}`);

    // Remove any existing connection for this client
    if (this.connections.has(clientId)) {
      this.disconnect(clientId);
    }

    // Create a new RTCPeerConnection
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    // Create data channel
    // Data channels are typically created by the offerer.
    // The controller (answerer) will receive them via peerConnection.ondatachannel.
    // If controller needs to initiate, it would create offer and data channels here.
    // For now, assuming client (offerer) creates channels.
    this.callbacks.addLog(`[WebRTCService] initRTC: Setting up ondatachannel handler for ${clientId}`);
    peerConnection.ondatachannel = (event) => {
      this.callbacks.addLog(`[WebRTCService] initRTC: ondatachannel event for ${clientId}, label: ${event.channel.label}`);
      this.handleDataChannelEvent(event, clientId);
    };

    // Set up event handlers for the RTCPeerConnection
    this.setupPeerConnectionEvents(peerConnection, clientId);

    // Store the new connection (channels will be added via ondatachannel)
    this.connections.set(clientId, {
      peerConnection,
      reliableControlChannel: null,
      streamingUpdatesChannel: null,
      connected: false,
    });

    try {
      // Create and send an offer to the client
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // Send the offer to the client via the signaling server
      this.wsSignal.sendMessage({
        type: "offer",
        target: clientId,
        source: this.controllerId.value,
        data: offer,
      });

      this.callbacks.addLog(`Sent offer to ${clientId}`);
    } catch (error) {
      this.callbacks.addLog(
        `Error creating/sending offer to ${clientId}: ${error}`,
      );
      console.error(
        `Error creating/sending offer to ${clientId}:`,
        error,
      );
      this.disconnect(clientId);
    }
  }

  private setupDataChannelEvents(
    dataChannel: RTCDataChannel,
    clientId: string,
  ): void {
    dataChannel.onopen = () => {
      this.callbacks.addLog(`[WebRTCService] Data channel [${dataChannel.label}] opened to ${clientId}`);
      console.log(`[WebRTCService] Data channel "${dataChannel.label}" opened for client ${clientId}`);
      
      const connection = this.connections.get(clientId);
      if (connection) {
        if (dataChannel.label === "reliable_control") {
          connection.connected = true; // Main connection status tied to reliable channel
          this.callbacks.onConnectionStateChange(clientId, true);
          
          // Send initial test message to verify the connection works
          try {
            const testMessage = JSON.stringify({ type: "connection_established", timestamp: Date.now() });
            dataChannel.send(testMessage);
            this.callbacks.addLog(`[WebRTCService] Sent test message on ${dataChannel.label} to ${clientId}`);
          } catch (error) {
            this.callbacks.addLog(`[WebRTCService] Failed to send test message: ${error}`);
          }
        }
        // Always update the specific channel in connection info
        if (dataChannel.label === "reliable_control") connection.reliableControlChannel = dataChannel;
        else if (dataChannel.label === "streaming_updates") connection.streamingUpdatesChannel = dataChannel;
        
        this.connections.set(clientId, connection);
        this.callbacks.onDataChannelOpen(clientId, dataChannel); // Notify manager about this specific channel
      } else {
        this.callbacks.addLog(`[WebRTCService] Warning: Connection not found for ${clientId} when data channel opened`);
      }
    };

    dataChannel.onclose = () => {
      console.log(`[WebRTCService] Data channel [${dataChannel.label}] closed to ${clientId}`);
      this.callbacks.addLog(`[WebRTCService] Data channel [${dataChannel.label}] closed to ${clientId}`);
      
      const connection = this.connections.get(clientId);
      if (connection) {
        if (dataChannel.label === "reliable_control") {
          connection.connected = false;
          this.callbacks.onConnectionStateChange(clientId, false); // Overall connection lost
          console.log(`[WebRTCService] Marked client ${clientId} as disconnected`);
          this.callbacks.addLog(`[WebRTCService] WebRTC connection with ${clientId} has been lost`);
        }
        // Clear the specific channel from connection info
        if (dataChannel.label === "reliable_control") connection.reliableControlChannel = null;
        else if (dataChannel.label === "streaming_updates") connection.streamingUpdatesChannel = null;

        this.connections.set(clientId, connection);
        this.callbacks.onDataChannelClose(clientId, dataChannel.label);
        
        // Schedule a reconnection attempt if this was the reliable channel
        if (dataChannel.label === "reliable_control") {
          console.log(`[WebRTCService] Will wait for client to reconnect: ${clientId}`);
        }
        
        // Check if both channels are closed and peer connection is still open
        // Consider cleaning up the entire connection if needed
        if (!connection.reliableControlChannel && !connection.streamingUpdatesChannel) {
          console.log(`[WebRTCService] All channels closed for ${clientId}`);
          this.callbacks.addLog(`[WebRTCService] All channels closed for ${clientId}`);
        }
      } else {
        console.warn(`[WebRTCService] Data channel closed but no connection found for ${clientId}`);
        this.callbacks.addLog(`[WebRTCService] Warning: Connection not found for ${clientId} when data channel closed`);
      }
    };

    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onDataChannelMessage(clientId, dataChannel.label, data);
      } catch (error) {
        // Improved error handling with better logging
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[WebRTCService] Error parsing data channel message from ${clientId} on [${dataChannel.label}]:`,
          error,
          event.data,
        );
        this.callbacks.addLog(`Error parsing message from client ${clientId}: ${errorMessage}`);
      }
    };
  }

  private setupPeerConnectionEvents(
    peerConnection: RTCPeerConnection,
    clientId: string,
  ): void {
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // Send the ICE candidate to the client via the signaling server
        this.wsSignal.sendMessage({
          type: "ice-candidate",
          target: clientId,
          source: this.controllerId.value,
          data: event.candidate,
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      this.callbacks.addLog(
        `WebRTC connection state changed for ${clientId}: ${state}`,
      );

      const connection = this.connections.get(clientId);
      if (connection) {
        const wasConnected = connection.connected;
        const isNowConnected = ["connected", "completed"].includes(state);

        if (wasConnected !== isNowConnected) {
          connection.connected = isNowConnected;
          this.connections.set(clientId, connection);
          this.callbacks.onConnectionStateChange(clientId, isNowConnected);
        }

        if (state === "failed" || state === "closed") {
          this.removeConnection(clientId);
        }
      }
    };

    peerConnection.onicegatheringstatechange = () => {
      this.callbacks.addLog(
        `ICE gathering state changed for ${clientId}: ${peerConnection.iceGatheringState}`,
      );
    };

    peerConnection.onsignalingstatechange = () => {
      this.callbacks.addLog(
        `Signaling state changed for ${clientId}: ${peerConnection.signalingState}`,
      );
      if (peerConnection.signalingState === "closed") {
        this.removeConnection(clientId);
      }
    };
  }

  async handleClientOffer(
    msg: { source: string; data?: RTCSessionDescriptionInit | any; sdp?: any; type: "offer" },
  ): Promise<void> {
    const clientId = msg.source;
    this.callbacks.addLog(`Received offer from ${clientId}`);
    console.log(`[WebRTCService] handleClientOffer: Offer details - data present: ${!!msg.data}, sdp present: ${!!msg.sdp}`);

    let connection = this.connections.get(clientId);
    if (!connection) {
      // Creating new client connection
      this.callbacks.addLog(`[WebRTCService] Creating new connection for client ${clientId}`);
      
      // Create a new RTCPeerConnection if one doesn't exist
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      // Set up event handlers for the RTCPeerConnection
      this.setupPeerConnectionEvents(peerConnection, clientId);

      // Store the new connection without data channels yet (they arrive via ondatachannel)
      // CRITICAL: Store the connection in the map *before* setting ondatachannel or other async ops that might use it.
      connection = {
        peerConnection,
        reliableControlChannel: null,
        streamingUpdatesChannel: null,
        connected: false,
      };
      this.connections.set(clientId, connection);
      console.log(`[WebRTCService] New connection created and stored for ${clientId}`);

      // Handle data channel created by the client - this is crucial for WebRTC connection!
      // Set this up *after* the connection object is in the map.
      peerConnection.ondatachannel = (event) => {
        // Data channel event received
        this.callbacks.addLog(`[WebRTCService] ondatachannel event for ${clientId}, label: ${event.channel.label}`);
        
        // Process the incoming data channel
        this.handleDataChannelEvent(event, clientId);
        
        // Note: Actual 'connected' status is now primarily managed by data channel onopen events
        // within setupDataChannelEvents, which is called by handleDataChannelEvent.
      };
    } else {
      // Using existing connection
      // If reusing an existing connection, ensure its ondatachannel handler is set,
      // as it might have been cleared or from a previous instance if logic changed.
      // This is a defensive measure.
      if (!connection.peerConnection.ondatachannel) {
        // Re-assigning handler
        connection.peerConnection.ondatachannel = (event) => {
          console.log(`[WebRTCService] ondatachannel (re-assigned) event for ${clientId}, channel: ${event.channel.label}, readyState: ${event.channel.readyState}`);
          this.callbacks.addLog(`[WebRTCService] ondatachannel (re-assigned) for ${clientId}, label: ${event.channel.label}`);
          this.handleDataChannelEvent(event, clientId);
        };
      }
    }

    try {
      // Debug log the offer data for troubleshooting
      // Processing offer data
      
      // Handle different data formats - some clients send in data, others in sdp
      let offerData = msg.data;
      
      // If data is missing but sdp is present, use that instead
      if (!offerData && msg.sdp) {
        offerData = msg.sdp;
      }
      
      // Ensure the offer has the correct structure for RTCSessionDescription
      if (offerData && (!offerData.type || !offerData.sdp)) {
        if (typeof offerData === 'object' && offerData.sdp) {
          // It has sdp but missing type
          offerData = { ...offerData, type: 'offer' };
        } else {
          this.callbacks.addLog(`[WebRTCService] Invalid offer data structure from ${clientId}`);
          throw new Error("Invalid offer data structure");
        }
      }
      
      // Set the remote description (the client's offer)
      await connection.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offerData),
      );

      // Create an answer
      const answer = await connection.peerConnection.createAnswer();
      await connection.peerConnection.setLocalDescription(answer);

      // Send the answer to the client via the signaling server
      this.wsSignal.sendMessage({
        type: "answer",
        target: clientId,
        source: this.controllerId.value,
        data: answer,
      });

      this.callbacks.addLog(`Sent answer to ${clientId}`);
    } catch (error) {
      this.callbacks.addLog(
        `Error handling offer from ${clientId}: ${error}`,
      );
      console.error(`Error handling offer from ${clientId}:`, error);
      console.error(`[WebRTCService] Offer message that caused error:`, JSON.stringify(msg));
      
      // Log detailed error with stack trace
      if (error instanceof Error) {
        console.error(`[WebRTCService] Error stack:`, error.stack);
      }
      
      this.removeConnection(clientId);
    }
  }

  async handleAnswerFromClient(
    msg: { source: string; data: RTCSessionDescriptionInit; type: "answer" },
  ): Promise<void> {
    const clientId = msg.source;
    this.callbacks.addLog(`Received answer from ${clientId}`);

    const connection = this.connections.get(clientId);
    if (!connection) {
      this.callbacks.addLog(
        `[WebRTCService] Received answer from ${clientId} but no connection exists`,
      );
      return;
    }

    try {
      await connection.peerConnection.setRemoteDescription(
        new RTCSessionDescription(msg.data),
      );
      this.callbacks.addLog(`Set remote description for ${clientId}`);
    } catch (error) {
      this.callbacks.addLog(
        `Error setting remote description for ${clientId}: ${error}`,
      );
      console.error(
        `Error setting remote description for ${clientId}:`,
        error,
      );
    }
  }

  async handleIceCandidateFromClient(
    msg: { source: string; data: RTCIceCandidateInit | null; type: "ice-candidate" },
  ): Promise<void> {
    const clientId = msg.source;
    this.callbacks.addLog(
      `[WebRTCService] Received ICE candidate from ${clientId}`,
    );
    console.log(`[WebRTCService] ICE candidate data:`, msg.data || "end-of-candidates");

    const connection = this.connections.get(clientId);
    if (!connection) {
      this.callbacks.addLog(
        `[WebRTCService] Received ICE candidate from ${clientId} but no connection exists`,
      );
      return;
    }

    // Handle empty or null candidate (often used as an "end of candidates" indicator)
    if (!msg.data || (msg.data.candidate === "" || msg.data.candidate === null)) {
      this.callbacks.addLog(`[WebRTCService] Received end-of-candidates indicator from ${clientId}`);
      return;
    }

    try {
      // Check if the candidate has required fields
      if (!msg.data.sdpMid && msg.data.sdpMLineIndex === undefined) {
        // Attempt to create a minimal valid candidate if possible
        const candidateObj = {
          candidate: msg.data.candidate,
          sdpMid: msg.data.sdpMid || "0",
          sdpMLineIndex: msg.data.sdpMLineIndex !== undefined ? msg.data.sdpMLineIndex : 0
        };
        await connection.peerConnection.addIceCandidate(new RTCIceCandidate(candidateObj));
        this.callbacks.addLog(`[WebRTCService] Added reconstructed ICE candidate for ${clientId}`);
      } else {
        await connection.peerConnection.addIceCandidate(new RTCIceCandidate(msg.data));
        this.callbacks.addLog(`[WebRTCService] Added ICE candidate for ${clientId}`);
      }
    } catch (error) {
      this.callbacks.addLog(
        `Error adding ICE candidate for ${clientId}: ${error}`,
      );
      console.error(`Error adding ICE candidate for ${clientId}:`, error);
    }
  }

  disconnect(clientId: string): void {
    const connection = this.connections.get(clientId);
    if (!connection) {
      this.callbacks.addLog(`No connection found for client ${clientId}`);
      return;
    }

    if (connection.reliableControlChannel) {
      this.callbacks.addLog(`[WebRTCService] Closing reliable_control channel for ${clientId}`);
      connection.reliableControlChannel.close();
    }
    if (connection.streamingUpdatesChannel) {
      this.callbacks.addLog(`[WebRTCService] Closing streaming_updates channel for ${clientId}`);
      connection.streamingUpdatesChannel.close();
    }
    connection.peerConnection.close();
    this.removeConnection(clientId);

    this.callbacks.addLog(`Disconnected from client ${clientId}`);
  }

  private removeConnection(clientId: string): void {
    this.connections.delete(clientId);
    this.callbacks.onClientRemoved(clientId);
  }

  // Helper to manage data channel events, used by both initRTC and handleClientOffer
  private handleDataChannelEvent(event: RTCDataChannelEvent, clientId: string): void {
    const dataChannel = event.channel;
    this.callbacks.addLog(`[WebRTCService] Data channel [${dataChannel.label}] received for ${clientId}. Ordered: ${dataChannel.ordered}, MaxRetransmits: ${dataChannel.maxRetransmits}`);
    console.log(`[WebRTCService] Data channel received: ${dataChannel.label} for client ${clientId}, readyState: ${dataChannel.readyState}`);
    
    const connection = this.connections.get(clientId);
    if (!connection) {
      this.callbacks.addLog(`[WebRTCService] No connection found for ${clientId} when handling data channel event.`);
      return;
    }

    if (dataChannel.label === "reliable_control") {
      connection.reliableControlChannel = dataChannel;
      this.callbacks.addLog(`[WebRTCService] Reliable control channel assigned for ${clientId}`);
      // Mark the connection as established immediately for the reliable control channel
      connection.connected = true;
      this.callbacks.onConnectionStateChange(clientId, true);
      console.log(`[WebRTCService] Connection marked as established with ${clientId} via reliable channel`);
    } else if (dataChannel.label === "streaming_updates") {
      connection.streamingUpdatesChannel = dataChannel;
      this.callbacks.addLog(`[WebRTCService] Streaming updates channel assigned for ${clientId}`);
    } else {
      this.callbacks.addLog(`[WebRTCService] Received data channel with unknown label: ${dataChannel.label}`);
      console.warn(`[WebRTCService] Unknown data channel: ${dataChannel.label}`);
      // Optionally close it if it's unexpected: dataChannel.close();
      return;
    }
    
    // Update connection in map before setting up events
    this.connections.set(clientId, connection);
    
    // Set up event handlers for the channel
    this.setupDataChannelEvents(dataChannel, clientId);
    
    // If the channel is already open (rare case), trigger onopen handler manually
    if (dataChannel.readyState === "open") {
      this.callbacks.addLog(`[WebRTCService] Data channel ${dataChannel.label} was already open, triggering onopen handler`);
      const openEvent = new Event("open");
      dataChannel.dispatchEvent(openEvent);
    }
    
    // Send a test message on the reliable control channel to confirm connection
    if (dataChannel.label === "reliable_control" && dataChannel.readyState === "open") {
      try {
        dataChannel.send(JSON.stringify({ type: "connection_established", timestamp: Date.now() }));
        console.log(`[WebRTCService] Sent test message on ${dataChannel.label} to ${clientId}`);
      } catch (error) {
        console.error(`[WebRTCService] Error sending test message: ${error}`);
      }
    }
  }

  sendMessageToClient(
    clientId: string,
    message: unknown,
    channelLabel: "reliable_control" | "streaming_updates" = "reliable_control",
  ): boolean {
    const connection = this.connections.get(clientId);
    if (!connection) {
      this.callbacks.addLog(`[WebRTCService] sendMessageToClient: No connection for ${clientId}`);
      return false;
    }

    let channelToUse: RTCDataChannel | null = null;
    if (channelLabel === "reliable_control") {
      channelToUse = connection.reliableControlChannel;
    } else {
      channelToUse = connection.streamingUpdatesChannel;
    }

    if (!channelToUse || channelToUse.readyState !== "open") {
      this.callbacks.addLog(`[WebRTCService] sendMessageToClient: Channel [${channelLabel}] for ${clientId} not open. State: ${channelToUse?.readyState}`);
      
      // If reliable channel is closed but connection is still marked as connected, update the state
      if (channelLabel === "reliable_control" && connection.connected) {
        connection.connected = false;
        this.connections.set(clientId, connection);
        this.callbacks.onConnectionStateChange(clientId, false);
        this.callbacks.addLog(`[WebRTCService] Updated connection state for ${clientId} to disconnected`);
      }
      
      return false;
    }

    try {
      const messageString = typeof message === "string" ? message : JSON.stringify(message);
      channelToUse.send(messageString);
      
      // Log message type for debugging (without logging full content)
      if (typeof message === "object" && message !== null && "type" in message) {
        this.callbacks.addLog(`[WebRTCService] Sent message type "${(message as any).type}" to ${clientId} on ${channelLabel}`);
      }
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[WebRTCService] Error sending message to ${clientId} on [${channelLabel}]:`, error);
      this.callbacks.addLog(`Error sending message to client ${clientId}: ${errorMessage}`);
      
      // Mark connection as failed if this was on the reliable channel
      if (channelLabel === "reliable_control" && connection.connected) {
        connection.connected = false;
        this.connections.set(clientId, connection);
        this.callbacks.onConnectionStateChange(clientId, false);
      }
      
      return false;
    }
  }

  broadcastMessage(
    message: unknown,
    channelLabel: "reliable_control" | "streaming_updates" = "reliable_control",
    ): Map<string, boolean> {
    const results = new Map<string, boolean>();

    for (const [clientId, connection] of this.connections.entries()) {
      let channelToUse: RTCDataChannel | null = null;
      if (channelLabel === "reliable_control") {
        channelToUse = connection.reliableControlChannel;
      } else {
        channelToUse = connection.streamingUpdatesChannel;
      }

      if (channelToUse && channelToUse.readyState === "open") {
        try {
          channelToUse.send(
            typeof message === "string" ? message : JSON.stringify(message),
          );
          results.set(clientId, true);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[WebRTCService] Error broadcasting to ${clientId} on [${channelLabel}]:`, error);
          this.callbacks.addLog(`Error broadcasting to client ${clientId}: ${errorMessage}`);
          results.set(clientId, false);
        }
      } else {
        results.set(clientId, false);
      }
    }
    return results;
  }


}
