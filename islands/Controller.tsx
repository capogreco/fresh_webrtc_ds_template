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

  // Add a log entry - memoized
  const addLog = useCallback((text: string) => {
    logs.value = [...logs.value, `${formatTime()}: ${text}`];
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector(".log");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 0);
  }, [logs]); // logs signal reference is stable

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

  // Effect to set up the controller on mount
  useEffect(() => {
    addLog("Controller initialized. Connecting to signaling server...");

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
