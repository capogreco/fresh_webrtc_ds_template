import { computed, Signal, useSignal } from "@preact/signals";
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import type { SynthClient } from "../../lib/types/client.ts";
import {
  type PingResult,
  WebRTCService,
} from "../../services/webrtcService.ts";
import { DEFAULT_SYNTH_PARAMS } from "../../lib/synth/index.ts";
import {
  ControllerMode,
  KNOWN_CONTROLLER_MODES,
} from "../../shared/controllerModes.ts";

export function useClientManager(
  controllerId: Signal<string>,
  wsSignal: {
    sendMessage: (message: unknown) => void;
  },
  addLog: (message: string) => void,
) {
  const clients = useSignal<Map<string, SynthClient>>(new Map());
  const _pingInterval = useSignal<number | null>(null);
  const webRTCServiceRef = useRef<WebRTCService | null>(null);

  // Computed signal for connected clients count
  const connectedClientsCount = computed(() =>
    Array.from(clients.value.values()).filter((client) => client.connected)
      .length
  );

  // Computed signal for connected clients list
  const connectedClients = computed(() =>
    Array.from(clients.value.entries())
      .filter(([_, client]) => client.connected)
      .reduce((map, [id, client]) => {
        map.set(id, client);
        return map;
      }, new Map<string, SynthClient>())
  );

  const handleConnectionStateChange = useCallback(
    (clientId: string, connected: boolean) => {
      const currentClient = clients.value.get(clientId);
      const newClientsMap = new Map(clients.value);

      if (connected) {
        if (currentClient) {
          // Client exists, update its connected state
          const updatedClient: SynthClient = { ...currentClient, connected };
          newClientsMap.set(clientId, updatedClient);
          addLog(
            `[ClientManager] Existing client ${clientId} connection state: ${connected}`,
          );
        } else {
          // Client does not exist, create a new entry
          const newClientEntry: SynthClient = {
            id: clientId,
            connected: true,
            lastSeen: Date.now(),
            synthParams: { ...DEFAULT_SYNTH_PARAMS },
            // Initialize other optional fields as needed, or leave them undefined
          };
          newClientsMap.set(clientId, newClientEntry);
          addLog(
            `[ClientManager] New client ${clientId} connected and added to map.`,
          );
        }
        clients.value = newClientsMap;
      } else {
        // Client is disconnecting
        if (currentClient) {
          const updatedClient: SynthClient = { ...currentClient, connected };
          newClientsMap.set(clientId, updatedClient);
          clients.value = newClientsMap;
          addLog(
            `[ClientManager] Existing client ${clientId} connection state: ${connected}`,
          );
        } else {
          // Client doesn't exist and is reported as disconnected - usually means it was already removed.
          addLog(
            `[ClientManager] Client ${clientId} reported disconnected, but not found in map. (Possibly already removed)`,
          );
        }
      }
    },
    [clients, addLog],
  );

  const handleDataChannelMessage = useCallback(
    (clientId: string, data: unknown) => {
      if (!data || typeof data !== "object") return;
      const typedData = data as { type: string; [key: string]: unknown };
      switch (typedData.type) {
        case "pong":
          break;
        case "synth_status": {
          const client = clients.value.get(clientId);
          if (
            client && typedData.params && typeof typedData.params === "object"
          ) {
            const updatedClient: SynthClient = {
              ...client,
              synthParams: {
                ...(client.synthParams || DEFAULT_SYNTH_PARAMS),
                ...typedData.params,
              },
            };
            const newClientsMap = new Map(clients.value);
            newClientsMap.set(clientId, updatedClient);
            clients.value = newClientsMap;
          }
          break;
        }
        case "request_controller_mode":
          // Client is requesting the current controller mode
          addLog(
            `[DEBUG_MODE_CHANGE] Client ${clientId} requested controller mode`,
          );
          if (webRTCServiceRef.current) {
            // Send the current mode to the client - always default to DEFAULT mode
            const modeToSend = KNOWN_CONTROLLER_MODES.DEFAULT;
            webRTCServiceRef.current.sendMessageToClient(clientId, {
              type: "controller_mode",
              mode: modeToSend,
            });
            addLog(
              `[DEBUG_MODE_CHANGE] Sent current mode (${modeToSend}) to client ${clientId}`,
            );
          }
          break;

        default:
          addLog(
            `[ClientManager] Received unhandled message from ${clientId}: ${typedData.type}`,
          );
      }
    },
    [clients, addLog],
  );

  const handleDataChannelOpen = useCallback((clientId: string) => {
    const client = clients.value.get(clientId);

    // Send the mode as soon as the data channel opens - always set to DEFAULT mode
    if (webRTCServiceRef.current) {
      const modeToSend = KNOWN_CONTROLLER_MODES.DEFAULT;
      webRTCServiceRef.current.sendMessageToClient(clientId, {
        type: "controller_mode",
        mode: modeToSend,
      });
      addLog(
        `[DEBUG_MODE_CHANGE] Immediately sent mode=${modeToSend} to newly connected client ${clientId}`,
      );
    }

    // Send initial synth parameters
    if (client && client.synthParams) {
      webRTCServiceRef.current?.sendMessageToClient(clientId, {
        type: "synth_params_full",
        params: client.synthParams,
      });
      addLog(
        `[ClientManager] Data channel opened for ${clientId}, sent initial synth params.`,
      );
    }
  }, [clients, addLog]);

  const handleDataChannelClose = useCallback((clientId: string) => {
    const client = clients.value.get(clientId);
    if (client) {
      const updatedClient: SynthClient = { ...client, connected: false };
      const newClientsMap = new Map(clients.value);
      newClientsMap.set(clientId, updatedClient);
      clients.value = newClientsMap;
      addLog(`[ClientManager] Data channel closed for ${clientId}.`);
    }
  }, [clients, addLog]);

  const handleClientRemovedFromWebRTC = useCallback((clientId: string) => {
    const newClientsMap = new Map(clients.value);
    if (newClientsMap.delete(clientId)) {
      clients.value = newClientsMap;
      addLog(
        `[ClientManager] Client ${clientId} removed from state after WebRTC cleanup.`,
      );
    }
  }, [clients, addLog]);

  useEffect(() => {
    const callbacks = {
      addLog,
      onConnectionStateChange: handleConnectionStateChange,
      onDataChannelMessage: handleDataChannelMessage,
      onDataChannelOpen: handleDataChannelOpen,
      onDataChannelClose: handleDataChannelClose,
      onClientRemoved: handleClientRemovedFromWebRTC,
    };
    webRTCServiceRef.current = new WebRTCService(
      controllerId,
      wsSignal,
      callbacks,
    );
    addLog("[ClientManager] WebRTCService initialized.");

    // No specific cleanup for WebRTCService itself, internal intervals are managed by start/stopPing
  }, [
    controllerId,
    wsSignal,
    addLog,
    handleConnectionStateChange,
    handleDataChannelMessage,
    handleDataChannelOpen,
    handleDataChannelClose,
    handleClientRemovedFromWebRTC,
  ]);

  // Add a client to the list (doesn't connect yet)
  const addClient = useCallback((clientId: string) => {
    if (clients.value.has(clientId)) {
      addLog(`Client ${clientId} already exists`);
      return;
    }

    const newClient: SynthClient = {
      id: clientId,
      connected: false,
      lastSeen: Date.now(),
      synthParams: { ...DEFAULT_SYNTH_PARAMS },
    };

    const newClients = new Map(clients.value);
    newClients.set(clientId, newClient);
    clients.value = newClients;

    addLog(`Added client ${clientId}`);
  }, [clients, addLog]);

  // Remove a client from the list
  const removeClient = useCallback((clientId: string) => {
    if (!webRTCServiceRef.current) return;
    addLog(
      `[ClientManager] UI Request to disconnect and remove client ${clientId}`,
    );
    webRTCServiceRef.current.disconnect(clientId);
    // Actual removal from `clients` map is handled by `handleClientRemovedFromWebRTC`
  }, [addLog]);

  // Connect to a client
  const connectToClient = useCallback(async (clientId: string) => {
    if (!webRTCServiceRef.current) return;
    if (!clients.value.has(clientId)) {
      // Call the memoized addClient if not already present
      // Note: addClient itself is memoized, so this is fine.
      addClient(clientId);
    }
    addLog(`Connecting to client ${clientId}`);
    await webRTCServiceRef.current.initRTC(clientId);
  }, [clients, addLog, addClient]);

  // Disconnect from a client
  const disconnectFromClient = useCallback((clientId: string) => {
    if (!webRTCServiceRef.current) return;
    webRTCServiceRef.current.disconnect(clientId);
  }, []);

  // Update a synth parameter for a client
  const updateClientSynthParam = useCallback((
    clientId: string,
    param: string,
    value: unknown,
  ) => {
    const client = clients.value.get(clientId);
    if (!client) {
      addLog(`Client ${clientId} not found`);
      return;
    }

    if (!webRTCServiceRef.current) return;

    // Handle special note_on and note_off commands
    if (param === "note_on" || param === "note_off") {
      // Send note message to client via data channel
      const success = webRTCServiceRef.current.sendMessageToClient(clientId, {
        type: param, // "note_on" or "note_off"
        ...(param === "note_on" ? { frequency: value } : {}),
      });

      if (success) {
        // Update oscillatorEnabled in UI state for visual feedback
        const currentParams = client.synthParams || { ...DEFAULT_SYNTH_PARAMS };
        const updatedParams: typeof currentParams = {
          ...currentParams,
          oscillatorEnabled: param === "note_on",
        };

        // Update client in state
        const updatedClient = {
          ...client,
          synthParams: updatedParams,
        };
        const newClients = new Map(clients.value);
        newClients.set(clientId, updatedClient);
        clients.value = newClients;

        addLog(
          `Sent ${param}${
            param === "note_on" ? ` with frequency=${value}` : ""
          } to ${clientId}`,
        );
      }
      return;
    }

    // Handle normal synth parameters
    const currentParams = client.synthParams || { ...DEFAULT_SYNTH_PARAMS };
    const updatedParams: typeof currentParams = {
      ...currentParams,
      [param]: value,
    };

    // Update client in state
    const updatedClient = {
      ...client,
      synthParams: updatedParams,
    };
    const newClients = new Map(clients.value);
    newClients.set(clientId, updatedClient);
    clients.value = newClients;

    // Send parameter update to client via data channel
    const success = webRTCServiceRef.current.sendMessageToClient(clientId, {
      type: "synth_param",
      param,
      value,
    });

    if (success) {
      addLog(`Sent ${param}=${value} to ${clientId}`);
    }
  }, [clients, addLog]);

  // Broadcast a parameter change to all connected clients - for global parameters
  const broadcastGlobalSynthParam = useCallback(
    (paramId: string, value: unknown) => {
      addLog(
        `Broadcasting global param update: ${paramId} = ${value} to ${connectedClientsCount.value} clients.`,
      );

      // Create a payload for the parameter update
      const payload = {
        type: "synth_param", // Synth client listens for this type
        param: paramId, // The ID of the global Default Mode parameter
        value: value, // The new value (e.g., SIN string, enum value)
      };

      // Use the WebRTCService to broadcast to all connected clients
      if (webRTCServiceRef.current) {
        const results = webRTCServiceRef.current.broadcastMessage(payload);

        let sentCount = 0;
        for (const success of results.values()) {
          if (success) sentCount++;
        }

        addLog(
          `Global parameter ${paramId} broadcast to ${sentCount}/${results.size} clients`,
        );
      }
    },
    [connectedClientsCount, addLog],
  );

  // Send a broadcast message to all connected clients
  const broadcastMessage = useCallback((message: string) => {
    if (message.trim() === "") {
      return;
    }

    if (!webRTCServiceRef.current) return;

    const results = webRTCServiceRef.current.broadcastMessage({
      type: "broadcast",
      message,
      source: controllerId.value,
    });

    let sentCount = 0;
    for (const success of results.values()) {
      if (success) sentCount++;
    }

    addLog(
      `Broadcast message sent to ${sentCount}/${results.size} clients: "${message}"`,
    );
  }, [controllerId, addLog]);

  // Start pinging clients at regular intervals
  const startPinging = useCallback((intervalMs = 5000) => {
    if (!webRTCServiceRef.current) return;
    webRTCServiceRef.current.startPing(intervalMs);
  }, []);

  // Stop pinging clients
  const stopPinging = useCallback(() => {
    if (!webRTCServiceRef.current) return;
    webRTCServiceRef.current.stopPing();
  }, []);

  // Ping a specific client and update its latency information
  const pingClient = useCallback(async (clientId: string) => {
    if (!webRTCServiceRef.current) {
      return { clientId, latency: -1, success: false };
    }
    const result: PingResult = await webRTCServiceRef.current.pingClient(
      clientId,
    );

    const client = clients.value.get(clientId);
    if (client) {
      const updatedClient: SynthClient = {
        ...client,
        latency: result.success ? result.latency : -1,
      };
      const newClients = new Map(clients.value);
      newClients.set(clientId, updatedClient);
      clients.value = newClients;
    }
    return result;
  }, [clients, addLog]);

  // Handle WebRTC signaling messages
  const handleClientOffer = useCallback((
    msg: { source: string; data: RTCSessionDescriptionInit; type: "offer" },
  ) => {
    if (!webRTCServiceRef.current) return;
    webRTCServiceRef.current.handleClientOffer(msg);
  }, []);

  const handleAnswerFromClient = useCallback((
    msg: { source: string; data: RTCSessionDescriptionInit; type: "answer" },
  ) => {
    if (!webRTCServiceRef.current) return;
    webRTCServiceRef.current.handleAnswerFromClient(msg);
  }, []);

  const handleIceCandidateFromClient = useCallback((
    msg: { source: string; data: RTCIceCandidateInit; type: "ice-candidate" },
  ) => {
    if (!webRTCServiceRef.current) return;
    webRTCServiceRef.current.handleIceCandidateFromClient(msg);
  }, []);

  return useMemo(() => ({
    clients,
    connectedClientsCount,
    connectedClients,
    addClient,
    removeClient,
    connectToClient,
    disconnectFromClient,
    updateClientSynthParam,
    broadcastGlobalSynthParam, // Added new method
    broadcastMessage,
    startPinging,
    stopPinging,
    pingClient,
    handleClientOffer,
    handleAnswerFromClient,
    handleIceCandidateFromClient,
  }), [
    clients, // Signal itself is stable
    connectedClientsCount, // Computed signal is stable
    connectedClients, // Computed signal is stable
    addClient,
    removeClient,
    connectToClient,
    disconnectFromClient,
    updateClientSynthParam,
    broadcastGlobalSynthParam, // Added to dependency array
    broadcastMessage,
    startPinging,
    stopPinging,
    pingClient,
    handleClientOffer,
    handleAnswerFromClient,
    handleIceCandidateFromClient,
  ]);
}
