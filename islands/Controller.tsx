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
  const clientManagerInstanceRef = useRef<
    ReturnType<typeof useClientManager> | null
  >(null);

  // Current controller mode - set to IKEDA for MVP
  const currentMode = useSignal<ControllerMode>(ControllerMode.IKEDA);

  // Global state for Default Mode parameters
  const globalDefaultModeParamsState = useSignal<Record<string, unknown>>({});

  // Computed signal for parameters to pass to ClientList
  const paramDescriptorsForClientList = computed(() => {
    if (
      currentMode.value !== KNOWN_CONTROLLER_MODES.DEFAULT &&
      MODE_PARAMS_MAP[currentMode.value]
    ) {
      return MODE_PARAMS_MAP[currentMode.value];
    }
    // For Default Mode, ClientList won't show main controls
    return [];
  });

  // Add a log entry - memoized
  const addLog = useCallback((text: string) => {
    logs.value = [...logs.value, `${formatTime()}: ${text}`];
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector(".log");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 0);
  }, [logs]); // logs signal reference is stable

  // Method to broadcast current mode to all clients
  const broadcastCurrentMode = useCallback(() => {
    addLog(
      `[DEBUG_MODE_BROADCAST] Broadcasting current mode (${currentMode.value}) to all clients`,
    );
    if (clientManagerInstanceRef.current) {
      clientManagerInstanceRef.current.broadcastMessage({
        type: "controller_mode",
        mode: currentMode.value,
      });
    }
  }, [currentMode.value, addLog]);

  // Initialize global default mode parameters
  useEffect(() => {
    if (currentMode.value === KNOWN_CONTROLLER_MODES.DEFAULT) {
      const initialDefaults: Record<string, unknown> = {};
      const defaultParamsDescriptors =
        MODE_PARAMS_MAP[KNOWN_CONTROLLER_MODES.DEFAULT] || [];

      defaultParamsDescriptors.forEach((descriptor) => {
        initialDefaults[descriptor.id] = descriptor.defaultValue;
      });

      globalDefaultModeParamsState.value = initialDefaults;
      addLog("Initialized global Default Mode parameters state.");

      // Broadcast current mode to all connected clients
      broadcastCurrentMode();
    } else {
      // Optional: Clear state if mode is not Default
      // globalDefaultModeParamsState.value = {};
    }
  }, [currentMode.value, broadcastCurrentMode, addLog]); // Re-run when currentMode changes

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
          clientManagerInstanceRef.current!.disconnectFromClient(clientId)
        );
      }
    },
    [addLog],
  );

  // Memoized callbacks for useWebSocketSignaling
  const onOfferReceivedCallback = useCallback(
    (
      msg: { source: string; data: RTCSessionDescriptionInit; type: "offer" },
    ) => {
      addLog(`[Controller] Hook: Offer received from ${msg.source}`);
      clientManagerInstanceRef.current?.handleClientOffer(msg);
    },
    [addLog],
  );

  const onAnswerReceivedCallback = useCallback(
    (
      msg: { source: string; data: RTCSessionDescriptionInit; type: "answer" },
    ) => {
      addLog(`[Controller] Hook: Answer received from ${msg.source}`);
      clientManagerInstanceRef.current?.handleAnswerFromClient(msg);
    },
    [addLog],
  );

  const onIceCandidateReceivedCallback = useCallback(
    (
      msg: { source: string; data: RTCIceCandidateInit; type: "ice-candidate" },
    ) => {
      addLog(`[Controller] Hook: ICE candidate received from ${msg.source}`);
      clientManagerInstanceRef.current?.handleIceCandidateFromClient(msg);
    },
    [addLog],
  );

  const onControllerKickedCallback = useCallback((newControllerId: string) => {
    addLog(
      `[Controller] Hook: Controller kicked, new controller: ${newControllerId}`,
    );
    handleControllerKickedInternalLogic(newControllerId);
  }, [addLog, handleControllerKickedInternalLogic]);

  const onClientDisconnectedCallback = useCallback((clientId: string) => {
    addLog(
      `[Controller] Hook: Client ${clientId} disconnected via signaling.`,
    );
    clientManagerInstanceRef.current?.removeClient(clientId);
  }, [addLog]);

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
    addLog, // memoized addLog
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
  const memoizedWsSignalProp = useMemo(() => ({
    sendMessage: (message: unknown) =>
      wsSignal.sendMessage(message as WebSocketMessage),
  }), [wsSignal.sendMessage]); // wsSignal.sendMessage is stable from useWebSocketSignaling

  const _clientManagerFromHook = useClientManager(
    id,
    memoizedWsSignalProp,
    addLog,
  );

  // Update the ref when the client manager instance changes
  useEffect(() => {
    clientManagerInstanceRef.current = _clientManagerFromHook;
  }, [_clientManagerFromHook]); // This effect runs if _clientManagerFromHook ref changes.

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
  const handleAddClient = useCallback((newClientId: string) => {
    if (newClientId.trim() === "") {
      return;
    }
    clientManagerInstanceRef.current?.addClient(newClientId);
    addLog(`Added client: ${newClientId}`);
  }, [addLog]); // Depends on methods from clientManagerInstanceRef.current and addLog

  // In the future, this will be used to switch modes based on MIDI device or user selection
  const handleModeChange = useCallback((newMode: ControllerMode) => {
    addLog(`Changing controller mode to: ${newMode}`);
    currentMode.value = newMode;

    // Immediately broadcast the mode change to all connected clients
    setTimeout(() => {
      addLog(
        `[DEBUG_MODE_BROADCAST] Delayed mode broadcast after change to ${newMode}`,
      );
      broadcastCurrentMode();
    }, 100);
  }, [addLog, currentMode, broadcastCurrentMode]);

  // Handler for global Default Mode parameter changes
  const handleGlobalDefaultModeParamChange = useCallback(
    (paramId: string, newValue: unknown) => {
      // 1. Update local state for immediate UI feedback
      globalDefaultModeParamsState.value = {
        ...globalDefaultModeParamsState.value,
        [paramId]: newValue,
      };
      addLog(`Global Default Param Changed: ${paramId} = ${newValue}`);

      // 2. Broadcast this change to ALL connected synth clients
      clientManagerInstanceRef.current?.broadcastGlobalSynthParam(
        paramId,
        newValue,
      );
    },
    [globalDefaultModeParamsState, addLog],
  );

  // Effect to set up the controller on mount
  useEffect(() => {
    addLog("Controller initialized. Connecting to signaling server...");
    addLog(`Using controller mode: ${currentMode.value}`);

    // Request wake lock to prevent screen from sleeping
    const activateWakeLock = async () => {
      try {
        const lock = await requestWakeLock();
        wakeLock.value = lock;
        addLog("Activated wake lock to prevent screen from sleeping");
      } catch (error) {
        addLog(`Error activating wake lock: ${error}`);
        console.warn("Error activating wake lock:", error);
      }
    };

    // Setup wake lock event listeners (screen visibility changes)
    setupWakeLockListeners(() => wakeLock.value, activateWakeLock);

    // Connect to WebSocket
    wsSignal.connect()
      .then(() => {
        addLog("Controller active and connected to signaling server");

        // Start regular pings to connected clients
        clientManagerInstanceRef.current?.startPinging(5000);
      })
      .catch((error) => {
        addLog(`Failed to connect to signaling server: ${error}`);
        console.error("Failed to connect to signaling server:", error);
      });

    // Cleanup function when component unmounts
    return () => {
      // Stop pinging
      clientManagerInstanceRef.current?.stopPinging();

      // Disconnect WebSocket
      wsSignal.disconnect();

      // Release wake lock
      if (wakeLock.value) {
        wakeLock.value.release()
          .then(() => console.log("Wake lock released"))
          .catch((err) => console.error("Error releasing wake lock:", err));
        wakeLock.value = null;
      }

      // Clear any intervals
      if (_statusCheckInterval.value !== null) {
        clearInterval(_statusCheckInterval.value);
        _statusCheckInterval.value = null;
      }
    };
  }, []);

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
          <strong>Connected Clients:</strong>{" "}
          {clientManagerInstanceRef.current?.connectedClientsCount.value ?? 0}
        </div>
        <div>
          <strong>Mode:</strong> {currentMode.value}
        </div>
      </div>

      {/* Global Default Mode Controls - only shown when in DEFAULT mode */}
      {currentMode.value === KNOWN_CONTROLLER_MODES.DEFAULT && (
        <div
          class="default-mode-global-controls section-box"
          style="margin-bottom: 20px; padding: 15px; border: 1px solid var(--border-color); border-radius: 8px;"
        >
          <h2>Default Mode Global Controls</h2>
          <p class="section-description">
            These controls affect all connected clients
          </p>
          <SynthControls
            idPrefix="global_default"
            params={globalDefaultModeParamsState.value}
            paramDescriptors={MODE_PARAMS_MAP[KNOWN_CONTROLLER_MODES.DEFAULT] ||
              []}
            onParamChange={handleGlobalDefaultModeParamChange}
          />
        </div>
      )}

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
          paramDescriptors={paramDescriptorsForClientList.value}
          currentOperatingMode={currentMode.value}
        />

        <AddClientForm
          onAddClient={handleAddClient}
          disabled={!controlActive.value}
        />

        <BroadcastMessageForm
          onSend={handleBroadcastMessage}
          disabled={!controlActive.value}
        />
      </ClientManagerProvider>

      <LogDisplay logs={logs.value} />
    </div>
  );
}
