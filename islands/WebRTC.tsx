import { useSignal } from "@preact/signals";
import { useCallback, useEffect, useRef } from "preact/hooks";
import { h as _h } from "preact";
import {
  requestWakeLock,
  setupWakeLockListeners,
  type WakeLockSentinel,
} from "../lib/utils/wakeLock.ts";
import { formatTime } from "../lib/utils/formatTime.ts";
import { fetchIceServers } from "../lib/webrtc.ts";
import { useAudioEngine } from "./hooks/useAudioEngine.ts";
import Synth from "./Synth.tsx";
import {
  ControllerMode,
  KNOWN_CONTROLLER_MODES,
} from "../shared/controllerModes.ts";
import { DEV_MODE } from "../lib/config.ts";

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

// Type definitions for abstracted functionality
type MessageHandler = (event: MessageEvent, channel: RTCDataChannel) => void;

// Import shared signaling message types
import {
  BaseSignalMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage
} from "../lib/types/signalingMessages.ts";

// Web Audio Synthesizer Nodes - now managed by useAudioEngine hook

export default function WebRTC() {
  // State management
  const id = useSignal(Math.random().toString(36).substring(2, 8));
  const targetId = useSignal("");
  const connected = useSignal(false);
  const message = useSignal("");
  const logs = useSignal<string[]>([]);
  const connection = useSignal<RTCPeerConnection | null>(null);
  const reliableControlChannel = useSignal<RTCDataChannel | null>(null);
  const streamingUpdatesChannel = useSignal<RTCDataChannel | null>(null);
  const socket = useSignal<WebSocket | null>(null);
  const activeController = useSignal<string | null>(null);
  const autoConnectAttempted = useSignal(false);
  const hasRequestedInstrumentDefinition = useSignal(false);
  
  // Ref to track if websocket disconnect was intentional
  const intentionallyDisconnectedSocketRef = useRef(false);
  
  // Ref to store the heartbeat interval ID
  const heartbeatIntervalRef = useRef<number | null>(null);

  // Controller mode state
  const controllerMode = useSignal<ControllerMode>(
    KNOWN_CONTROLLER_MODES.IKEDA,
  );

  // UI control state
  const showAudioButton = useSignal(true); // Start by showing the enable audio button
  const wakeLock = useSignal<WakeLockSentinel | null>(null); // Wake lock sentinel reference

  // Add a log entry
  const addLog = (text: string) => {
    logs.value = [...logs.value, `${formatTime()}: ${text}`];
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector(".log");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 0);
  };

  // Initialize audio engine using the useAudioEngine hook with controller mode
  const audio = useAudioEngine(addLog, controllerMode);

  // Handler for when user completes volume check
  const handleVolumeCheckDone = useCallback(() => {
    audio.confirmVolumeCheckComplete();
    showAudioButton.value = false; // Hide the enable audio button
  }, []);

  // Using imported formatTime utility for log timestamps

  // Utility for sending a parameter update to controller

  // Utility for sending all synth parameters to controller
  const sendAllSynthParameters = useCallback((channel: RTCDataChannel) => {
    try {
      // Define all parameters to send
      const params = [
        { param: "frequency", value: audio.frequency.value },
        { param: "waveform", value: audio.waveform.value },
        { param: "volume", value: audio.volume.value },
        { param: "oscillatorEnabled", value: audio.isNoteActive.value },
        { param: "detune", value: audio.detune.value },
        { param: "attack", value: audio.attack.value },
        { param: "release", value: audio.release.value },
        { param: "filterCutoff", value: audio.filterCutoff.value },
        { param: "filterResonance", value: audio.filterResonance.value },
        { param: "vibratoRate", value: audio.vibratoRate.value },
        { param: "vibratoWidth", value: audio.vibratoWidth.value },
        { param: "portamentoTime", value: audio.portamentoTime.value },
      ];

      // Send each parameter
      params.forEach(({ param, value }) => {
        channel.send(JSON.stringify({
          type: "synth_param",
          param,
          value,
        }));
      });

      // Send audio state
      channel.send(JSON.stringify({
        type: "audio_state",
        isMuted: audio.isMuted.value,
        audioState: audio.audioContextState.value,
        controllerMode: audio.activeControllerMode.value,
      }));

      addLog("Sent synth parameters and audio state to controller");
    } catch (error) {
      console.error("Error sending synth parameters:", error);
    }
  }, [
    addLog,
    audio.activeControllerMode.value,
    audio.attack.value,
    audio.audioContextState.value,
    audio.detune.value,
    audio.filterCutoff.value,
    audio.filterResonance.value,
    audio.frequency.value,
    audio.isMuted.value,
    audio.isNoteActive.value,
    audio.portamentoTime.value,
    audio.release.value,
    audio.vibratoRate.value,
    audio.vibratoWidth.value,
    audio.volume.value,
    audio.waveform.value
  ]);

  // Send only audio state to controller (no synth parameters)
  const sendAudioStateOnly = useCallback((channel: RTCDataChannel) => {
    try {
      channel.send(JSON.stringify({
        type: "audio_state",
        isMuted: true, // Audio is muted
        audioState: "disabled",
        pendingNote: audio.isNoteActive.value, // Let controller know if there's a pending note
        controllerMode: audio.activeControllerMode.value, // Send current mode
      }));
      addLog("Sent audio state to controller (audio not enabled)");
    } catch (error) {
      console.error("Error sending audio state:", error);
    }
  }, [addLog, audio.activeControllerMode.value, audio.isNoteActive.value]);

  // Handle ping messages
  const handlePingMessage = useCallback(
    (
      data: string,
      channel: RTCDataChannel,
      prefix: string = "",
    ) => {
      console.log(`[${prefix}] PING detected!`);

      // Create pong response by replacing PING with PONG
      const pongMessage = data.replace("PING:", "PONG:");
      console.log(`[${prefix}] Sending PONG:`, pongMessage);

      // Send the response immediately
      try {
        // Add a small delay to ensure message is processed
        setTimeout(() => {
          try {
            channel.send(pongMessage);
            console.log(`[${prefix}] PONG sent successfully`);
            addLog(`Responded with ${pongMessage}`);
          } catch (e) {
            console.error(`[${prefix}] Failed to send delayed PONG:`, e);
          }
        }, 10);

        // Also try sending immediately
        channel.send(pongMessage);
        console.log(`[${prefix}] PONG sent immediately`);
      } catch (error) {
        console.error(`[${prefix}] Error sending PONG:`, error);
        addLog(
          `Failed to respond to ping: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [addLog]
  );

  // Handle test messages
  const handleTestMessage = useCallback(
    (
      data: string,
      channel: RTCDataChannel,
      prefix: string = "",
    ) => {
      console.log(`[${prefix}] TEST message detected!`);

      // Reply with the same test message
      try {
        // Echo back the test message
        channel.send(`ECHOED:${data}`);
        console.log(`[${prefix}] Echoed test message`);
        addLog(`Echoed test message`);
      } catch (error) {
        console.error(`[${prefix}] Error echoing test message:`, error);
        addLog(
          `Failed to echo test message: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [addLog]
  );

  // Function to send parameter updates to controller
  const sendParamToController = (param: string, value: unknown) => {
    if (reliableControlChannel.value && reliableControlChannel.value.readyState === "open") {
      try {
        reliableControlChannel.value.send(JSON.stringify({
          type: "synth_param",
          param,
          value,
        }));
      } catch (error) {
        console.error(`Error sending ${param} update:`, error);
      }
    }
  };

  // Forward declare a closeConnectionFunction to use instead of disconnect directly in handleChannelMessage
  const closeConnection = (isUserInitiated: boolean = true) => {
    if (reliableControlChannel.value) {
      addLog(`Closing reliable_control channel: ${reliableControlChannel.value.label}`);
      reliableControlChannel.value.close();
      reliableControlChannel.value = null;
    }
    if (streamingUpdatesChannel.value) {
      addLog(`Closing streaming_updates channel: ${streamingUpdatesChannel.value.label}`);
      streamingUpdatesChannel.value.close();
      streamingUpdatesChannel.value = null;
    }

    if (connection.value) {
      connection.value.close();
      connection.value = null;
    }

    connected.value = false;
    hasRequestedInstrumentDefinition.value = false; // Reset the flag on disconnect

    if (!isUserInitiated) {
      // This was an automatic/error disconnect
      addLog("Connection lost - will attempt to reconnect");
      targetId.value = ""; // Clear target ID to avoid confusion

      // Schedule a reconnection attempt after a delay
      setTimeout(() => {
        autoConnectAttempted.value = false; // Reset to allow auto-connect
        // Instead of calling requestActiveController, log it
        addLog("Reconnection scheduled - automatic connection should happen soon");
      }, 2000);
    }
  };

  // Unified channel message handler - declare before references to it
  const handleChannelMessage = useCallback(
    (
      event: MessageEvent,
      channel: RTCDataChannel,
      prefix: string = "",
    ) => {
      console.log(`[${prefix || "CLIENT"}] Received message:`, event.data);

      // Try to parse JSON messages
      if (typeof event.data === "string" && event.data.startsWith("{")) {
        try {
          const message = JSON.parse(event.data);
          addLog(`[${channel.label}] Parsed: ${message.type}`);

          // Handle synth parameter update messages
          if (message.type === "synth_param") {
            const paramId = message.param;
            const value = message.value;

            // Special handling for oscillatorEnabled - control note on/off
            if (paramId === "oscillatorEnabled") {
              console.log(
                `[SYNTH] Received oscillatorEnabled=${value}, current isNoteActive=${audio.isNoteActive.value}, isMuted=${audio.isMuted.value}`,
              );

              // If oscillatorEnabled is true, play note; otherwise stop note
              if (value) {
                // If audio is ready and not muted, play the note immediately
                if (audio.audioContextReady.value && !audio.isMuted.value) {
                  console.log(
                    "[SYNTH] Audio ready and oscillatorEnabled=true, playing note immediately",
                  );
                  audio.playNote(audio.frequency.value);
                  addLog(
                    `Playing note at ${audio.frequency.value}Hz due to controller setting`,
                  );
                } else {
                  // If audio not ready or muted, log the note request and notify controller
                  addLog(
                    `Note requested but audio not enabled or muted`,
                  );

                  // Let controller know that audio is muted but note is pending
                  if (channel.readyState === "open") {
                    try {
                      channel.send(JSON.stringify({
                        type: "audio_state",
                        isMuted: true,
                        audioState: "disabled",
                        pendingNote: true,
                      }));
                    } catch (error) {
                      console.error("Error sending audio state:", error);
                    }
                  }
                }
              } else {
                // Stop the note
                audio.stopNote();
                addLog("Note off due to controller setting");
              }
            }

            // Forward all parameters directly to the audio engine
            addLog(
              `Synth Client: Received synth_param: ${paramId} = ${value}. Forwarding to audio engine.`,
            );
            audio.updateSynthParam(paramId, value);
            return;
          }

          // Handle full synth parameter set messages
          if (message.type === "synth_params_full" && message.params) {
            addLog(
              `Synth Client: Received synth_params_full. Applying ${
                Object.keys(message.params).length
              } parameters.`,
            );
            for (const [paramId, value] of Object.entries(message.params)) {
              // Forward each parameter directly to the audio engine
              // Ensure 'value' is not undefined, though Object.entries should skip that.
              if (value !== undefined) {
                 addLog(
                  `Synth Client: Applying from full set: ${paramId} = ${String(value)}`,
                );
                audio.updateSynthParam(paramId, value);
              }
            }
            return;
          }

          // Handle note_on messages
          if (message.type === "note_on") {
            if (message.frequency) {
              // Only play sound if audio is already initialized and not muted
              if (audio.audioContextReady.value && !audio.isMuted.value) {
                audio.playNote(message.frequency);
                addLog(
                  `Playing note ${audio.currentNote.value} (${message.frequency}Hz)`,
                );
              } else {
                // If audio not enabled, just log the message and notify controller
                addLog(
                  `Note requested but audio not enabled or muted`,
                );

                // Let controller know that audio is muted
                if (channel.readyState === "open") {
                  try {
                    channel.send(JSON.stringify({
                      type: "audio_state",
                      isMuted: true,
                      audioState: "disabled",
                      pendingNote: true,
                    }));
                  } catch (error) {
                    console.error("Error sending audio state:", error);
                  }
                }
              }
            }
            return;
          }

          // Handle note_off messages
          if (message.type === "note_off") {
            // Release the current note
            audio.stopNote();
            return;
          }

          // Handle application-level ping messages (used for latency measurement)
          if (message.type === "app_ping") {
            console.log(`[APP_PING_PONG] Received app_ping with timestamp: ${message.timestamp}`);
            const timestamp = message.timestamp;
            if (typeof timestamp !== "number") {
              addLog(`Received app_ping with invalid timestamp: ${timestamp}`);
              return;
            }
            
            // 1. Send app_pong back on the SAME channel (usually reliable_control)
            if (channel.readyState === "open") { // Check if the current channel is open
              try {
                const pongMessage = { type: "app_pong", original_timestamp: timestamp };
                console.log(`[APP_PING_PONG] Sending app_pong response on [${channel.label}]:`, pongMessage);
                channel.send(JSON.stringify(pongMessage));
                addLog(`Responded to app_ping with app_pong (original_timestamp: ${timestamp}, channel: ${channel.label})`);
              } catch (error) {
                console.error(`Error sending app_pong response on [${channel.label}]:`, error);
                addLog(`Failed to send app_pong on [${channel.label}]: ${error instanceof Error ? error.message : String(error)}`);
              }
            } else {
              addLog(`[APP_PING_PONG] Cannot send app_pong, channel [${channel.label}] is not open.`);
            }

            // 2. Send stream_ack_pulse on streaming_updates channel
            if (channel.label === "reliable_control") { // Only do this if ping came on reliable
                if (streamingUpdatesChannel.value && streamingUpdatesChannel.value.readyState === "open") {
                    try {
                        const pulseMsg = { type: "stream_ack_pulse", original_ping_ts: timestamp };
                        console.log(`[AppPing] Sending stream_ack_pulse on [${streamingUpdatesChannel.value.label}] for original_ping_ts ${timestamp}:`, pulseMsg);
                        streamingUpdatesChannel.value.send(JSON.stringify(pulseMsg));
                        addLog(`Sent stream_ack_pulse for original_ping_ts ${timestamp}`);
                    } catch (error) {
                        console.error(`Error sending stream_ack_pulse on [${streamingUpdatesChannel.value.label}]:`, error);
                        addLog(`Failed to send stream_ack_pulse: ${error instanceof Error ? error.message : String(error)}`);
                    }
                } else {
                    addLog(`[AppPing] streaming_updates channel not open or available, cannot send stream_ack_pulse.`);
                }
            }
            return;
          }

          // Handle controller mode change messages
          if (message.type === "controller_mode") {
            addLog(
              `[DEBUG_MODE_CHANGE] WebRTC: Received controller_mode_update, mode: ${message.mode}`,
            );

            if (
              message.mode &&
              Object.values(KNOWN_CONTROLLER_MODES).includes(message.mode)
            ) {
              addLog(
                `[DEBUG_MODE_CHANGE] WebRTC: Setting controllerMode.value to ${message.mode}`,
              );
              controllerMode.value = message.mode as ControllerMode;
              addLog(`Controller mode changed to: ${message.mode}`);

              // Pass along initial parameters if provided
              if (message.initialParams) {
                addLog(
                  `[DEBUG_MODE_CHANGE] WebRTC: Calling audio.setControllerMode with initialParams`,
                );
                audio.setControllerMode(
                  message.mode as ControllerMode,
                  message.initialParams,
                );
              } else {
                addLog(
                  `[DEBUG_MODE_CHANGE] WebRTC: Calling audio.setControllerMode without initialParams`,
                );
                audio.setControllerMode(message.mode as ControllerMode);
              }
            } else {
              addLog(`Invalid controller mode received: ${message.mode}`);
            }
            return;
          }

          // Handle controller handoff messages
          if (message.type === "controller_handoff" && message.newControllerId) {
            // Log the handoff
            console.log(
              `Received controller handoff to: ${message.newControllerId}`,
            );
            addLog(
              `Controller handoff: connecting to new controller ${message.newControllerId}`,
            );

            // Update target ID to the new controller
            targetId.value = message.newControllerId;
            activeController.value = message.newControllerId;

            // Close current connection after a short delay to allow message to be processed
            setTimeout(() => {
              // Disconnect (but not user initiated) - use the local closeConnection function
              closeConnection(false);

              // Connect to new controller after a short delay - avoid direct reference
              const newControllerId = message.newControllerId; // Capture for closure
              setTimeout(() => {
                // Indirect connection call to avoid circular dependencies
                // Set targetId, autoConnectAttempted, etc. and trigger a connection
                if (newControllerId) {
                  targetId.value = newControllerId;
                  activeController.value = newControllerId;
                  autoConnectAttempted.value = true;
                  
                  // Instead of calling connect directly, do what connect does inline
                  if (targetId.value) {
                    // Get WebRTC servers using a new connection, similar to what initRTC does
                    // Create the connection directly instead of using another function
                    fetchIceServers().then(iceServers => {
                      try {
                        const peerConnection = new RTCPeerConnection({ iceServers });
                        connection.value = peerConnection;
                        
                        // Set up basic event handlers
                        peerConnection.oniceconnectionstatechange = () => {
                          addLog(`ICE connection state: ${peerConnection.iceConnectionState}`);
                        };
                        
                        peerConnection.onconnectionstatechange = () => {
                          addLog(`Connection state: ${peerConnection.connectionState}`);
                        };
                        
                        // Trigger initialization of data channels and initiating the connection
                        setTimeout(() => {
                          try {
                            addLog(`Initiating connection to ${targetId.value}`);
                            // This is not a full connection implementation to avoid circular dependencies,
                            // but it should at least start the connection process
                            // Wait for the service implementation to call us back for data channels and ICE setup
                            
                            // Trigger a basic event to indicate connection is starting
                            addLog("*** Controller handoff: Connect functionality needs to be implemented with direct calls");
                            addLog("*** Controller handoff: Please manually reconnect if automatic connection fails");
                          } catch (e) {
                            addLog(`Error in handoff reconnect: ${e instanceof Error ? e.message : String(e)}`);
                          }
                        }, 10);
                      } catch (e) {
                        addLog(`Error setting up WebRTC reconnection: ${e instanceof Error ? e.message : String(e)}`);
                      }
                    }).catch(e => {
                      addLog(`Error fetching ICE servers: ${e instanceof Error ? e.message : String(e)}`);
                    });
                  }
                }
              }, 500);
            }, 500);

            return;
          }
        } catch (error) {
          console.error(`Error parsing JSON message:`, error);
          // Continue with non-JSON message handling
        }
      }

      // Handle PING messages
      if (typeof event.data === "string" && event.data.startsWith("PING:")) {
        handlePingMessage(event.data, channel, prefix);
        return;
      }

      // Handle TEST messages
      if (typeof event.data === "string" && event.data.startsWith("TEST:")) {
        handleTestMessage(event.data, channel, prefix);
        return;
      }

      // Regular message
      addLog(`Received: ${event.data}`);
    }, 
    [
      addLog, 
      activeController,
      audio.audioContextReady.value,
      audio.currentNote.value, 
      audio.frequency.value, 
      audio.isMuted.value, 
      audio.isNoteActive.value, 
      audio.playNote, 
      audio.setControllerMode, 
      audio.stopNote, 
      audio.updateSynthParam,
      autoConnectAttempted,
      connection,
      controllerMode,
      reliableControlChannel,
      streamingUpdatesChannel, 
      targetId,
      hasRequestedInstrumentDefinition,
      connected
      // disconnect removed to avoid circular dependencies
      // connect removed to avoid circular dependencies
      // connectToController removed to avoid circular dependencies
      // handlePingMessage and handleTestMessage are also intentionally removed
    ]
  );

  // Setup channel event handlers
  const setupDataChannel = useCallback((channel: RTCDataChannel, prefix: string = "") => {
    channel.onopen = () => {
      addLog(`Data channel [${channel.label}] opened${prefix ? ` (${prefix})` : ""}`);
      if (channel.label === "reliable_control") {
        connected.value = true;
      }

      // Send current synth parameters to the controller (via reliable channel)
      // Send current synth parameters to the controller (via reliable channel)
      if (channel.label === "reliable_control") {
        if (!audio.isMuted.value) { // Not muted means audio is enabled
          sendAllSynthParameters(channel);
        } else {
          // Even if audio is not enabled, send the audio state
          sendAudioStateOnly(channel);
        }

        // Request instrument definition ONLY IF NOT ALREADY REQUESTED
        if (!hasRequestedInstrumentDefinition.value) {
          try {
            console.log("[SYNTH] Requesting current instrument definition (flag check)");
            channel.send(JSON.stringify({
              type: "request_instrument_definition",
            }));
            addLog("Requested current instrument definition");
            hasRequestedInstrumentDefinition.value = true;
          } catch (error) {
            console.error("Error requesting instrument definition:", error);
          }
        } else {
          console.log("[SYNTH] Skipping instrument definition request (already requested)");
        }
      }
    };

    channel.onclose = (event: Event) => { // Added event parameter
      // Try to get more details from the event if possible, though it's a generic Event
      let eventDetails = "Generic Event";
      if (event) {
        const eventProps: Record<string, any> = {};
        for (const key in event) {
          // Avoid functions and prototype properties
          if (typeof (event as any)[key] !== 'function' && Object.prototype.hasOwnProperty.call(event, key)) {
            eventProps[key] = (event as any)[key];
          }
        }
        try {
          eventDetails = JSON.stringify(eventProps, null, 2);
        } catch (e) {
          eventDetails = `Error stringifying event details: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      addLog(
        `Data channel [${channel.label}] closed${prefix ? ` (${prefix})` : ""}. Event details: ${eventDetails}`
      );

      if (channel.label === "reliable_control") {
        // Disconnection not initiated by user, try to reconnect - use closeConnection instead of disconnect
        closeConnection(false);
      }
    };

    channel.onmessage = (event) => {
      handleChannelMessage(event, channel, prefix);
    };

    return channel;
  }, [
    addLog, 
    audio.isMuted.value, 
    connected,
    hasRequestedInstrumentDefinition.value, 
    handleChannelMessage, 
    sendAllSynthParameters, 
    sendAudioStateOnly
    // disconnect removed to avoid circular dependency
  ]);

  // Initialize the WebRTC connection - define first because connect will use it
  const initRTC = useCallback(async () => {
    // Get ICE servers from Twilio
    const iceServers = await fetchIceServers();
    console.log("Using ICE servers:", iceServers);

    const peerConnection = new RTCPeerConnection({
      iceServers,
    });
    connection.value = peerConnection;
    // Log connection and ICE state changes for debugging
    peerConnection.oniceconnectionstatechange = () => {
      addLog(`ICE connection state: ${peerConnection.iceConnectionState}`);
    };
    peerConnection.onconnectionstatechange = () => {
      addLog(`Connection state: ${peerConnection.connectionState}`);
    };

    // Create data channels
    addLog("Creating reliable_control data channel");
    const reliableChan = peerConnection.createDataChannel("reliable_control", {
      ordered: true,
    });
    reliableControlChannel.value = reliableChan;
    setupDataChannel(reliableChan, "CLIENT_RELIABLE");

    addLog("Creating streaming_updates data channel");
    const streamingChan = peerConnection.createDataChannel("streaming_updates", {
      ordered: false,
      maxRetransmits: 0, // Fire and forget for UDP-like behavior
    });
    streamingUpdatesChannel.value = streamingChan;
    setupDataChannel(streamingChan, "CLIENT_STREAMING");

    // Handle receiving data channels from the remote peer (controller)
    peerConnection.ondatachannel = (event) => {
      const receivedChannel = event.channel;
      addLog(`Received data channel: ${receivedChannel.label}`);
      if (receivedChannel.label === "reliable_control") {
        reliableControlChannel.value = receivedChannel;
        setupDataChannel(receivedChannel, "REMOTE_RELIABLE");
      } else if (receivedChannel.label === "streaming_updates") {
        streamingUpdatesChannel.value = receivedChannel;
        setupDataChannel(receivedChannel, "REMOTE_STREAMING");
      } else {
        addLog(`Received unknown data channel: ${receivedChannel.label}`);
      }
    };

    // Send ICE candidates to the other peer
    peerConnection.onicecandidate = (event) => {
      console.log("ICE candidate generated:", event.candidate);
      if (event.candidate && socket.value) {
        console.log("Sending ICE candidate to", targetId.value);
        const iceMessage = {
          type: "ice-candidate",
          target: targetId.value,
          data: event.candidate,
        };
        socket.value.send(JSON.stringify(iceMessage));
        console.log("ICE candidate sent:", iceMessage);
      } else if (!event.candidate) {
        console.log("ICE candidate gathering completed");
      } else if (!socket.value) {
        console.error("Cannot send ICE candidate: WebSocket not connected");
      }
    };

    // Create offer
    console.log("Creating WebRTC offer for target:", targetId.value);
    peerConnection.createOffer()
      .then((offer) => {
        console.log("Offer created, setting local description");
        return peerConnection.setLocalDescription(offer);
      })
      .then(() => {
        if (socket.value) {
          console.log("Sending offer via signaling server to:", targetId.value);
          const offerMessage = {
            type: "offer",
            target: targetId.value,
            data: peerConnection.localDescription,
          };
          socket.value.send(JSON.stringify(offerMessage));
          console.log("Offer message sent:", offerMessage);
          addLog("Sent offer");
        } else {
          console.error("Cannot send offer: WebSocket not connected");
          addLog("Error: WebSocket not connected");
        }
      })
      .catch((error) => {
        console.error("Error creating/sending offer:", error);
        addLog(
          `Error creating offer: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }, [addLog, connection, reliableControlChannel, setupDataChannel, socket, streamingUpdatesChannel, targetId.value]);

  // Connect to the target peer - defined after initRTC to avoid circular dependency
  const connect = useCallback(async () => {
    if (!targetId.value) {
      addLog("Please enter a target ID");
      return;
    }

    try {
      await initRTC();
    } catch (error) {
      addLog(`Error connecting: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [addLog, initRTC, targetId.value]);

  // Send a message through the data channel
  const sendMessage = () => {
    if (!reliableControlChannel.value || reliableControlChannel.value.readyState !== "open") {
      addLog("Reliable control channel not open for sending messages");
      return;
    }

    reliableControlChannel.value.send(message.value);
    addLog(`Sent: ${message.value}`);
    message.value = "";
  };

  // Connection status is now verified directly by the controller
  // through ping/pong messages rather than being reported by clients

  // Request the active controller from the signaling server - moved before it's referenced in other functions
  const requestActiveController = useCallback(() => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      console.log("Requesting active controller from signaling server");
      socket.value.send(JSON.stringify({
        type: "get-controller",
      }));
      addLog("Requested active controller");
    } else {
      console.error("Cannot request controller: WebSocket not open");
    }
  }, [addLog, socket]);

  // Check if we need to reconnect
  const checkReconnection = useCallback(() => {
    // Only try to reconnect if:
    // 1. Not already connected
    // 2. We have an active controller
    // 3. Not already attempting to connect
    if (
      !connected.value && activeController.value && !connection.value
    ) {
      console.log("Connection check: Attempting to reconnect to controller");
      addLog("Attempting to reconnect to controller");

      // Reset auto-connect flag to allow reconnection
      autoConnectAttempted.value = false;

      // Connect to the controller using targetId and connect directly
      if (activeController.value) {
        targetId.value = activeController.value;
        setTimeout(() => {
          connect();
        }, 10);
      }
    }
  }, [
    connected.value, 
    activeController.value, 
    connection.value, 
    addLog, 
    autoConnectAttempted,
    connect,
    targetId
    // connectToController removed to avoid circular dependencies
  ]);

  // Disconnect and clean up the connection - Updated to avoid circular dependency with connectWebSocket
  const disconnect = useCallback((isUserInitiated: boolean = true) => {
    if (isUserInitiated) {
      addLog("[disconnect TRACE] User initiated disconnect.");
      intentionallyDisconnectedSocketRef.current = true; // Set a-priori
    } else {
      addLog("[disconnect TRACE] System initiated disconnect (e.g., WebRTC failed).");
      // intentionallyDisconnectedSocketRef.current should be false here.
    }

    // Close WebRTC data channels
    if (reliableControlChannel.value) {
      addLog(`Closing reliable_control channel: ${reliableControlChannel.value.label}`);
      reliableControlChannel.value.close();
      reliableControlChannel.value = null;
    }
    if (streamingUpdatesChannel.value) {
      addLog(`Closing streaming_updates channel: ${streamingUpdatesChannel.value.label}`);
      streamingUpdatesChannel.value.close();
      streamingUpdatesChannel.value = null;
    }

    // Close RTCPeerConnection
    if (connection.value) {
      connection.value.close();
      connection.value = null;
    }

    // Set WebRTC state flags
    connected.value = false;
    hasRequestedInstrumentDefinition.value = false; // Reset the flag on disconnect

    // Only reset these if user initiated the disconnect
    if (isUserInitiated) {
      // Close the websocket cleanly - intentionallyDisconnectedSocketRef.current is already true
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        socket.value.close(1000, "User initiated disconnect");
      }
      // socket.value = null; // Let the onclose handler null this out
      
      targetId.value = "";
      autoConnectAttempted.value = false; // Allow next auto-connect if needed by other logic
      addLog("Disconnected by user. WebSocket closed intentionally.");
    } else {
      // This was an automatic/error disconnect (e.g., peer connection failed)
      // The existing onclose handler for the socket (if any) will manage retries
      if (socket.value) {
        socket.value.close(1006, "Underlying connection failed"); // Or some other appropriate code
      }
      
      targetId.value = ""; 
      
      // Re-enable automatic controller search after WebRTC disconnect
      addLog("[disconnect TRACE] System disconnect - will attempt to reconnect to controller if available.");
      setTimeout(requestActiveController, 2000); // This will re-trigger controller search
    }
  }, [
    addLog, 
    autoConnectAttempted, 
    connected, 
    connection, 
    hasRequestedInstrumentDefinition, 
    intentionallyDisconnectedSocketRef,
    reliableControlChannel, 
    requestActiveController,
    socket, 
    streamingUpdatesChannel, 
    targetId
  ]);

  // Auto-connect to the active controller - defined after connect
  const connectToController = useCallback((controllerId: string) => {
    if (!controllerId) {
      addLog("[connectToController] No active controller available");
      return;
    }

    if (connected.value) {
      addLog("[connectToController] Already connected, not connecting to controller");
      return;
    }

    addLog(`[connectToController] Attempting to connect to controller: ${controllerId}`);
    activeController.value = controllerId;

    // Set target ID for WebRTC connection
    targetId.value = controllerId;

    // Set flag before calling connect to prevent multiple attempts
    // Note: This flag is primarily for WebSocket reconnects but also helps
    // avoid multiple rapid initRTC calls
    autoConnectAttempted.value = true;

    // Call connect with a small delay to ensure everything is ready
    setTimeout(() => {
      addLog(`[connectToController] Executing delayed WebRTC connection to ${controllerId}`);
      connect();
    }, 100);
  }, [activeController, addLog, autoConnectAttempted, connected, targetId, connect]);

  // Forward references to handler functions that will be defined later
  // We'll update the connectWebSocket implementation after we define the handlers

  // Handle an incoming offer
  const handleOffer = useCallback(async (message: OfferMessage) => {
    console.log("Handling WebRTC offer from:", message.source, message);

    if (!connection.value) {
      // Get ICE servers from Twilio
      const iceServers = await fetchIceServers();
      console.log("Using ICE servers (handleOffer):", iceServers);

      const peerConnection = new RTCPeerConnection({
        iceServers,
      });
      connection.value = peerConnection;
      console.log("New RTCPeerConnection created for incoming offer");

      peerConnection.onicecandidate = (event) => {
        console.log(
          "ICE candidate generated (offer handler):",
          event.candidate,
        );
        if (event.candidate && socket.value) {
          console.log("Sending ICE candidate to", message.source);
          const iceMessage = {
            type: "ice-candidate",
            target: message.source,
            data: event.candidate,
          };
          socket.value.send(JSON.stringify(iceMessage));
          console.log("ICE candidate sent in response to offer:", iceMessage);
        } else if (!event.candidate) {
          console.log("ICE candidate gathering completed (offer handler)");
        } else if (!socket.value) {
          console.error("Cannot send ICE candidate: WebSocket not connected");
        }
      };

      peerConnection.ondatachannel = (event) => {
        const receivedChannel = event.channel;
        addLog(
          `Data channel received in offer handler: ${receivedChannel.label}`,
        );
        if (receivedChannel.label === "reliable_control") {
          reliableControlChannel.value = receivedChannel;
          setupDataChannel(receivedChannel, "OFFER_RELIABLE");
        } else if (receivedChannel.label === "streaming_updates") {
          streamingUpdatesChannel.value = receivedChannel;
          setupDataChannel(receivedChannel, "OFFER_STREAMING");
        } else {
          addLog(`Received unknown data channel in offer: ${receivedChannel.label}`);
        }
      };

      console.log("Setting remote description from offer");
      peerConnection.setRemoteDescription(
        new RTCSessionDescription(message.data),
      )
        .then(() => {
          console.log("Remote description set, creating answer");
          return peerConnection.createAnswer();
        })
        .then((answer) => {
          console.log("Answer created, setting local description");
          return peerConnection.setLocalDescription(answer);
        })
        .then(() => {
          if (socket.value) {
            console.log("Sending answer to:", message.source);
            const answerMessage = {
              type: "answer",
              target: message.source,
              data: peerConnection.localDescription,
            };
            socket.value.send(JSON.stringify(answerMessage));
            console.log("Answer sent:", answerMessage);

            // Store the target ID for future communication
            targetId.value = message.source;
            addLog("Sent answer");
          } else {
            console.error("Cannot send answer: WebSocket not connected");
          }
        })
        .catch((error) => {
          console.error("Error creating/sending answer:", error);
          addLog(
            `Error creating answer: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }
  }, [addLog, connection, reliableControlChannel, setupDataChannel, socket, streamingUpdatesChannel, targetId]);

  // Handle an incoming answer
  const handleAnswer = useCallback((message: AnswerMessage) => {
    console.log("Handling WebRTC answer from:", message.source, message);

    if (connection.value) {
      console.log("Setting remote description from answer");
      connection.value.setRemoteDescription(
        new RTCSessionDescription(message.data),
      )
        .then(() => {
          console.log("Remote description set successfully");
          addLog("Remote description set");
        })
        .catch((error) => {
          console.error("Error setting remote description:", error);
          addLog(
            `Error setting remote description: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    } else {
      console.error("Cannot handle answer: No connection exists");
      addLog("Error: No connection exists to handle answer");
    }
  }, [addLog, connection]);

  // Handle an incoming ICE candidate
  const handleIceCandidate = useCallback((message: IceCandidateMessage) => {
    console.log("Handling ICE candidate from:", message.source, message);

    if (connection.value) {
      console.log("Adding ICE candidate to connection");
      connection.value.addIceCandidate(
        message.data ? new RTCIceCandidate(message.data) : null,
      )
        .then(() => {
          console.log("ICE candidate added successfully");
          addLog("Added ICE candidate");
        })
        .catch((error) => {
          console.error("Error adding ICE candidate:", error);
          addLog(
            `Error adding ICE candidate: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    } else {
      console.error("Cannot handle ICE candidate: No connection exists");
      addLog("Error: No connection exists to handle ICE candidate");
    }
  }, [addLog, connection]);

  // Connect to the WebSocket signaling server - simplified version for debugging
  const connectWebSocket = useCallback(() => {
    addLog(`[connectWebSocket TRACE] Called. Current socket state: ${socket.value?.readyState ?? 'null'}`);

    if (socket.value && (socket.value.readyState === WebSocket.OPEN || socket.value.readyState === WebSocket.CONNECTING)) {
      addLog(`[connectWebSocket TRACE] WebSocket already open or connecting. Aborting.`);
      return;
    }

    addLog(`[connectWebSocket TRACE] Creating new WebSocket...`);
    // deno-lint-ignore no-window
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // deno-lint-ignore no-window
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/signal`);
    
    // IMPORTANT: Assign to socket.value IMMEDIATELY after creation
    // to prevent multiple instances if this function is somehow called rapidly.
    socket.value = ws; 

    ws.onopen = () => {
      addLog(`[ws.onopen TRACE] WebSocket opened. Sending register for ID: ${id.value}`);
      // DO NOT set autoConnectAttempted or intentionallyDisconnectedSocketRef here for this test
      ws.send(JSON.stringify({ type: "register", id: id.value }));
      
      // REINSTATE requestActiveController with safety check
      setTimeout(() => {
        if (socket.value?.readyState === WebSocket.OPEN) { // Check if still open
            addLog(`[ws.onopen TRACE] Requesting active controller.`);
            requestActiveController();
        }
      }, 500); // Slight delay
      
      // REINSTATE heartbeat interval
      // Clear any existing heartbeat interval before starting a new one
      if (heartbeatIntervalRef.current !== null) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      addLog("[ws.onopen TRACE] Starting WebSocket heartbeat interval.");
      heartbeatIntervalRef.current = setInterval(() => {
        if (socket.value && socket.value.readyState === WebSocket.OPEN) {
          // addLog("[Heartbeat TRACE] Sending heartbeat"); // Can be too noisy
          socket.value.send(JSON.stringify({ type: "heartbeat" }));
        } else {
          // If socket is not open, the interval should have been cleared by onclose/onerror.
          // This is a safeguard or could indicate an issue if reached.
          addLog("[Heartbeat TRACE] Heartbeat: Socket not open. Clearing interval.");
          if (heartbeatIntervalRef.current !== null) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
        }
      }, 30000); // Send heartbeat every 30 seconds
    };

    ws.onclose = (event) => {
      addLog(`[ws.onclose TRACE] WebSocket closed. Code: ${event.code}, Reason: '${event.reason}', Clean: ${event.wasClean}. intentional: ${intentionallyDisconnectedSocketRef.current}, autoAttempt: ${autoConnectAttempted.value}`);
      
      if (heartbeatIntervalRef.current !== null) {
        addLog("[ws.onclose TRACE] Clearing heartbeat interval.");
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Set socket.value to null only if this instance is the one in the signal
      if (socket.value === ws) {
          socket.value = null;
      }

      if (intentionallyDisconnectedSocketRef.current) {
        addLog("[ws.onclose TRACE] Intentional disconnect. No automatic reconnect. Resetting intentional flag.");
        intentionallyDisconnectedSocketRef.current = false; // Reset for next manual connection attempt
      } else if (autoConnectAttempted.value) {
        addLog("[ws.onclose TRACE] Auto-reconnect attempt already in progress or just failed. Not scheduling another from onclose.");
        // If autoConnectAttempted was true, it means either:
        // 1. connectWebSocket was called, failed, and onerror/onclose set it to true.
        // 2. connectWebSocket was called, onopen fired (resetting autoConnectAttempted to false),
        //    then it closed again, and this is the first onclose *after* that successful open.
        // In case #2, we DO want to retry.
        // The critical thing is that autoConnectAttempted is only reset to false by a successful onopen.
        // So, if it's true here, it means onopen hasn't fired successfully SINCE it was set to true.
        // Let's refine: we should try to reconnect if it's NOT intentional,
        // and we're not *currently inside* a setTimeout from a previous onclose/onerror.
        // The autoConnectAttempted flag itself signifies an attempt is scheduled/running.
        // So if it's true, another attempt is already armed.
      } else {
        // This means: NOT intentional AND no auto-connect attempt is currently "active" (i.e. scheduled by a previous onclose/onerror).
        // This is where we schedule a new attempt.
        addLog(`[ws.onclose TRACE] Unexpected close. Scheduling reconnect. Setting autoAttempt=true.`);
        autoConnectAttempted.value = true; 
        setTimeout(() => {
          addLog(`[ws.onclose TRACE] setTimeout: Now calling connectWebSocket. Current autoAttempt: ${autoConnectAttempted.value}`); // Should be true
          connectWebSocket(); 
        }, 3000 + Math.floor(Math.random() * 2000)); // Retry after 3-5 seconds with jitter
      }
    };

    ws.onerror = (error) => {
      const errorMessage = `WebSocket error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;
      addLog(`[ws.onerror TRACE] Fired. Error: ${errorMessage}. intentional: ${intentionallyDisconnectedSocketRef.current}, autoAttempt: ${autoConnectAttempted.value}, socketState: ${socket.value?.readyState ?? 'null'}`);
      
      if (heartbeatIntervalRef.current !== null) {
        addLog("[ws.onerror TRACE] Clearing heartbeat interval due to error.");
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // No need to schedule a reconnect from onerror if onclose will handle it.
      // However, if onclose might NOT fire for certain errors, or if we want a faster response to error:
      // The primary mechanism is: error -> close -> onclose attempts reconnect.
      // If onclose is robust, onerror mainly just logs.
      // Let's keep onerror from directly scheduling a reconnect if onclose will do it.
      // The only reason for onerror to act is if the socket state is such that onclose might not fire,
      // OR if we want to ensure socket.value is nulled before onclose.

      // If an error occurs, and the socket isn't already closed (which would trigger onclose),
      // explicitly close it to ensure the onclose logic runs.
      if (socket.value === ws && socket.value.readyState !== WebSocket.CLOSED) {
          addLog("[ws.onerror TRACE] Error on open/connecting socket. Explicitly closing to trigger onclose for reconnect logic.");
          socket.value.close(); // This will trigger the ws.onclose handler
      }
      // Ensure socket.value is nulled if this was the current socket
      if (socket.value === ws) {
          socket.value = null;
      }
    };

    // REINSTATE onmessage handler with careful controls
    ws.onmessage = (event) => {
      addLog(`[ws.onmessage TRACE] Received raw: ${event.data}`);
      try {
        const message = JSON.parse(event.data as string);
        // addLog(`[ws.onmessage TRACE] Parsed: ${JSON.stringify(message)}`); // Can be noisy

        switch (message.type) {
          case "controller-info":
            addLog(`[controller-info] Received: ${JSON.stringify(message)}`);
            if (message.controllerId) {
              activeController.value = message.controllerId;
              addLog(`[controller-info] Active controller is ${message.controllerId}.`);

              addLog(`[controller-info] Checking auto-connect conditions: WebRTC connected.value=${connected.value}, WebSocket autoConnectAttempted.value=${autoConnectAttempted.value}`);

              // The 'autoConnectAttempted' flag is for WebSocket auto-reconnection.
              // 'connected.value' refers to the WebRTC peer connection state.
              if (!connected.value) { // Only attempt if not already WebRTC-connected
                 addLog(`[controller-info] Conditions MET for WebRTC auto-connect. Calling connectToController for ${message.controllerId}`);
                 connectToController(message.controllerId); 
              } else {
                 addLog(`[controller-info] Conditions NOT MET for WebRTC auto-connect (already WebRTC connected: ${connected.value}).`);
              }
            } else {
              activeController.value = null;
              addLog("[controller-info] No active controller available.");
            }
            break;
          case "offer":
            addLog(`[offer] Received from ${message.source}`);
            handleOffer(message as OfferMessage); // Ensure types are correct
            break;
          case "answer":
            addLog(`[answer] Received from ${message.source}`);
            handleAnswer(message as AnswerMessage);
            break;
          case "ice-candidate":
            addLog(`[ice-candidate] Received from ${message.source}`);
            handleIceCandidate(message as IceCandidateMessage);
            break;
          // NO "heartbeat_ack" or similar needed from server for client's heartbeat
          default:
            addLog(`[ws.onmessage TRACE] Unknown message type: ${message.type}`);
        }
      } catch (error) {
        addLog(`[ws.onmessage TRACE] Error parsing message: ${event.data}, Error: ${error}`);
      }
    };

  }, [
    id,
    addLog,
    socket,
    activeController,
    connected,
    autoConnectAttempted,
    connectToController, // Added back since we now call it in controller-info handler
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    requestActiveController // Called in onopen
  ]);

  // Initialize audio context with user gesture
  const initAudioContext = useCallback(async () => {
    try {
      // Initialize the audio context
      // Default Mode will automatically start in volume check mode
      await audio.initializeAudioContext();

      // Update UI state
      showAudioButton.value = false;

      // Log success
      addLog("Audio initialized with integrated volume check mode");
    } catch (e) {
      addLog(
        `Error initializing audio: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      showAudioButton.value = true; // Show audio button again if initialization fails
    }
  }, []);

  // Connect to the signaling server on mount and clean up on unmount
  useEffect(() => {
    addLog("[Main useEffect TRACE] Mount effect: Calling connectWebSocket.");
    connectWebSocket();

    // ALL OTHER LOGIC (wake lock, etc.) TEMPORARILY COMMENTED OUT for this test
    // requestWakeLock().then((lock) => {
    //   wakeLock.value = lock;
    // });
    // const cleanupWakeLock = setupWakeLockListeners(wakeLock, () => console.log("..."));
    
    return () => {
      addLog("[Main useEffect TRACE] Cleanup effect (unmount).");
      // cleanupWakeLock && cleanupWakeLock(); // If re-enabled
      
      // Clear the heartbeat interval if it exists
      if (heartbeatIntervalRef.current !== null) {
        addLog("[Main useEffect TRACE] Clearing heartbeat interval on unmount.");
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // If there's a socket, close it intentionally
      if (socket.value) {
        addLog("[Main useEffect TRACE] Closing socket on unmount.");
        // CRITICAL: Set intentional flag BEFORE closing to ensure onclose handler sees it
        intentionallyDisconnectedSocketRef.current = true;
        socket.value.close(1000, "Component unmounting");
        socket.value = null;
      }
    };
  }, []); // ENSURE EMPTY DEPENDENCY ARRAY. `connectWebSocket` is stable via useCallback.

  // Handle pressing Enter in the message input
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && connected.value && message.value.trim()) {
      sendMessage();
    }
  };

  return (
    <div class="container">
      {showAudioButton.value
        ? ( // State 1: Initial "Enable Audio" screen
          <div class="audio-enable">
            <h1>WebRTC Synth</h1>
            <div class="controller-connection-info">
              {activeController.value && !connected.value
                ? (
                  <div class="controller-available">
                    <p>Controller available: {activeController.value}</p>
                    <button
                      type="button"
                      class="connect-button"
                      onClick={() =>
                        connectToController(activeController.value as string)}
                    >
                      Connect to Controller
                    </button>
                  </div>
                )
                : connected.value
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
            {/* Conditionally render Volume Check UI elements */}
            {audio.isVolumeCheckPending.value && (
              <div
                class="volume-check-active-default-mode"
                style="text-align: center; padding: 20px; border-bottom: 1px solid #eee; margin-bottom: 20px;"
              >
                <h1>
                  Volume Adjustment ({audio.activeControllerMode.value} Mode)
                </h1>
                <p style="margin-bottom: 20px;">
                  Pink noise is playing. Please adjust your system volume to a
                  comfortable level.
                </p>
                <p style="font-size: 0.8em; color: #666; margin-bottom: 20px;">
                  (Note: This pink noise is intentionally quiet. Set your system
                  volume so you can hear it clearly but comfortably.)
                </p>
                <button
                  type="button"
                  onClick={handleVolumeCheckDone}
                  class="audio-button"
                  style="padding: 10px 20px; font-size: 1.1em;"
                >
                  Done Adjusting Volume
                </button>
              </div>
            )}

            {/* Main Synth UI elements */}
            <div class="synth-ui">
              <h1>WebRTC Synth</h1>

              <div class="status-bar">
                <div>
                  <span class="id-display">ID: {id.value}</span>
                  <span
                    class={`connection-status ${
                      connected.value
                        ? "status-connected"
                        : "status-disconnected"
                    }`}
                  >
                    {connected.value ? "Connected" : "Disconnected"}
                  </span>
                  <span
                    class={`audio-status audio-${audio.audioContextState.value}`}
                  >
                    Audio: {audio.audioContextState.value}
                  </span>
                  <span
                    class={`controller-mode ${audio.activeControllerMode.value}`}
                  >
                    Mode: {audio.activeControllerMode.value}
                  </span>
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
                {activeController.value && !connected.value && (
                  <div class="controller-status">
                    <span>Controller available: {activeController.value}</span>
                    <button
                      type="button"
                      onClick={() =>
                        connectToController(activeController.value as string)}
                      class="auto-connect-button"
                    >
                      Connect
                    </button>
                  </div>
                )}
              </div>

              {/* Synth component - FFT analyzer and parameter display */}
              <Synth audio={audio} />

              <div class="connection-info">
                <input
                  type="text"
                  placeholder="Enter target ID"
                  value={targetId.value}
                  onInput={(e) => targetId.value = e.currentTarget.value}
                  disabled={connected.value}
                />
                {connected.value
                  ? (
                    <button
                      type="button"
                      onClick={() => disconnect(true)}
                      class="disconnect-button"
                    >
                      Disconnect
                    </button>
                  )
                  : (
                    <button
                      type="button"
                      onClick={connect}
                      disabled={!targetId.value.trim()}
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
                  disabled={!connected.value}
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!connected.value || !message.value.trim()}
                >
                  Send
                </button>
              </div>

              {/* Mode indicator and debugger UI */}
              <div class="mode-selector">
                <h3>Controller Mode</h3>
                <div class="mode-info">
                  <p>
                    Current mode:{" "}
                    <span
                      class={`mode-display ${audio.activeControllerMode.value}`}
                    >
                      {audio.activeControllerMode.value}
                    </span>
                  </p>
                  {!DEV_MODE && (
                    <p class="mode-info-text">
                      The controller determines the active mode. This display is
                      for information only.
                    </p>
                  )}
                </div>

                {/* Debug UI only visible in DEV_MODE */}
                {DEV_MODE && (
                  <div class="mode-debug">
                    <p class="dev-mode-label">DEVELOPMENT MODE ONLY</p>
                    <div class="mode-buttons">
                      {Object.values(KNOWN_CONTROLLER_MODES).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          class={`mode-button ${
                            audio.activeControllerMode.value === mode
                              ? "active"
                              : ""
                          }`}
                          onClick={() => {
                            // In dev mode, directly update the controller mode signal
                            controllerMode.value = mode;
                            addLog(`DEV: Manually set mode to ${mode}`);
                          }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    <p class="dev-mode-note">
                      Note: In production, only the controller can change the
                      mode. This UI is for testing only.
                    </p>
                  </div>
                )}
              </div>

              <div class="log">
                <h3>Connection Log</h3>
                <ul>
                  {logs.value.map((log, index) => <li key={index}>{log}</li>)}
                </ul>
              </div>
            </div>{" "}
            {/* End of <div class="synth-ui"> */}
          </div> /* End of <div class="synth-and-volume-adjust-ui"> */
        )}
    </div>
  );
}
