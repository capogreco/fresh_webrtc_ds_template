// Preact component
import { computed, useSignal } from "@preact/signals";
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { WebSocketMessage } from "./hooks/useWebSocketSignaling.ts";
import {
  requestWakeLock,
  setupWakeLockListeners,
  type WakeLockSentinel,
} from "../lib/utils/wakeLock.ts";
import { useWebSocketSignaling } from "./hooks/useWebSocketSignaling.ts";
import { useClientManager } from "./hooks/useClientManager.ts";
import { formatTime } from "../lib/utils/formatTime.ts";
import { ClientList } from "../components/controller/ClientList.tsx";
import { LogDisplay } from "../components/controller/LogDisplay.tsx";
import { BroadcastMessageForm } from "../components/controller/BroadcastMessageForm.tsx";
import { AddClientForm } from "../components/controller/AddClientForm.tsx";
import { ClientManagerProvider } from "../lib/contexts.ts";
import {
  ControllerMode,
  KNOWN_CONTROLLER_MODES,
} from "../shared/controllerModes.ts";
import { MODE_PARAMS_MAP } from "../shared/modes/index.ts";
import { SynthControls } from "../components/controller/SynthControls.tsx";

interface ControllerProps {
  user: {
    email: string;
    name: string;
    id: string;
  };
  clientId: string; // Unique client ID for this controller instance
}

export default function Controller({ user, clientId }: ControllerProps) {
  // Use the server-provided client ID
  const id = useSignal(clientId);
  const logs = useSignal<string[]>([]);
  const wakeLock = useSignal<WakeLockSentinel | null>(null);
  const _statusCheckInterval = useSignal<number | null>(null);
  const _otherController = useSignal<{ userId: string; name: string } | null>(
    null,
  );
  const _checkingControllerStatus = useSignal(false);
  const clientManagerInstanceRef = useRef<ReturnType<
    typeof useClientManager
  > | null>(null);
  const pingSentTimesRef = useRef<Map<string, number>>(new Map());

  // Add a log entry - memoized
  const addLog = useCallback(
    (text: string) => {
      logs.value = [...logs.value, `${formatTime()}: ${text}`];
      // Scroll to bottom
      setTimeout(() => {
        const logEl = document.querySelector(".log");
        if (logEl) logEl.scrollTop = logEl.scrollHeight;
      }, 0);
    },
    [logs]
  ); // logs signal reference is stable

  // Function to handle messages from clients
  const onMessageFromClient = useCallback(
    (clientId: string, messageString: string, channelLabel: string) => {
      try {
        const parsedMsg = JSON.parse(messageString);
        addLog(`[Controller] Msg from ${clientId} on [${channelLabel}]: type=${parsedMsg.type}`);

        if (parsedMsg.type === "app_pong" && parsedMsg.original_timestamp !== undefined) {
          const originalSentTime = pingSentTimesRef.current.get(clientId);
          
          if (originalSentTime === parsedMsg.original_timestamp) {
            const rttMs = Date.now() - originalSentTime;
            const latencyMs = rttMs / 2;

            pingSentTimesRef.current.delete(clientId); 

            if (clientManagerInstanceRef.current && clientManagerInstanceRef.current.clients) {
              const currentClientsMap = clientManagerInstanceRef.current.clients.value;
              if (currentClientsMap.has(clientId)) {
                const newClientsMap = new Map(currentClientsMap);
                const clientToUpdate = newClientsMap.get(clientId)!; 
                
                const updatedClient = {
                  ...clientToUpdate,
                  latency: latencyMs,
                  staleLatency: false, 
                };
                newClientsMap.set(clientId, updatedClient);
                clientManagerInstanceRef.current.clients.value = newClientsMap; 
                
                // console.log(`[Controller AppPing] Latency for ${clientId}: ${latencyMs.toFixed(0)}ms (RTT: ${rttMs}ms)`);
              }
            }
          } else if (originalSentTime) {
            console.warn(`[Controller AppPing] Pong from ${clientId} for mismatched ping. Stored: ${originalSentTime}, Pong's: ${parsedMsg.original_timestamp}`);
          } else {
            // console.warn(`[Controller AppPing] Pong from ${clientId} but no ping registered (or already processed).`);
          }
        } else if (parsedMsg.type === "audio_state") {
          addLog(
            `[Controller] Client ${clientId} audio state: ${JSON.stringify(parsedMsg.audioState)}`
          );
          // Potentially update client's audio state representation in the controller UI
          const currentClientsMap = clientManagerInstanceRef.current?.clients.value;
          if (currentClientsMap && currentClientsMap.has(clientId)) {
              const newClientsMap = new Map(currentClientsMap);
              const clientToUpdate = newClientsMap.get(clientId)!;
              const updatedClient = { ...clientToUpdate, audioState: parsedMsg.audioState }; // Assuming SynthClient has audioState
              newClientsMap.set(clientId, updatedClient);
              if (clientManagerInstanceRef.current) clientManagerInstanceRef.current.clients.value = newClientsMap;
          }

        } else if (parsedMsg.type === "request_instrument_definition") {
          // This should NOT be happening if client fix is working, but good to log if it does.
          addLog(`[Controller] Warning: Received unexpected request_instrument_definition from ${clientId}`);
        } else {
          addLog(`[Controller] Unhandled message type '${parsedMsg.type || "unknown"}' from ${clientId} on [${channelLabel}]`);
        }
      } catch (error) {
        addLog(`[Controller] Error parsing message from ${clientId} on [${channelLabel}]: ${messageString}. Error: ${error}`);
      }
    },
    [addLog, clientManagerInstanceRef, pingSentTimesRef] // Ensure all dependencies are included
  );

  // Function to get the current live global parameters for Ikeda synth
  const getLiveGlobalParams = useCallback((): any => {
    return {
      instrument_id: "ikeda_synth_v1",
      synth_engine: { type: "ikeda_engine_v1" },
      global_settings: {
        active: { 
          is_resolved: true, 
          value: true, 
          update_channel: "reliable"
        },
        tempo_cpm: { 
          is_resolved: true, 
          value: 120, 
          update_channel: "streaming"
        },
        beats_per_global_cycle: { 
          is_resolved: true, 
          value: 4, 
          update_channel: "reliable"
        },
      },
      parameters: {
        // Pink Noise Layer
        pink_noise_active: { 
          is_resolved: true, 
          value: true, 
          update_channel: "reliable"
        },
        pink_noise_volume: { 
          is_resolved: true, 
          value: 0.5, 
          update_channel: "streaming"
        },
        pink_noise_reverb_wet_dry: { 
          is_resolved: true, 
          value: 0.3, 
          update_channel: "reliable"
        },
        pink_noise_lfo_rate_rule: {
          is_resolved: false,
          value: {
            rule_type: "harmonic_ratio_cpm",
            numerator: { 
              values: [1], 
              selection_mode: "static" 
            },
            denominator: { 
              values: [1, 2, 4, 8], 
              selection_mode: "static" 
            },
          },
          update_channel: "reliable",
        },
        pink_noise_lfo_shape: { 
          is_resolved: true, 
          value: "sine", 
          update_channel: "reliable" 
        },
        pink_noise_lfo_initial_phase_randomized: { 
          is_resolved: true, 
          value: true, 
          update_channel: "reliable" 
        },

        // Blips Layer
        blip_active: { 
          is_resolved: true, 
          value: true, 
          update_channel: "reliable" 
        },
        blip_base_f0_hz: { 
          is_resolved: true, 
          value: 220, 
          update_channel: "streaming" 
        },
        blip_pitch_harmonic_ratio_rule: {
          is_resolved: false,
          value: {
            rule_type: "harmonic_ratio_pitch",
            numerator: { 
              values: [1, 2, 3, 4], 
              selection_mode: "static" 
            },
            denominator: { 
              values: [1, 2, 3, 4], 
              selection_mode: "static" 
            },
          },
          update_channel: "reliable",
        },
        blip_duration_ms: { 
          is_resolved: true, 
          value: 100, 
          update_channel: "reliable" 
        },
        blip_euclidean_rhythm_rule: {
          is_resolved: false,
          value: {
            rule_type: "euclidean_rhythm_trigger",
            pulses: { 
              values: [3], 
              selection_mode: "static" 
            },
            steps: { 
              values: [8], 
              selection_mode: "static" 
            },
            offset: { 
              values: [0], 
              selection_mode: "static" 
            },
          },
          update_channel: "reliable",
        },
        blip_amplitude: { 
          is_resolved: true, 
          value: 0.7, 
          update_channel: "streaming" 
        },
        blip_reverb_wet_dry: { 
          is_resolved: true, 
          value: 0.2, 
          update_channel: "reliable" 
        },
        blip_timbre_source: { 
          is_resolved: true, 
          value: "sine_env", 
          update_channel: "reliable" 
        },

        // Clicks Layer
        click_active: { 
          is_resolved: true, 
          value: true, 
          update_channel: "reliable" 
        },
        click_timbre_source: { 
          is_resolved: true, 
          value: "digital_impulse", 
          update_channel: "reliable" 
        },
        click_length_ms: { 
          is_resolved: true, 
          value: 1.0, 
          update_channel: "reliable" 
        },
        click_euclidean_rhythm_rule: {
          is_resolved: false,
          value: {
            rule_type: "euclidean_rhythm_trigger",
            pulses: { 
              values: [4], 
              selection_mode: "static" 
            },
            steps: { 
              values: [16], 
              selection_mode: "static" 
            },
            offset: { 
              values: [0], 
              selection_mode: "static" 
            },
          },
          update_channel: "reliable",
        },
        click_reverb_wet_dry: { 
          is_resolved: true, 
          value: 0.1, 
          update_channel: "reliable" 
        },

        // White Noise Snare Layer
        snare_active_after_reset: { 
          is_resolved: true, 
          value: true, 
          update_channel: "reliable" 
        },
        snare_timbre_source: { 
          is_resolved: true, 
          value: "white_noise_rectangular_env", 
          update_channel: "reliable" 
        },
        snare_duration_beats: { 
          is_resolved: true, 
          value: 1, 
          update_channel: "reliable" 
        },
        snare_amplitude: { 
          is_resolved: true, 
          value: 0.8, 
          update_channel: "reliable" 
        },
        snare_reverb_wet_dry: { 
          is_resolved: true, 
          value: 0.25, 
          update_channel: "reliable" 
        },
        snare_target_beat_in_cycle: { 
          is_resolved: true, 
          value: 3, 
          update_channel: "reliable" 
        },
      },
    };
  }, []); // No dependencies needed for this implementation

  // TODO: paramDescriptorsForClientList will need to be redefined based on new instrumentDefinition structure
  // For now, ClientList will receive an empty array.

  // TODO: Implement logic to send instrumentDefinition to clients upon connection
  // and when the definition changes.
  // Placeholder for broadcasting logic (will be part of sending instrumentDefinition)
  const broadcastInstrumentDefinition = useCallback(() => {
    addLog(`[Controller] TODO: Implement broadcastInstrumentDefinition.`);
    // Example structure (will be more complex):
    // const currentInstrumentDef = { type: "set_instrument_definition", definition: { ... } };
    // clientManagerInstanceRef.current?.broadcastMessage(JSON.stringify(currentInstrumentDef));
  }, [addLog, clientManagerInstanceRef]);

  // useEffect for initial setup or when major states change (e.g., connection)
  // This useEffect used to initialize parameters based on old mode system.
  // It will be repurposed or new effects will be created for the instrumentDefinition system.
  useEffect(() => {
    addLog(
      "[Controller] Initial useEffect for instrument definition system (placeholder).",
    );
    // Example: load a default instrument definition and broadcast it
    // broadcastInstrumentDefinition();
  }, [broadcastInstrumentDefinition, addLog]); // Dependencies will change

  // Internal logic for when controller is kicked - memoized
  const handleControllerKickedInternalLogic = useCallback(
    (newControllerId: string) => {
      addLog(`Controller kicked by ${newControllerId}`);
      clientManagerInstanceRef.current?.stopPinging();
      if (clientManagerInstanceRef.current) {
        const clientIds = Array.from(
          clientManagerInstanceRef.current.clients.value.keys(),
        );
        clientIds.forEach((clientId) =>
          clientManagerInstanceRef.current!.disconnectFromClient(clientId),
        );
      }
    },
    [addLog],
  );

  // Memoized callbacks for useWebSocketSignaling
  // These callbacks primarily depend on `addLog` for logging UI updates.
  // They also invoke methods on `clientManagerInstanceRef.current`.
  // The stability of `clientManagerInstanceRef.current` is crucial. It is set by a
  // `useEffect` hook that depends on `_clientManagerFromHook`.
  // With the `clientManagerStore` pattern, `_clientManagerFromHook` is expected
  // to be a stable reference after initial setup, making `clientManagerInstanceRef.current`
  // also stable once set. Therefore, not including `_clientManagerFromHook` or
  // `clientManagerInstanceRef` directly in these callback dependency arrays is acceptable
  // as long as `addLog` is stable and the methods are called with optional chaining
  // to handle potential null `current` during initial renders.
  const onOfferReceivedCallback = useCallback(
    (msg: {
      source: string;
      data: RTCSessionDescriptionInit;
      type: "offer";
    }) => {
      console.log(
        "[Controller] onOfferReceivedCallback FIRED for source:",
        msg.source,
      ); // <--- ADD THIS
      addLog(`[Controller] Hook: Offer received from ${msg.source}`);
      clientManagerInstanceRef.current?.handleClientOffer?.(msg);
    },
    [addLog],
  );

  const onAnswerReceivedCallback = useCallback(
    (msg: {
      source: string;
      data: RTCSessionDescriptionInit;
      type: "answer";
    }) => {
      console.log(
        "[Controller] onAnswerReceivedCallback FIRED for source:",
        msg.source,
      ); // <--- ADD THIS
      addLog(`[Controller] Hook: Answer received from ${msg.source}`);
      clientManagerInstanceRef.current?.handleAnswerFromClient?.(msg);
    },
    [addLog],
  );

  const onIceCandidateReceivedCallback = useCallback(
    (msg: {
      source: string;
      data: RTCIceCandidateInit;
      type: "ice-candidate";
    }) => {
      console.log(
        "[Controller] onIceCandidateReceivedCallback FIRED for source:",
        msg.source,
      ); // <--- ADD THIS
      addLog(`[Controller] Hook: ICE candidate received from ${msg.source}`);
      clientManagerInstanceRef.current?.handleIceCandidateFromClient?.(msg);
    },
    [addLog],
  );

  const onControllerKickedCallback = useCallback(
    (newControllerId: string) => {
      addLog(
        `[Controller] Hook: Controller kicked, new controller: ${newControllerId}`,
      );
      handleControllerKickedInternalLogic(newControllerId);
    },
    [addLog, handleControllerKickedInternalLogic],
  );

  const onClientDisconnectedCallback = useCallback(
    (clientId: string) => {
      addLog(
        `[Controller] Hook: Client ${clientId} disconnected via signaling.`,
      );
      clientManagerInstanceRef.current?.removeClient?.(clientId);
    },
    [addLog],
  );

  const onServerErrorCallback = useCallback(
    (errorMessage: string, details?: string) => {
      addLog(
        `[Controller] Hook: Server WebSocket Error: ${errorMessage}${
          details ? ` - Details: ${details}` : ""
        }`,
      );
    },
    [addLog],
  );

  // Setup WebSocket Signaling Hook
  const wsSignal = useWebSocketSignaling({
    controllerId: id, // id signal ref is stable
    // addLog, // No longer passed; useWebSocketSignaling uses console.log internally
    onOfferReceived: onOfferReceivedCallback,
    onAnswerReceived: onAnswerReceivedCallback,
    onIceCandidateReceived: onIceCandidateReceivedCallback,
    onControllerKicked: onControllerKickedCallback,
    onClientDisconnected: onClientDisconnectedCallback,
    onServerError: onServerErrorCallback,
  });

  // Computed signal for controller active state
  const controlActive = computed(() => wsSignal.isConnected.value);

  // Initialize client manager
  // const memoizedWsSignalProp = useMemo(() => ({
  //   sendMessage: (message: unknown) =>
  //     wsSignal.sendMessage(message as WebSocketMessage),
  // }), [wsSignal.sendMessage]); // wsSignal.sendMessage is stable from useWebSocketSignaling

  // FOR DEBUGGING HANG: dummyWsSendMessage and stableMemoizedWsSignalProp removed.
  // Using real wsSignal for useClientManager.

  const dummyAddLog = useCallback(() => {
    /* Do nothing */ console.log(
      "[Controller] dummyAddLog called - this should not affect logs signal",
    );
  }, []);

  const _clientManagerFromHook = useClientManager(
    id,
    wsSignal, // Use the real wsSignal object from useWebSocketSignaling
    // dummyAddLog, // No longer passing addLog to useClientManager
  );
  // End HANG_DEBUG log

  // HANG_DEBUG: Define computed signals locally based on the client manager's clients signal
  // Ensure _clientManagerFromHook and its clients property are accessed safely,
  // especially on initial render or if _clientManagerFromHook could be null/undefined.
  const connectedClientsCount = computed(() => {
    if (!_clientManagerFromHook || !_clientManagerFromHook.clients) {
      return 0;
    }
    const count = Array.from(
      _clientManagerFromHook.clients.value.values(),
    ).filter((client) => client.connected).length;
    // HANG_DEBUG: Log the computed count value itself
    // console.log("[Controller DEBUG] local connectedClientsCount.value (from computed):", count); // Reduced noise
    return count;
  });

  // Placeholder for connectedClients if needed by ClientList directly,
  // though ClientList currently takes clients.value directly.
  // const connectedClients = computed(() => {
  //   if (!_clientManagerFromHook || !_clientManagerFromHook.clients) {
  //     return new Map();
  //   }
  //   return Array.from(_clientManagerFromHook.clients.value.entries())
  //     .filter(([_, client]) => client.connected)
  //     .reduce((map, [id, client]) => {
  //       map.set(id, client);
  //       return map;
  //     }, new Map<string, SynthClient>());
  // });

  // Function to handle messages from clients
  // onMessageFromClient has been moved to the top of the file

  useEffect(() => {
    clientManagerInstanceRef.current = _clientManagerFromHook;
    // Provide the client manager with a way to get the live parameters
    if (
      clientManagerInstanceRef.current &&
      typeof (clientManagerInstanceRef.current as any).setLiveParamsGetter ===
        "function"
    ) {
      // HANG_DEBUG: Cast to any
      (clientManagerInstanceRef.current as any).setLiveParamsGetter(
        getLiveGlobalParams,
      ); // HANG_DEBUG: Cast to any
      addLog("[Controller] Set live params getter on ClientManager instance.");
    } else if (clientManagerInstanceRef.current) {
      // This warning is useful if useClientManager's return type changes.
      console.warn(
        "[Controller] clientManagerInstanceRef.current.setLiveParamsGetter is NOT a function. Current keys:",
        Object.keys(clientManagerInstanceRef.current),
      );
    }
    
    // Register the message handler callback
    if (
      clientManagerInstanceRef.current &&
      typeof (clientManagerInstanceRef.current as any).setMessageFromClientCallback ===
        "function"
    ) {
      (clientManagerInstanceRef.current as any).setMessageFromClientCallback(
        onMessageFromClient
      );
      addLog("[Controller] Registered onMessageFromClient handler with ClientManager.");
    } else if (clientManagerInstanceRef.current) {
      console.warn(
        "[Controller] clientManagerInstanceRef.current.setMessageFromClientCallback is NOT a function. Current keys:",
        Object.keys(clientManagerInstanceRef.current),
      );
    }
  }, [_clientManagerFromHook, getLiveGlobalParams, addLog, onMessageFromClient]);

  // Public handler for controller kicked (if needed elsewhere, though now internal logic is primary)
  // This is mostly for completeness if other parts of Controller might call it.
  const handleControllerKicked = handleControllerKickedInternalLogic;

  // Method to handle broadcast messages - memoized
  const handleBroadcastMessage = useCallback((message: string) => {
    if (message.trim() === "") {
      return;
    }
    clientManagerInstanceRef.current?.broadcastMessage(message);
  }, []); // Depends on methods from clientManagerInstanceRef.current

  // Method to handle adding a new client - memoized
  const handleAddClient = useCallback(
    (newClientId: string) => {
      if (newClientId.trim() === "") {
        return;
      }
      clientManagerInstanceRef.current?.addClient(newClientId);
      addLog(`Added client: ${newClientId}`);
    },
    [addLog, clientManagerInstanceRef],
  ); // clientManagerInstanceRef was missing from deps

  // TODO: Implement methods for creating/updating/sending instrument definitions.
  // Placeholder for a generic parameter change handler for the new system.
  const handleInstrumentParameterChange = useCallback(
    (parameterPath: string, newValue: unknown) => {
      addLog(
        `[Controller] TODO: handleInstrumentParameterChange for ${parameterPath} to ${newValue}`,
      );
      // This would involve:
      // 1. Updating the local state of the current instrumentDefinition.
      // 2. Deciding whether to send a full definition, a partial update, or a streamed update
      //    based on the parameter's "update_channel" and the nature of the change.
      // Example:
      // const updateMessage = { type: "update_instrument_definition_partial", path: parameterPath, new_value: newValue };
      // clientManagerInstanceRef.current?.broadcastMessage(JSON.stringify(updateMessage));
      // OR for streamed:
      // const streamedUpdate = { type: "streamed_resolved_param_update", p: parameterPath, v: newValue, t: Date.now() };
      // clientManagerInstanceRef.current?.broadcastStreamedUpdate(streamedUpdate); // (needs new method in clientManager)
    },
    [addLog, clientManagerInstanceRef],
  );

  // Effect to set up the controller on mount
  useEffect(() => {
    addLog("Controller mounted. Setting up connections and wake lock.");
    // TODO: Re-enable wake lock logic once core stability is confirmed and features are built.
    // // Request wake lock to prevent screen from sleeping
    // const activateWakeLock = async () => {
    //   try {
    //     const lock = await requestWakeLock();
    //     wakeLock.value = lock;
    //     // addLog("Activated wake lock to prevent screen from sleeping");
    //   } catch (error) {
    //     // addLog(`Error activating wake lock: ${error}`);
    //     console.warn("Error activating wake lock:", error);
    //   }
    // };

    // // Setup wake lock event listeners (screen visibility changes)
    // setupWakeLockListeners(() => wakeLock.value, activateWakeLock);

    // Connect to WebSocket
    wsSignal
      .connect()
      .then(() => {
        addLog("Controller active and connected to signaling server");

        if (
          clientManagerInstanceRef.current &&
          typeof (clientManagerInstanceRef.current as any).startPinging ===
            "function"
        ) {
          // (clientManagerInstanceRef.current as any).startPinging(5000);
        }
      })
      .catch((error) => {
        addLog(`Failed to connect to signaling server: ${error}`);
        console.error("Failed to connect to signaling server:", error);
      });

    // Cleanup function when component unmounts
    return () => {
      addLog("Controller unmounting. Cleaning up.");
      // HANG_DEBUG: Pinging and wake lock cleanup still commented (for now)
      // // Stop pinging capability has been removed

      // Disconnect WebSocket
      wsSignal.disconnect();

      // // Release wake lock
      // if (wakeLock.value) {
      //   wakeLock.value.release()
      //     .then(() => console.log("Wake lock released"))
      //     .catch((err) => console.error("Error releasing wake lock:", err));
      //   wakeLock.value = null;
      // }

      // // Clear any intervals
      // if (_statusCheckInterval.value !== null) {
      //   clearInterval(_statusCheckInterval.value);
      //   _statusCheckInterval.value = null;
      // }
    };
  }, []);
  
  // Effect for periodic ping sending
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (clientManagerInstanceRef.current && clientManagerInstanceRef.current.clients && clientManagerInstanceRef.current.sendMessageToClient) {
        const clientIds = Array.from(clientManagerInstanceRef.current.clients.value.keys());
        
        clientIds.forEach(clientId => {
          const client = clientManagerInstanceRef.current.clients.value.get(clientId);
          if (client && client.connected) { // Only ping connected clients
            const now = Date.now();
            pingSentTimesRef.current.set(clientId, now);
            
            const pingMsg = { type: "app_ping", timestamp: now };
            const success = clientManagerInstanceRef.current.sendMessageToClient(
              clientId,
              JSON.stringify(pingMsg), // Ensure message is stringified
              "reliable_control"
            );
            if (success) {
              // console.log(`[Controller AppPing] Sent app_ping to ${clientId} at ${now}`);
            } else {
              // console.warn(`[Controller AppPing] Failed to send app_ping to ${clientId}`);
              pingSentTimesRef.current.delete(clientId); // Clean up if send failed immediately
            }
          }
        });
      }
    }, 3000); // Send a ping every 3 seconds

    return () => clearInterval(pingInterval);
  }, [clientManagerInstanceRef]); // Dependency array

  return (
    <div class="container controller-panel">
      <h1>WebRTC Controller</h1>

      <div class="user-info">
        <div>
          <strong>User:</strong> {user.name} ({user.email})
        </div>
        <div>
          <strong>Controller ID:</strong> {id.value}
        </div>
        <div
          class={`controller-status ${
            controlActive.value ? "active" : "inactive"
          }`}
        >
          {controlActive.value ? "Active" : "Inactive"}
        </div>
        <div>
          <strong>Connected Clients (direct):</strong>{" "}
          {_clientManagerFromHook?.clients
            ? String(
                Array.from(
                  _clientManagerFromHook.clients.value.values(),
                ).filter((c) => c.connected).length,
              )
            : "0 (cm_null)"}
        </div>
        <div>
          <strong>Connected Clients (computed):</strong>{" "}
          {connectedClientsCount.value ?? "N/A"}
        </div>
        <div>
          <strong>Instrument Active:</strong>{" "}
          {/* TODO: Display current instrument_id */}
        </div>
      </div>

      {/* TODO: UI for selecting, editing, and managing instrumentDefinitions will go here */}
      <div
        class="instrument-controls section-box"
        style="margin-bottom: 20px; padding: 15px; border: 1px solid var(--border-color); border-radius: 8px;"
      >
        <h2>Instrument Controls (Placeholder)</h2>
        <p>
          Controls for the active instrument definition will be rendered here.
        </p>
        {/* Example: <InstrumentEditor currentDefinition={...} onParamChange={handleInstrumentParameterChange} /> */}
      </div>

      <ClientManagerProvider value={clientManagerInstanceRef.current}>
        <ClientList
          clients={clientManagerInstanceRef.current?.clients.value ?? new Map()}
          onConnect={clientManagerInstanceRef.current?.connectToClient ??
            (() => {})}
          onDisconnect={clientManagerInstanceRef.current
            ?.disconnectFromClient ??
            (() => {})}
          onSynthParamChange={clientManagerInstanceRef.current
            ?.updateClientSynthParam ?? (() => {})}
          paramDescriptors={[]}
        />

        <AddClientForm
          onAddClient={handleAddClient}
          disabled={!controlActive.value}
        />

        <BroadcastMessageForm
          onSend={handleBroadcastMessage}
          disabled={!controlActive.value}
        />

        <div class="form-container section-box" style="margin-top:15px;">
          <button
            type="button"
            class="button"
            onClick={() => {
              if (clientManagerInstanceRef.current && typeof (clientManagerInstanceRef.current as any).broadcastMessage === 'function') {
                const testMessage = JSON.stringify({
                  type: "test_stream",
                  content: "Hello from streaming_updates channel!",
                  timestamp: Date.now(),
                });
                (clientManagerInstanceRef.current as any).broadcastMessage(
                  testMessage,
                  "streaming_updates",
                );
                addLog("Sent test broadcast on streaming_updates channel.");
              } else {
                addLog("[Controller] Test Streaming Channel button: broadcastMessage not available or manager not ready.");
              }
            }}
            disabled={!controlActive.value || (connectedClientsCount.value ?? 0) === 0}
          >
            Send Test on Streaming Channel
          </button>
        </div>
      </ClientManagerProvider>

      <LogDisplay logs={logs.value} />
    </div>
  );
}
