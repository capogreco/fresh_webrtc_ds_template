import { Signal } from "@preact/signals";
import { WebSocketMessage } from "../islands/hooks/useWebSocketSignaling.ts";

export interface ConnectionInfo {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  connected: boolean;
}

export interface WebRTCServiceCallbacks {
  addLog: (text: string) => void;
  onConnectionStateChange: (clientId: string, connected: boolean) => void;
  onDataChannelMessage: (clientId: string, data: unknown) => void;
  onDataChannelOpen: (clientId: string, dataChannel: RTCDataChannel) => void;
  onDataChannelClose: (clientId: string) => void;
  onClientRemoved: (clientId: string) => void;
}

export interface PingResult {
  clientId: string;
  latency: number;
  success: boolean;
}

export class WebRTCService {
  private connections: Map<string, ConnectionInfo>;
  private callbacks: WebRTCServiceCallbacks;
  private wsSignal: {
    sendMessage: (message: WebSocketMessage) => void;
  };
  private controllerId: Signal<string>;
  private pingInterval: number | null = null;

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
    const dataChannel = peerConnection.createDataChannel("synthControlData", {
      ordered: true,
    });

    // Set up event handlers for the data channel
    this.setupDataChannelEvents(dataChannel, clientId);

    // Set up event handlers for the RTCPeerConnection
    this.setupPeerConnectionEvents(peerConnection, clientId);

    // Store the new connection
    this.connections.set(clientId, {
      peerConnection,
      dataChannel,
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
      this.callbacks.addLog(`Data channel opened to ${clientId}`);
      const connection = this.connections.get(clientId);
      if (connection) {
        connection.connected = true;
        this.connections.set(clientId, connection);
        this.callbacks.onConnectionStateChange(clientId, true);
        this.callbacks.onDataChannelOpen(clientId, dataChannel);
      }
    };

    dataChannel.onclose = () => {
      this.callbacks.addLog(`Data channel closed to ${clientId}`);
      const connection = this.connections.get(clientId);
      if (connection) {
        connection.connected = false;
        this.connections.set(clientId, connection);
        this.callbacks.onConnectionStateChange(clientId, false);
        this.callbacks.onDataChannelClose(clientId);
      }
    };

    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onDataChannelMessage(clientId, data);
      } catch (_error) {
        console.error(
          `Error parsing data channel message from ${clientId}:`,
          _error,
          event.data,
        );
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
    msg: { source: string; data: RTCSessionDescriptionInit; type: "offer" },
  ): Promise<void> {
    const clientId = msg.source;
    this.callbacks.addLog(`Received offer from ${clientId}`);

    let connection = this.connections.get(clientId);
    if (!connection) {
      // Create a new RTCPeerConnection if one doesn't exist
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      // Set up event handlers for the RTCPeerConnection
      this.setupPeerConnectionEvents(peerConnection, clientId);

      // Handle data channel created by the client
      peerConnection.ondatachannel = (event) => {
        this.callbacks.addLog(`Received data channel from ${clientId}`);
        const dataChannel = event.channel;
        this.setupDataChannelEvents(dataChannel, clientId);

        // Store the data channel in the connection info
        const connectionInfo = this.connections.get(clientId);
        if (connectionInfo) {
          connectionInfo.dataChannel = dataChannel;
          this.connections.set(clientId, connectionInfo);
        }
      };

      // Store the new connection without a data channel yet
      connection = {
        peerConnection,
        dataChannel: null,
        connected: false,
      };
      this.connections.set(clientId, connection);
    }

    try {
      // Set the remote description (the client's offer)
      await connection.peerConnection.setRemoteDescription(
        new RTCSessionDescription(msg.data),
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
        `Received answer from ${clientId} but no connection exists`,
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
    msg: { source: string; data: RTCIceCandidateInit; type: "ice-candidate" },
  ): Promise<void> {
    const clientId = msg.source;

    const connection = this.connections.get(clientId);
    if (!connection) {
      this.callbacks.addLog(
        `Received ICE candidate from ${clientId} but no connection exists`,
      );
      return;
    }

    try {
      await connection.peerConnection.addIceCandidate(
        new RTCIceCandidate(msg.data),
      );
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

    if (connection.dataChannel) {
      connection.dataChannel.close();
    }
    connection.peerConnection.close();
    this.removeConnection(clientId);

    this.callbacks.addLog(`Disconnected from client ${clientId}`);
  }

  private removeConnection(clientId: string): void {
    this.connections.delete(clientId);
    this.callbacks.onClientRemoved(clientId);
  }

  sendMessageToClient(
    clientId: string,
    message: unknown,
  ): boolean {
    const connection = this.connections.get(clientId);
    if (
      !connection || !connection.dataChannel ||
      connection.dataChannel.readyState !== "open"
    ) {
      return false;
    }

    try {
      connection.dataChannel.send(
        typeof message === "string" ? message : JSON.stringify(message),
      );
      return true;
    } catch (error) {
      console.error(`Error sending message to ${clientId}:`, error);
      return false;
    }
  }

  broadcastMessage(message: unknown): Map<string, boolean> {
    const results = new Map<string, boolean>();

    for (const [clientId, connection] of this.connections.entries()) {
      if (
        connection.dataChannel && connection.dataChannel.readyState === "open"
      ) {
        try {
          connection.dataChannel.send(
            typeof message === "string" ? message : JSON.stringify(message),
          );
          results.set(clientId, true);
        } catch (error) {
          console.error(`Error broadcasting to ${clientId}:`, error);
          results.set(clientId, false);
        }
      } else {
        results.set(clientId, false);
      }
    }

    return results;
  }

  startPing(intervalMs: number = 5000): void {
    this.stopPing();

    this.pingInterval = setInterval(() => {
      const clientIds = Array.from(this.connections.keys());
      clientIds.forEach(this.pingClient.bind(this));
    }, intervalMs) as unknown as number;

    this.callbacks.addLog(`Started WebRTC ping at ${intervalMs}ms intervals`);
  }

  stopPing(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      this.callbacks.addLog("Stopped WebRTC ping");
    }
  }

  async pingClient(clientId: string): Promise<PingResult> {
    const connection = this.connections.get(clientId);
    if (
      !connection || !connection.dataChannel ||
      connection.dataChannel.readyState !== "open"
    ) {
      return { clientId, latency: -1, success: false };
    }

    // Use a timestamp for ping measurement
    const timestamp = Date.now();
    const pingMessage = {
      type: "ping",
      timestamp,
    };

    // Create a promise that will resolve when we get a pong back
    const pingPromise = new Promise<PingResult>((resolve) => {
      // Add a one-time message handler for this specific ping
      const onPongReceived = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pong" && data.timestamp === timestamp) {
            const latency = Date.now() - timestamp;
            // Remove the one-time listener
            connection.dataChannel?.removeEventListener(
              "message",
              onPongReceived,
            );
            resolve({ clientId, latency, success: true });
          }
        } catch (_error) {
          // Ignore parsing errors, we'll just wait for the correct message
        }
      };

      // Add the listener
      connection.dataChannel?.addEventListener("message", onPongReceived);

      // Set a timeout to resolve with failure after 5 seconds
      setTimeout(() => {
        connection.dataChannel?.removeEventListener("message", onPongReceived);
        resolve({ clientId, latency: -1, success: false });
      }, 5000);
    });

    try {
      connection.dataChannel.send(JSON.stringify(pingMessage));
      return await pingPromise;
    } catch (_error) {
      console.error(`Error pinging client ${clientId}:`, _error);
      return { clientId, latency: -1, success: false };
    }
  }
}
