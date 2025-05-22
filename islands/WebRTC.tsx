import { useSignal } from "@preact/signals";
import { useCallback, useEffect } from "preact/hooks";
import { h as _h } from "preact";
import {
  requestWakeLock,
  setupWakeLockListeners,
  type WakeLockSentinel,
} from "../lib/utils/wakeLock.ts";
import { DEV_MODE } from "../lib/config.ts";
import Synth from "./Synth.tsx";

// New Hook Imports
import useAppLogger from "../hooks/useAppLogger.ts";
import useAudioEngine, { type UseAudioEngineReturn } from "../hooks/useAudioEngine.ts"; 
import useIkedaSynthState, { type UseIkedaSynthStateReturn } from "../hooks/useIkedaSynthState.ts";
import useDataChannelMessageHandler, { type ChannelOperationCallbacks, type DataMessageHandlerFn } from "../hooks/useDataChannelMessageHandler.ts";
import usePeerConnectionLifecycle, { type UsePeerConnectionLifecycleOptions, type WebSocketSignaling as PCLWebSocketSignaling } from "../hooks/usePeerConnectionLifecycle.ts";
import type { AudioEngineControls, LoggerFn } from "../hooks/types.ts"; // Shared types
import { IKEDA_SYNTH_INSTRUMENT_ID } from "../types/instruments/ikeda_synth_types.ts";

// Existing WebSocket Hook (Ensure its API matches what's used below)
import useWebSocketSignaling, {
  type OnOpenFn,
  type OnCloseFn,
  type OnErrorFn,
  type OnOfferReceivedFn,
  type OnAnswerReceivedFn,
  type OnIceCandidateReceivedFn,
  type OnGenericMessageFn
} from "../islands/hooks/useWebSocketSignaling.ts";

// Extend the window object for Web Audio API
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// Add properties to globalThis
interface GlobalThisExtensions {
  _wasNoteActiveDuringAudioInit?: boolean;
  _frequencyAtAudioInit?: number;
}

export default function WebRTC() {
  // console.log("%c[WebRTC.tsx] Component function body executing / Re-rendering", "color: magenta; font-weight: bold;");
  // State management
  const id = useSignal(Math.random().toString(36).substring(2, 8));
  const targetId = useSignal<string | null>("");
  const message = useSignal("");
  
  // UI control state
  const showAudioButton = useSignal(true); // Start by showing the enable audio button
  const wakeLock = useSignal<WakeLockSentinel | null>(null); // Wake lock sentinel reference

  // === 1. Initialize Custom Hooks ===

  // Logger (provides addLog to other hooks)
  const { logsSignal, addLog } = useAppLogger();
  
  // Audio Engine (provides AudioEngineControls interface, including stubs for now)
  const addAudioEngineLog = useCallback(
    (text: string) => addLog(`[AudioEngine] ${text}`),
    [addLog]
  );
  const audioEngine = useAudioEngine(addAudioEngineLog) as UseAudioEngineReturn;
  
  // Ikeda Synth State (provides specialized state management for Ikeda synth)
  const addIkedaSynthStateLog = useCallback(
    (text: string) => addLog(`[IkedaSynthState] ${text}`),
    [addLog]
  );
  const ikedaSynthState = useIkedaSynthState(addIkedaSynthStateLog, {
    onStateChange: (newState) => {
      // When Ikeda synth state changes, update the audio engine's signal
      if (audioEngine.ikedaSynthStateSignal) {
        audioEngine.ikedaSynthStateSignal.value = newState;
      }
      addLog(`[IkedaSynthState] State updated, syncing with audio engine`);
    }
  });

  // Effect for Audio Initialization (depends on audioEngine and addLog)
  // Audio initialization function
  const initAudioContext = useCallback(async () => {
    try {
      // Initialize the audio engine
      await audioEngine.initializeAudio();
      showAudioButton.value = false;
    } catch (e) {
      addLog(`[WebRTC.tsx] Error initializing audio: ${e instanceof Error ? e.message : String(e)}`);
      showAudioButton.value = true; // Show audio button again if initialization fails
    }
  }, [audioEngine, addLog, showAudioButton]);

  // WebSocket Signaling (manages WebSocket connection)
  // Define message handlers that will interact with PeerConnectionLifecycle (PCL)
  // This object is used internally in WebRTC.tsx to define handlers for different message types
  const webSocketMessageHandlers = {
    processOffer: (offerSdp: RTCSessionDescriptionInit, sourceId: string) => {
      addLog(`[WebRTC.tsx] Processing offer from ${sourceId}.`);
      if (peerConnectionLifecycle) {
        peerConnectionLifecycle.processOffer(offerSdp, sourceId);
      } else {
        addLog("[WebRTC.tsx] PCL not initialized when offer received.", "warn");
      }
    },
    processAnswer: (answerSdp: RTCSessionDescriptionInit, sourceId: string) => {
      addLog(`[WebRTC.tsx] Processing answer from ${sourceId}.`);
      if (peerConnectionLifecycle) {
        peerConnectionLifecycle.processAnswer(answerSdp, sourceId);
      } else {
        addLog("[WebRTC.tsx] PCL not initialized when answer received.", "warn");
      }
    },
    processIceCandidate: (candidate: RTCIceCandidateInit | null, sourceId: string) => {
      addLog(`[WebRTC.tsx] Processing ICE candidate from ${sourceId}.`);
      if (peerConnectionLifecycle) {
        peerConnectionLifecycle.addRemoteIceCandidate(candidate, sourceId);
      } else {
        addLog("[WebRTC.tsx] PCL not initialized when ICE candidate received.", "warn");
      }
    },
    handleControllerInfo: (controllerId: string | null) => { // Renamed from onControllerIdAssigned
      addLog(`[WebRTC.tsx] Controller info received: ${controllerId || "none"}`);
      
      // Update the target ID
      targetId.value = controllerId;
      
      if (controllerId && peerConnectionLifecycle) {
        addLog(`[WebRTC.tsx] Valid controller ID received: ${controllerId}`);
        
        if (!peerConnectionLifecycle.webRtcConnectedSignal.value && 
            peerConnectionLifecycle.peerConnectionStateSignal.value !== 'connecting' &&
            peerConnectionLifecycle.peerConnectionStateSignal.value !== 'connected') {
          addLog(`[WebRTC.tsx] Controller identified (${controllerId}), attempting WebRTC connection.`);
          
          // Slight delay to ensure signaling server is ready
          setTimeout(() => {
            peerConnectionLifecycle.initiateConnection();
          }, 500);
        } else {
          addLog(`[WebRTC.tsx] Already connected or connecting to controller. No new connection initiated.`);
        }
      } else if (!controllerId && peerConnectionLifecycle) {
        addLog(`[WebRTC.tsx] No active controller. Closing WebRTC connection if active.`);
        peerConnectionLifecycle.closeConnection(false);
        
        // Schedule a retry to get controller info after a delay
        setTimeout(() => {
          addLog(`[WebRTC.tsx] Retrying to get controller info...`);
          webSocketSignaling.sendMessage({ type: "get-controller" });
        }, 3000);
      }
    },
    handleControllerKicked: (newControllerId: string, reason?: string) => {
      addLog(`[WebRTC.tsx] This client was kicked. New controller: ${newControllerId}, Reason: ${reason || "Unknown"}`, "warn");
      targetId.value = newControllerId; // Update target
      peerConnectionLifecycle?.closeConnection(false); // Close old connection
      if (newControllerId && peerConnectionLifecycle) { // Attempt to connect to new controller
        addLog(`[WebRTC.tsx] Attempting connection to new controller after being kicked: ${newControllerId}`);
        peerConnectionLifecycle.initiateConnection();
      }
    },
    handleClientDisconnected: (clientId: string) => {
      addLog(`[WebRTC.tsx] Client ${clientId} disconnected.`, "warn");
      if (targetId.value === clientId) {
        addLog(`[WebRTC.tsx] Target controller ${clientId} disconnected. Clearing targetId and closing WebRTC.`);
        targetId.value = null;
        peerConnectionLifecycle?.closeConnection(false);
      }
    },
    handleSignalingServerError: (errorMessage: string, details?: string) => {
      addLog(`[WebRTC.tsx] Signaling server error: ${errorMessage}. Details: ${details || "None"}`, "error");
    }
  };

  const webSocketSignaling = useWebSocketSignaling({
    localId: id,
    // New lifecycle callbacks
    onOpen: (event) => {
      addLog("[WebRTC.tsx-wsHook] WebSocket connection opened.");
    },
    onClose: (event, details) => {
      addLog(`[WebRTC.tsx-wsHook] WebSocket connection closed. Was clean: ${details.wasClean}, Code: ${details.code}, Reason: '${details.reason}', User Initiated: ${details.isUserInitiated}`);
    },
    onError: (event) => {
      addLog("[WebRTC.tsx-wsHook] WebSocket error occurred.", "error");
    },
    // Updated specific message handlers
    onOfferReceived: (message) => webSocketMessageHandlers.processOffer(message.data, message.source),
    onAnswerReceived: (message) => webSocketMessageHandlers.processAnswer(message.data, message.source),
    onIceCandidateReceived: (message) => webSocketMessageHandlers.processIceCandidate(message.data, message.source),
    onControllerKicked: (newControllerId, reason) => webSocketMessageHandlers.handleControllerKicked(newControllerId, reason),
    onClientDisconnected: (clientId) => webSocketMessageHandlers.handleClientDisconnected(clientId),
    onServerError: (errorMessage, details) => webSocketMessageHandlers.handleSignalingServerError(errorMessage, details),
    // New generic message handler instead of the legacy onSignalingMessage
    onGenericMessage: (message) => {
      addLog(`[WebRTC.tsx-wsHook] Received generic message type: ${message.type}, from: ${message.source || "unknown"}`);
      if (message.type === "controller-info") {
        // Log the full message for debugging
        // Controller info received
        addLog(`[WebRTC.tsx-wsHook] Controller info message received with controllerId: ${message.controllerId || "none"}`);
        webSocketMessageHandlers.handleControllerInfo(message.controllerId as string | null);
      } else {
        addLog(`[WebRTC.tsx-wsHook] Unhandled message type: ${message.type}`);
      }
    },
  });

  // Data Channel Message Handler (processes messages received on RTCDataChannels)
  const channelOperationCallbacks: ChannelOperationCallbacks = {
    sendDataToCtrl: (messageJSON: string, channelLabel?: "reliable_control" | "streaming_updates") => {
      if (peerConnectionLifecycle) {
        return peerConnectionLifecycle.sendDataOnChannel(channelLabel || "reliable_control", messageJSON);
      }
      addLog("[WebRTC.tsx] PCL not available for sendDataToCtrl.", "warn");
      return false;
    },
  };
  const addDataHandlerLog = useCallback(
    (text: string) => addLog(`[DataHandler] ${text}`),
    [addLog]
  );
  const { handleDataMessage } = useDataChannelMessageHandler(
    audioEngine, // The audioEngine object from useAudioEngine
    ikedaSynthState, // The ikedaSynthState object from useIkedaSynthState
    addDataHandlerLog, // Prefix DataChannelHandler logs
    channelOperationCallbacks,
  );

  // Peer Connection Lifecycle (manages RTCPeerConnection, DataChannels, and Signaling integration)
  const addPclLog = useCallback(
    (text: string) => addLog(`[PCL] ${text}`),
    [addLog]
  );
  const pclOptions: UsePeerConnectionLifecycleOptions = {
    clientIdSignal: id,
    targetIdSignal: targetId,
    webSocketSignaling: {
      sendSignalMessage: webSocketSignaling.sendMessage, // Map to webSocketSignaling.sendMessage
    },
    onDataMessageHandler: handleDataMessage,
    addLog: addPclLog,
  };
  
  const peerConnectionLifecycle = usePeerConnectionLifecycle(pclOptions);

  // Send a message through the data channel
  const sendMessage = useCallback(() => {
    if (message.value.trim() && peerConnectionLifecycle.webRtcConnectedSignal.value) {
      addLog(`[WebRTC.tsx] Sending debug message: ${message.value}`);
      // Define a debug message type
      const success = peerConnectionLifecycle.sendDataOnChannel(
        "reliable_control",
        JSON.stringify({ type: "debug_text", text: message.value })
      );
      if (success) message.value = "";
    }
  }, [message, peerConnectionLifecycle, addLog]);

  // Effect to react to WebSocket connection state changes
  useEffect(() => {
    // Access the value inside the effect, not in the dependency array
    const isConnected = webSocketSignaling.isConnectedSignal.value;
    if (isConnected) {
      addLog("[WebRTC.tsx] WebSocket connection ESTABLISHED (via isConnectedSignal signal).");
      
      // Wait a short time to ensure the connection is fully ready
      setTimeout(() => {
        addLog("[WebRTC.tsx] Requesting controller identification...");
        // Request the controller ID when WebSocket connection is established
        webSocketSignaling.sendMessage({ type: "get-controller" });
      }, 1000);
    } else {
      addLog("[WebRTC.tsx] WebSocket connection LOST (via isConnectedSignal signal). Ensuring WebRTC is also closed.");
      
      if (targetId.value !== null || peerConnectionLifecycle?.webRtcConnectedSignal.value) {
        targetId.value = null; // Clear target if WS drops
        peerConnectionLifecycle?.closeConnection(false); // Non-user initiated
      }
    }
  }, [webSocketSignaling.isConnectedSignal, addLog, peerConnectionLifecycle, targetId]); // Depend on the signal object, not its value
  
  // Effect to react to WebRTC connection state changes
  useEffect(() => {
    const isConnected = peerConnectionLifecycle.webRtcConnectedSignal.value;
    if (isConnected) {
      addLog("[WebRTC.tsx] WebRTC connection ESTABLISHED. Ready for data exchange!", "info");
      // Send an initial hello message to test the connection
      setTimeout(() => {
        // Report capabilities to the controller, including Ikeda synth support
        const capabilitiesMessage = {
          type: "synth_capabilities_report",
          engine_type: "distributed_synthesis_audio_engine",
          engine_version: "1.0.0",
          supported_audio_worklet_processors: ["pink_noise", "lfo_controller"],
          supported_instrument_ids: [IKEDA_SYNTH_INSTRUMENT_ID]
        };
        
        const success = peerConnectionLifecycle.sendDataOnChannel(
          "reliable_control",
          JSON.stringify(capabilitiesMessage)
        );
        addLog(`[WebRTC.tsx] Sent capabilities report: ${success ? "success" : "failed"}`);
        
        // Also send a hello message
        const helloSuccess = peerConnectionLifecycle.sendDataOnChannel(
          "reliable_control",
          JSON.stringify({ type: "hello_from_client", id: id.value, timestamp: Date.now() })
        );
        addLog(`[WebRTC.tsx] Sent initial hello message: ${helloSuccess ? "success" : "failed"}`);
      }, 500);
    } else {
      addLog("[WebRTC.tsx] WebRTC connection DISCONNECTED or not yet established.");
    }
  }, [peerConnectionLifecycle.webRtcConnectedSignal, addLog, peerConnectionLifecycle, id]);

  // Effect to monitor audio context state changes
  useEffect(() => {
    const audioContextState = audioEngine.audioContextStateSignal.value;
    addLog(`[WebRTC.tsx] Audio context state changed to: ${audioContextState}`);
    
    // Initialize Ikeda synth state if it's not already active and audio context is running
    if (audioContextState === "running" && 
        !ikedaSynthState.isActivatedSignal.value && 
        audioEngine.activeInstrumentIdSignal.value === IKEDA_SYNTH_INSTRUMENT_ID) {
      
      addLog("[WebRTC.tsx] Audio context running with Ikeda synth active, initializing Ikeda synth state");
      ikedaSynthState.initialize();
    }
  }, [audioEngine.audioContextStateSignal, audioEngine.activeInstrumentIdSignal, ikedaSynthState.isActivatedSignal, addLog]);

  // Combined Mount/Unmount Effect with empty dependency array for testing
  useEffect(() => {
    addLog("%c[WebRTC.tsx] MOUNTED (from [] effect)", "color: blue; font-weight: bold;");
    // Component mounted

    addLog("[WebRTC.tsx] Calling webSocketSignaling.connect() from [] effect.");
    webSocketSignaling.connect();

    return () => {
      addLog("%c[WebRTC.tsx] UNMOUNTING (from [] effect)", "color: orange; font-weight: bold;");
      // Component unmounting
      
      addLog("[WebRTC.tsx] Calling webSocketSignaling.disconnect(false) from [] effect.");
      webSocketSignaling.disconnect(false); // Not user initiated

      // Reset Ikeda synth state on unmount
      if (ikedaSynthState.isActivatedSignal.value) {
        addLog("[WebRTC.tsx] Resetting Ikeda synth state on unmount.");
        ikedaSynthState.reset();
      }

      // Optional: Consider more aggressive cleanup of other resources if WebRTC is truly unmounting
      // For example, explicitly closing peerConnectionLifecycle if it holds resources
      // if (peerConnectionLifecycle) {
      //   addLog("[WebRTC.tsx] Closing peerConnectionLifecycle on unmount.");
      //   peerConnectionLifecycle.closeConnection(true); // or false depending on intent
      // }
      // And audioEngine if it had a specific close method
      // if (audioEngine && typeof audioEngine.shutdown === 'function') { // Assuming a hypothetical shutdown
      //   addLog("[WebRTC.tsx] Shutting down audioEngine on unmount.");
      //   audioEngine.shutdown();
      // }
    };
  }, []); // FORCED EMPTY DEPENDENCY ARRAY FOR DIAGNOSIS

  // Handle pressing Enter in the message input
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Enter" && message.value.trim()) {
      if (peerConnectionLifecycle.webRtcConnectedSignal.value) {
        sendMessage();
      } else if (targetId.value) {
        addLog("[WebRTC.tsx] Not connected to controller. Attempting connection...");
        peerConnectionLifecycle.initiateConnection();
        // Save the message so it can be sent once connected
        setTimeout(() => {
          if (peerConnectionLifecycle.webRtcConnectedSignal.value && message.value.trim()) {
            sendMessage();
          }
        }, 2000);
      } else {
        addLog("[WebRTC.tsx] No controller available for connection.");
      }
    }
  }, [message, sendMessage, peerConnectionLifecycle, targetId, addLog]);

  return (
    <div class="container">
      {showAudioButton.value
        ? ( // State 1: Initial "Enable Audio" screen
          <div class="audio-enable">
            <h1>WebRTC Synth</h1>
            <div class="controller-connection-info">
              {targetId.value && !peerConnectionLifecycle.webRtcConnectedSignal.value
                ? (
                  <div class="controller-available">
                    <p>Controller available: {targetId.value}</p>
                    <button
                      type="button"
                      class="connect-button"
                      onClick={() => peerConnectionLifecycle.initiateConnection()}
                    >
                      Connect to Controller
                    </button>
                  </div>
                )
                : peerConnectionLifecycle.webRtcConnectedSignal.value
                ? (
                  <p class="connection-status status-connected">
                    Connected to controller
                  </p>
                )
                : (
                  <p class="connection-status">
                    Searching for controller...
                  </p>
                )}
            </div>

            <p>Click below to enable audio (you can connect without audio).</p>
            <button
              type="button"
              onClick={initAudioContext} // This triggers audio initialization with pink noise
              class="audio-button"
            >
              Enable Audio
            </button>
          </div>
        )
        : ( // New Combined State 2: Audio Enabled - Adjusting Volume / Using Synth
          <div class="synth-and-volume-adjust-ui">
            {/* Main Synth UI elements */}
            <div class="synth-ui">
              <h1>WebRTC Synth</h1>

              <div class="status-bar">
                <div>
                  <span class="id-display">ID: {id.value}</span>
                  <span class="id-display">Target: {targetId.value || "N/A"}</span>
                  <span
                    class={`connection-status ${
                      webSocketSignaling.isConnectedSignal.value
                        ? "status-connected"
                        : "status-disconnected"
                    }`}
                  >
                    WS: {webSocketSignaling.isConnectedSignal.value ? "Connected" : "Disconnected"}
                  </span>
                  <span
                    class={`connection-status ${
                      peerConnectionLifecycle.webRtcConnectedSignal.value
                        ? "status-connected"
                        : "status-disconnected"
                    }`}
                    onClick={() => {
                      if (!peerConnectionLifecycle.webRtcConnectedSignal.value && targetId.value) {
                        addLog("[WebRTC.tsx] Manually reconnecting to controller...");
                        peerConnectionLifecycle.initiateConnection();
                      }
                    }}
                    style="cursor: pointer; user-select: none;"
                  >
                    WebRTC: {peerConnectionLifecycle.webRtcConnectedSignal.value ? "Connected" : "Disconnected"}
                  </span>
                  <span>
                    RTC State: {peerConnectionLifecycle.peerConnectionStateSignal.value || "N/A"}
                  </span>
                  <span>
                    ICE: {peerConnectionLifecycle.iceConnectionStateSignal.value || "N/A"}
                  </span>
                  <span
                    class={`audio-status audio-${audioEngine.audioContextStateSignal.value}`}
                  >
                    Audio: {audioEngine.audioContextStateSignal.value}
                  </span>
                  <span
                    class={`controller-mode ${audioEngine.activeInstrumentIdSignal.value || "none"}`}
                  >
                    Instrument: {audioEngine.activeInstrumentIdSignal.value || "N/A"}
                  </span>
                  <span>
                    Program: {audioEngine.isProgramRunningSignal.value ? "Running" : "Idle"}
                  </span>
                  {ikedaSynthState.isActivatedSignal.value && (
                    <span
                      class="ikeda-status"
                    >
                      Ikeda: Active
                    </span>
                  )}
                  <span
                    class={`wake-lock-status ${
                      wakeLock.value ? "wake-lock-active" : "wake-lock-inactive"
                    }`}
                    title={wakeLock.value
                      ? "Screen will stay awake"
                      : "Screen may sleep (no wake lock)"}
                  >
                    {wakeLock.value ? "🔆 Wake Lock" : "💤 No Wake Lock"}
                  </span>
                </div>

                {/* Controller auto-discovery implemented via minimal KV store */}
                {targetId.value && !peerConnectionLifecycle.webRtcConnectedSignal.value && (
                  <div class="controller-status">
                    <span>Controller available: {targetId.value}</span>
                    <button
                      type="button"
                      onClick={() => peerConnectionLifecycle.initiateConnection()}
                      class="auto-connect-button"
                      disabled={peerConnectionLifecycle.peerConnectionStateSignal.value === 'connecting'}
                    >
                      Connect
                    </button>
                  </div>
                )}
              </div>

              {/* Synth component - FFT analyzer and parameter display */}
              <Synth 
                audio={audioEngine} 
                ikedaSynth={ikedaSynthState.isActivatedSignal.value ? ikedaSynthState : null} 
              />

              <div class="connection-info">
                <input
                  type="text"
                  placeholder="Enter target ID"
                  value={targetId.value}
                  onInput={(e) => targetId.value = e.currentTarget.value}
                  disabled={peerConnectionLifecycle.webRtcConnectedSignal.value}
                />
                {peerConnectionLifecycle.webRtcConnectedSignal.value
                  ? (
                    <button
                      type="button"
                      onClick={() => {
                        addLog("[WebRTC.tsx] User clicked Disconnect.");
                        webSocketSignaling.disconnect(true); // User initiated disconnect
                        peerConnectionLifecycle.closeConnection(true); // User initiated
                      }}
                      class="disconnect-button"
                    >
                      Disconnect
                    </button>
                  )
                  : (
                    <button
                      type="button"
                      onClick={() => peerConnectionLifecycle.initiateConnection()}
                      disabled={!targetId.value || peerConnectionLifecycle.peerConnectionStateSignal.value === 'connecting'}
                    >
                      Connect
                    </button>
                  )}
              </div>

              <div class="message-area">
                <input
                  type="text"
                  placeholder="Type a message"
                  value={message.value}
                  onInput={(e) => message.value = e.currentTarget.value}
                  onKeyDown={handleKeyDown}
                  disabled={!peerConnectionLifecycle.webRtcConnectedSignal.value}
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!peerConnectionLifecycle.webRtcConnectedSignal.value || !message.value.trim()}
                >
                  Send
                </button>
              </div>

              {/* Mode indicator and debugger UI */}
              <div class="mode-selector">
                <h3>Active Instrument</h3>
                <div class="mode-info">
                  <p>
                    Current instrument:{" "}
                    <span
                      class={`mode-display ${audioEngine.activeInstrumentIdSignal.value || "none"}`}
                    >
                      {audioEngine.activeInstrumentIdSignal.value || "None"}
                    </span>
                  </p>
                  {!DEV_MODE && (
                    <p class="mode-info-text">
                      The controller determines the active instrument. This display is
                      for information only.
                    </p>
                  )}
                </div>

                {/* Debug UI only visible in DEV_MODE */}
                {DEV_MODE && (
                  <div class="mode-debug">
                    <p class="dev-mode-label">DEVELOPMENT MODE ONLY</p>
                    <div class="mode-buttons">
                      {/* Example instrument IDs for instrument selection */}
                      {["ikeda_synth_v1", "default_synth", "sampler_test"].map((instrumentId) => (
                        <button
                          key={instrumentId}
                          type="button"
                          class={`mode-button ${
                            audioEngine.activeInstrumentIdSignal.value === instrumentId
                              ? "active"
                              : ""
                          }`}
                          onClick={() => {
                            // In dev mode, directly activate the instrument
                            addLog(`DEV: Manually activating instrument ${instrumentId}`);
                            
                            // For Ikeda synth, also initialize the Ikeda state
                            if (instrumentId === "ikeda_synth_v1") {
                              ikedaSynthState.initialize();
                            }
                            
                            audioEngine.activateInstrument(instrumentId, {}); // Pass empty initial_params or a predefined set
                            // Note: This only changes the local synth. In a real scenario,
                            // the controller would send a set_active_instrument message.
                          }}
                        >
                          {instrumentId}
                        </button>
                      ))}
                    </div>
                    <p class="dev-mode-note">
                      Note: In production, only the controller can change the
                      active instrument. This UI is for testing only.
                    </p>
                  </div>
                )}
              </div>

              <div class="log">
                <h3>Connection Log</h3>
                <ul>
                  {logsSignal.value.map((log, index) => <li key={index}>{log}</li>)}
                </ul>
              </div>
            </div>{" "}
            {/* End of <div class="synth-ui"> */}
          </div> /* End of <div class="synth-and-volume-adjust-ui"> */
        )}
    </div>
  );
}