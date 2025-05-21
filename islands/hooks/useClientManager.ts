import { computed, Signal } from "@preact/signals"; // Removed useSignal, useRef from here
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks"; // Keep useRef for internal debug logs if any
import type { SynthClient } from "../../lib/types/client.ts";
// WebRTCService is now imported dynamically within getOrCreateWebRTCServiceInstance
// import { WebRTCService } from "../../services/webrtcService.ts";
import { DEFAULT_SYNTH_PARAMS } from "../../lib/synth/index.ts";
import {
  getClientsSignal,
  getOrCreateWebRTCServiceInstance,
  store as clientManagerStore, // Direct access for functions using the instance
} from "./clientManagerStore.ts";
// Legacy mode imports - will be removed once instrumentDefinition is fully used
import { IKEDA_MODE_MVP_PARAMS } from "../../shared/modes/ikeda/params.ts";
import {
  ControllerMode,
  KNOWN_CONTROLLER_MODES,
} from "../../shared/controllerModes.ts";
import type { PingResult } from "../../services/webrtcService.ts";

export function useClientManager(
  controllerId: Signal<string>, // This is Controller's `id` signal
  wsSignal: { // This is Controller's `stableMemoizedWsSignalProp`
    sendMessage: (message: unknown) => void;
  },
) {
  const clients = getClientsSignal(); // Use shared signal from store
  const liveParamsGetterRef = useRef<(() => Record<string, unknown>) | null>(
    null,
  );

  // Callbacks for WebRTCService
  const handleConnectionStateChange = useCallback(
    (clientId: string, connected: boolean) => {
      const currentClient = clients.value.get(clientId);
      const newClientsMap = new Map(clients.value);
      if (connected) {
        if (currentClient) {
          const updatedClient: SynthClient = { ...currentClient, connected };
          newClientsMap.set(clientId, updatedClient);
        } else {
          const newClientEntry: SynthClient = {
            id: clientId,
            connected: true,
            lastSeen: Date.now(),
            synthParams: { ...DEFAULT_SYNTH_PARAMS }, // To be replaced by instrumentDefinition
          };
          newClientsMap.set(clientId, newClientEntry);
        }
        clients.value = newClientsMap;
      } else {
        if (currentClient) {
          const updatedClient: SynthClient = { ...currentClient, connected: false };
          newClientsMap.set(clientId, updatedClient);
          clients.value = newClientsMap;
        }
      }
    },
    [clients], // `clients` is from store, stable ref
  );

  const handleDataChannelMessage = useCallback(
    (clientId: string, channelLabel: string, data: unknown) => {
      console.log(`[ClientManager] Received message on [${channelLabel}] from ${clientId}:`, data);
      
      // Handle string messages (like our app_pong that will be coming from clients)
      if (typeof data === "string") {
        // Pass to onMessageFromClient callback if set
        if (clientManagerStore.onMessageFromClientCallback) {
          clientManagerStore.onMessageFromClientCallback(clientId, data, channelLabel);
        }
        return;
      }
      
      if (!data || typeof data !== "object") return;
      const typedData = data as { type: string; [key: string]: unknown };

      if (!clientManagerStore.webRTCServiceInstance) {
        console.warn("[ClientManager] WebRTCService instance not available for handling message:", typedData);
        return;
      }

      switch (typedData.type) {
        case "synth_status": { // Legacy
          const client = clients.value.get(clientId);
          if (client && typedData.params && typeof typedData.params === "object") {
            const updatedClient: SynthClient = {...client, synthParams: {...(client.synthParams || DEFAULT_SYNTH_PARAMS), ...typedData.params,},};
            const newClientsMap = new Map(clients.value);
            newClientsMap.set(clientId, updatedClient);
            clients.value = newClientsMap;
            console.log(`[ClientManager] Updated synth_status for ${clientId} (legacy message).`);
          }
          break;
        }
        case "request_instrument_definition":
          console.log(`[ClientManager] Client ${clientId} requested instrument definition on [${channelLabel}].`);
          if (clientManagerStore.webRTCServiceInstance) {
            const currentInstrumentDef = liveParamsGetterRef.current ? liveParamsGetterRef.current() : {};
            clientManagerStore.webRTCServiceInstance.sendMessageToClient(
              clientId,
              { type: "set_instrument_definition", definition: currentInstrumentDef, },
              "reliable_control"
            );
            console.log(`[ClientManager] Sent set_instrument_definition to ${clientId}.`);
          }
          break;
        case "instrument_specific_feedback":
            console.log(`[ClientManager] Received instrument_specific_feedback from ${clientId} on [${channelLabel}]:`, (typedData as any).feedback_data);
            break;
        default:
          // Pass all other message types to the controller's message handler if registered
          if (clientManagerStore.onMessageFromClientCallback) {
            // Convert the data back to a JSON string to match the expected format of the callback
            const messageString = JSON.stringify(typedData);
            clientManagerStore.onMessageFromClientCallback(clientId, messageString, channelLabel);
          } else {
            console.warn(
              `[ClientManager] Received unhandled message type on [${channelLabel}] from ${clientId}: ${typedData.type}, data:`, typedData
            );
          }
      }
    },
    [clients, liveParamsGetterRef], // `clients` from store, `liveParamsGetterRef` is local useRef
  );

  const handleDataChannelOpen = useCallback(
    (clientId: string, dataChannel: RTCDataChannel) => {
      console.log(`[ClientManager] Data channel [${dataChannel.label}] opened for client ${clientId}`);
      if (!clientManagerStore.webRTCServiceInstance) {
        console.warn("[ClientManager] WebRTCService instance not available for handleDataChannelOpen actions.");
        return;
      }
      if (dataChannel.label === "reliable_control") {
        // This logic will be replaced by sending the full instrumentDefinition
        const modeToSend = KNOWN_CONTROLLER_MODES.IKEDA; // Legacy
        clientManagerStore.webRTCServiceInstance.sendMessageToClient(
          clientId,
          { type: "controller_mode", mode: modeToSend, }, // Legacy
          "reliable_control",
        );
        console.log(`[DEBUG_MODE_CHANGE] Immediately sent mode=${modeToSend} to newly connected client ${clientId}`);

        // let paramsToSend: Record<string, unknown> = {};
        // if (liveParamsGetterRef.current) {
        //   paramsToSend = liveParamsGetterRef.current();
        // } else {
        //   console.warn( `[ClientManager] Warning: Live params getter not available for client ${clientId}. Sending empty initial params.`);
        // }
        // clientManagerStore.webRTCServiceInstance.sendMessageToClient(
        //   clientId,
        //   { type: "synth_params_full", params: paramsToSend, }, // Legacy
        //   "reliable_control",
        // );
        // console.log( `[ClientManager] Data channel [${dataChannel.label}] opened for ${clientId}. Sent full initial parameter set.`);
      }
    },
    [clients, liveParamsGetterRef] // `clients` from store, `liveParamsGetterRef` is local useRef
  );

  const handleDataChannelClose = useCallback(
    (clientId: string, channelLabel: string) => {
      console.log(`[ClientManager] Data channel [${channelLabel}] closed for client ${clientId}.`);
      const client = clients.value.get(clientId);
      if (client && channelLabel === "reliable_control") {
        const updatedClient: SynthClient = { ...client, connected: false };
        const newClientsMap = new Map(clients.value);
        newClientsMap.set(clientId, updatedClient);
        clients.value = newClientsMap;
      }
    },
    [clients], // `clients` from store
  );

  const handleClientRemovedFromWebRTC = useCallback(
    (clientId: string) => {
      const newClientsMap = new Map(clients.value);
      if (newClientsMap.delete(clientId)) {
        clients.value = newClientsMap;
        console.log(`[ClientManager] Client ${clientId} removed from state after WebRTC cleanup.`);
      }
    },
    [clients], // `clients` from store
  );

  useEffect(() => {
    const callbacks = {
      addLog: (text: string) => console.log(`[WebRTCService LOG by ClientManager]: ${text}`),
      onConnectionStateChange: handleConnectionStateChange,
      onDataChannelMessage: handleDataChannelMessage,
      onDataChannelOpen: handleDataChannelOpen,
      onDataChannelClose: handleDataChannelClose,
      onClientRemoved: handleClientRemovedFromWebRTC,
    };
    const initializeService = async () => {
      // Pass the stable controllerId signal and wsSignal wrapper from props
      await getOrCreateWebRTCServiceInstance(controllerId, wsSignal, callbacks);
      console.log("[ClientManager] Shared WebRTCService instance is ready/ensured.");
    };
    initializeService().catch(error => {
      console.error("[ClientManager] Error initializing WebRTCService instance from store:", error);
    });
  }, [
    controllerId, // Prop
    wsSignal,     // Prop
    handleConnectionStateChange, // useCallback, should be stable
    handleDataChannelMessage,    // useCallback, should be stable
    handleDataChannelOpen,       // useCallback, should be stable
    handleDataChannelClose,      // useCallback, should be stable
    handleClientRemovedFromWebRTC, // useCallback, should be stable
  ]);

  const setLiveParamsGetter = useCallback(
    (getter: () => Record<string, unknown>) => {
      liveParamsGetterRef.current = getter;
    },
    [] // Depends only on liveParamsGetterRef.current which is fine for useCallback
  );

  const addClient = useCallback(
    (clientId: string) => {
      if (clients.value.has(clientId)) { return; }
      const newClient: SynthClient = {id: clientId, connected: false, lastSeen: Date.now(), synthParams: {},};
      const newClients = new Map(clients.value);
      newClients.set(clientId, newClient);
      clients.value = newClients;
      console.log(`[ClientManager] Added client ${clientId} (params to be sent on data channel open).`);
    },
    [clients], // `clients` from store
  );

  const removeClient = useCallback((clientId: string) => {
    if (!clientManagerStore.webRTCServiceInstance) return;
    console.log(`[ClientManager] UI Request to disconnect and remove client ${clientId}`);
    clientManagerStore.webRTCServiceInstance.disconnect(clientId);
  }, []); // Uses module store instance

  const connectToClient = useCallback(async (clientId: string) => {
    if (!clientManagerStore.webRTCServiceInstance) return;
    if (!clients.value.has(clientId)) { addClient(clientId); } // addClient is stable
    console.log(`Connecting to client ${clientId}`);
    await clientManagerStore.webRTCServiceInstance.initRTC(clientId);
  }, [clients, addClient]); // `clients` from store, addClient is stable

  const disconnectFromClient = useCallback((clientId: string) => {
    if (!clientManagerStore.webRTCServiceInstance) return;
    clientManagerStore.webRTCServiceInstance.disconnect(clientId);
  }, []); // Uses module store instance

  const updateClientSynthParam = useCallback( // This is largely legacy, will be replaced by instrument definition updates
    (clientId: string, param: string, value: unknown) => {
      const client = clients.value.get(clientId);
      if (!client || !clientManagerStore.webRTCServiceInstance) return;
      if (param === "note_on" || param === "note_off") { // Legacy note handling
        const success = clientManagerStore.webRTCServiceInstance.sendMessageToClient(clientId, {type: param, ...(param === "note_on" ? { frequency: value } : {}),}, "reliable_control");
        // TODO: Update local UI state if needed, but this path is legacy
      } else { // Legacy general param handling
        const updatedParams = {...(client.synthParams || DEFAULT_SYNTH_PARAMS), [param]: value,};
        const updatedClient = {...client, synthParams: updatedParams,};
        const newClients = new Map(clients.value);
        newClients.set(clientId, updatedClient);
        clients.value = newClients;
        clientManagerStore.webRTCServiceInstance.sendMessageToClient(clientId, {type: "synth_param", param, value,}, "reliable_control");
      }
    },
    [clients], // `clients` from store
  );

  const broadcastGlobalSynthParam = useCallback( // Legacy, to be replaced by instrument definition broadcast
    (paramId: string, value: unknown) => {
      if (!clientManagerStore.webRTCServiceInstance) return;
      const payload = {type: "synth_param", param: paramId, value: value,};
      clientManagerStore.webRTCServiceInstance.broadcastMessage(payload, "reliable_control");
      // Simplified logging, detailed counts can be added if needed
      console.log(`Broadcast legacy global param: ${paramId}=${value}`);
    },
    [], // Uses module store instance
  );

  const broadcastMessage = useCallback(
    (message: string, channelLabel: "reliable_control" | "streaming_updates" = "reliable_control") => {
      if (!clientManagerStore.webRTCServiceInstance || message.trim() === "") return;
      const results = clientManagerStore.webRTCServiceInstance.broadcastMessage(message, channelLabel);
      let sentCount = 0;
      for (const success of results.values()) { if (success) sentCount++; }
      console.log(`Broadcast message sent on [${channelLabel}] to ${sentCount}/${results.size} clients: \"${message}\"`);
    },
    [], // Uses module store instance. controllerId for source was removed from payload.
  );
  
  const sendMessageToClient = useCallback(
    (
      clientId: string,
      message: unknown, // string or object to be stringified by WebRTCService
      channelLabel: "reliable_control" | "streaming_updates" = "reliable_control"
    ): boolean => {
      if (!clientManagerStore.webRTCServiceInstance) {
        console.warn("[ClientManager] WebRTCService not available for sendMessageToClient.");
        return false;
      }
      return clientManagerStore.webRTCServiceInstance.sendMessageToClient(
        clientId,
        message,
        channelLabel
      );
    },
    [] // Relies on the store instance
  );


  const handleClientOffer = useCallback(
    (msg: { source: string; data: RTCSessionDescriptionInit; type: "offer" }) => {
      if (!clientManagerStore.webRTCServiceInstance) return;
      clientManagerStore.webRTCServiceInstance.handleClientOffer(msg);
    },
    [], // Uses module store instance
  );

  const handleAnswerFromClient = useCallback(
    (msg: { source: string; data: RTCSessionDescriptionInit; type: "answer" }) => {
      if (!clientManagerStore.webRTCServiceInstance) return;
      clientManagerStore.webRTCServiceInstance.handleAnswerFromClient(msg);
    },
    [], // Uses module store instance
  );

  const handleIceCandidateFromClient = useCallback(
    (msg: { source: string; data: RTCIceCandidateInit; type: "ice-candidate" }) => {
      if (!clientManagerStore.webRTCServiceInstance) return;
      clientManagerStore.webRTCServiceInstance.handleIceCandidateFromClient(msg);
    },
    [], // Uses module store instance
  );

  const streamResolvedParameterUpdate = useCallback(
    (clientId: string, parameterName: string, value: unknown) => {
      if (!clientManagerStore.webRTCServiceInstance) {
        console.warn("[ClientManager] WebRTCService not available for streamResolvedParameterUpdate.");
        return;
      }
      const timestamp = Date.now();
      const message = {type: "streamed_resolved_param_update", p: parameterName, v: value, t: timestamp,};
      const success = clientManagerStore.webRTCServiceInstance.sendMessageToClient(clientId, message, "streaming_updates");
      if (!success) { console.warn(`[ClientManager] Failed to send streamed update for ${parameterName} to ${clientId}`); }
    },
    [], // Uses module store instance
  );
  
  const setMessageFromClientCallback = useCallback(
    (callback: (clientId: string, messageString: string, channelLabel: string) => void) => {
      clientManagerStore.onMessageFromClientCallback = callback;
    },
    [] // No dependencies needed
  );

  // Remove internal HANG_DEBUG stability checks from here

  return useMemo(() => ({
    clients, // From store, stable signal reference
    // connectedClientsCount, // Moved to Controller.tsx
    // connectedClients,    // Moved to Controller.tsx
    addClient,
    removeClient,
    connectToClient,
    disconnectFromClient,
    updateClientSynthParam,       // Will be refactored for instrument definitions
    broadcastGlobalSynthParam,  // Will be refactored
    broadcastMessage,
    sendMessageToClient,
    handleClientOffer,
    handleAnswerFromClient,
    handleIceCandidateFromClient,
    setLiveParamsGetter,
    streamResolvedParameterUpdate,
    setMessageFromClientCallback,
  }), [
    clients, // Stable signal reference from store
    addClient, removeClient, connectToClient, disconnectFromClient,
    updateClientSynthParam, broadcastGlobalSynthParam, broadcastMessage, sendMessageToClient,
    handleClientOffer, handleAnswerFromClient, handleIceCandidateFromClient,
    setLiveParamsGetter, streamResolvedParameterUpdate, setMessageFromClientCallback,
    // All functions above *should* now be stable because their own
    // useCallback dependencies are stable (empty, or stable refs/signals like `clients`, `controllerId`, `liveParamsGetterRef`).
  ]);
}
