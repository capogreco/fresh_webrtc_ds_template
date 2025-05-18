import { useSignal } from "@preact/signals";
import { useCallback, useEffect } from "preact/hooks";
import { h as _h } from "preact";
import {
  requestWakeLock,
  setupWakeLockListeners,
  type WakeLockSentinel,
} from "../lib/utils/wakeLock.ts";
import { PARAM_DESCRIPTORS } from "../lib/synth/index.ts";
import { formatTime } from "../lib/utils/formatTime.ts";
import { fetchIceServers } from "../lib/webrtc.ts";
import { useAudioEngine } from "./hooks/useAudioEngine.ts";
import Synth from "./Synth.tsx";

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
type ParamHandler = (value: unknown, source?: string) => void;
type MessageHandler = (event: MessageEvent, channel: RTCDataChannel) => void;

// Specific types for signaling messages
interface BaseSignalMessage {
  source: string;
  target?: string; // Controller messages often include a target
  type: "offer" | "answer" | "ice-candidate"; // Literal types for discriminated union
}

interface OfferMessage extends BaseSignalMessage {
  type: "offer";
  data: RTCSessionDescriptionInit;
}

interface AnswerMessage extends BaseSignalMessage {
  type: "answer";
  data: RTCSessionDescriptionInit;
}

interface IceCandidateMessage extends BaseSignalMessage {
  type: "ice-candidate";
  data: RTCIceCandidateInit | null; // Candidate can be null to signal end
}

// Web Audio Synthesizer Nodes - now managed by useAudioEngine hook

export default function WebRTC() {
  // State management
  const id = useSignal(Math.random().toString(36).substring(2, 8));
  const targetId = useSignal("");
  const connected = useSignal(false);
  const message = useSignal("");
  const logs = useSignal<string[]>([]);
  const connection = useSignal<RTCPeerConnection | null>(null);
  const dataChannel = useSignal<RTCDataChannel | null>(null);
  const socket = useSignal<WebSocket | null>(null);
  const activeController = useSignal<string | null>(null);
  const autoConnectAttempted = useSignal(false);

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

  // Initialize audio engine using the useAudioEngine hook
  const audio = useAudioEngine(addLog);

  // Handler for when user finishes pink noise volume adjustment
  const handleVolumeCheckDone = useCallback(() => {
    audio.handleVolumeCheckDone();
    showAudioButton.value = false; // Hide the enable audio button
  }, []);

  // Using imported formatTime utility for log timestamps

  // Utility for sending a parameter update to controller

  // Utility for sending all synth parameters to controller
  const sendAllSynthParameters = (channel: RTCDataChannel) => {
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
      }));

      addLog("Sent synth parameters and audio state to controller");
    } catch (error) {
      console.error("Error sending synth parameters:", error);
    }
  };

  // Send only audio state to controller
  const sendAudioStateOnly = (channel: RTCDataChannel) => {
    try {
      channel.send(JSON.stringify({
        type: "audio_state",
        isMuted: true, // Audio is muted
        audioState: "disabled",
        pendingNote: audio.isNoteActive.value, // Let controller know if there's a pending note
      }));
      addLog("Sent audio state to controller (audio not enabled)");
    } catch (error) {
      console.error("Error sending audio state:", error);
    }
  };

  // Handle ping messages
  const handlePingMessage = (
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
  };

  // Handle test messages
  const handleTestMessage = (
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
  };

  // Unified parameter handler map
  // Function to send parameter updates to controller
  const sendParamToController = (param: string, value: unknown) => {
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param,
          value,
        }));
      } catch (error) {
        console.error(`Error sending ${param} update:`, error);
      }
    }
  };

  const paramHandlers: Record<string, ParamHandler> = {
    frequency: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.frequency.validate(Number(value));
      audio.updateSynthParam("frequency", validValue);
      sendParamToController("frequency", validValue);
      addLog(`Frequency updated to ${validValue}Hz by ${source}`);
    },
    waveform: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.waveform.validate(value);
      audio.updateSynthParam("waveform", validValue);
      sendParamToController("waveform", validValue);
      addLog(`Waveform updated to ${validValue} by ${source}`);
    },
    volume: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.volume.validate(Number(value));
      audio.updateSynthParam("volume", validValue);
      sendParamToController("volume", validValue);
      addLog(`Volume updated to ${validValue} by ${source}`);
    },
    detune: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.detune.validate(Number(value));
      audio.updateSynthParam("detune", validValue);
      sendParamToController("detune", validValue);
      addLog(`Detune updated to ${validValue} cents by ${source}`);
    },
    oscillatorEnabled: (value, source = "controller") => {
      const enabled = PARAM_DESCRIPTORS.oscillatorEnabled.validate(value);
      // Handle as note on/off
      if (enabled) {
        audio.playNote(audio.frequency.value);
        // Send note_on state to controller if connected
        if (dataChannel.value && dataChannel.value.readyState === "open") {
          try {
            dataChannel.value.send(JSON.stringify({
              type: "note_on",
              frequency: audio.frequency.value,
            }));
          } catch (error) {
            console.error("Error sending note_on:", error);
          }
        }
      } else {
        audio.stopNote();
        // Send note_off to controller if connected
        if (dataChannel.value && dataChannel.value.readyState === "open") {
          try {
            dataChannel.value.send(JSON.stringify({
              type: "note_off",
            }));
          } catch (error) {
            console.error("Error sending note_off state:", error);
          }
        }
      }
      addLog(`Note ${enabled ? "on" : "off"} by ${source}`);
    },
    attack: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.attack.validate(Number(value));
      audio.updateSynthParam("attack", validValue);
      sendParamToController("attack", validValue);
      addLog(`Attack updated to ${validValue}s by ${source}`);
    },
    release: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.release.validate(Number(value));
      audio.updateSynthParam("release", validValue);
      sendParamToController("release", validValue);
      addLog(`Release updated to ${validValue}s by ${source}`);
    },
    filterCutoff: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.filterCutoff.validate(Number(value));
      audio.updateSynthParam("filterCutoff", validValue);
      sendParamToController("filterCutoff", validValue);
      addLog(`Filter cutoff updated to ${validValue}Hz by ${source}`);
    },
    filterResonance: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.filterResonance.validate(
        Number(value),
      );
      audio.updateSynthParam("filterResonance", validValue);
      sendParamToController("filterResonance", validValue);
      addLog(`Filter resonance updated to ${validValue} by ${source}`);
    },
    vibratoRate: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.vibratoRate.validate(Number(value));
      audio.updateSynthParam("vibratoRate", validValue);
      sendParamToController("vibratoRate", validValue);
      addLog(`Vibrato rate updated to ${validValue}Hz by ${source}`);
    },
    vibratoWidth: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.vibratoWidth.validate(Number(value));
      audio.updateSynthParam("vibratoWidth", validValue);
      sendParamToController("vibratoWidth", validValue);
      addLog(`Vibrato width updated to ${validValue} cents by ${source}`);
    },
    portamentoTime: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.portamentoTime.validate(
        Number(value),
      );
      audio.updateSynthParam("portamentoTime", validValue);
      sendParamToController("portamentoTime", validValue);
      addLog(`Portamento time updated to ${validValue}s by ${source}`);
    },
    note: (value, source = "controller") => {
      // Handle note name directly using audio engine
      audio.playNoteByName(value as string);
      // Send to controller if connected
      sendParamToController("note", value);
      addLog(`Note ${value} (${audio.frequency.value}Hz) set by ${source}`);
    },
  };

  // Unified channel message handler
  const handleChannelMessage = (
    event: MessageEvent,
    channel: RTCDataChannel,
    prefix: string = "",
  ) => {
    console.log(`[${prefix || "CLIENT"}] Received message:`, event.data);

    // Try to parse JSON messages
    if (typeof event.data === "string" && event.data.startsWith("{")) {
      try {
        const message = JSON.parse(event.data);

        // Handle synth parameter update messages
        if (message.type === "synth_param") {
          const param = message.param;
          const value = message.value;

          // Special handling for oscillatorEnabled - control note on/off
          if (param === "oscillatorEnabled") {
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
                  `Playing note ${audio.currentNote.value} (${audio.frequency.value}Hz) due to controller setting`,
                );
              } else {
                // If audio not ready or muted, log the note request and notify controller
                addLog(
                  `Note ${audio.currentNote.value} requested but audio not enabled or muted`,
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

          if (paramHandlers[param]) {
            paramHandlers[param](
              value,
              prefix ? `${prefix} controller` : "controller",
            );
          } else {
            console.warn(`Unknown synth parameter: ${param}`);
            addLog(`Unknown synth parameter: ${param}`);
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
            // Disconnect (but not user initiated)
            disconnect(false);

            // Connect to new controller after a short delay
            setTimeout(() => {
              connectToController(message.newControllerId);
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
  };

  // Setup channel event handlers
  const setupDataChannel = (channel: RTCDataChannel, prefix: string = "") => {
    channel.onopen = () => {
      addLog(`Data channel opened${prefix ? ` (${prefix})` : ""}`);
      connected.value = true;

      // Send current synth parameters to the controller
      if (!audio.isMuted.value) { // Not muted means audio is enabled
        sendAllSynthParameters(channel);
      } else {
        // Even if audio is not enabled, send the audio state
        sendAudioStateOnly(channel);
      }

      // Request current controller state to ensure we're in sync
      // especially for note on/off status
      try {
        console.log("[SYNTH] Requesting current controller state");
        channel.send(JSON.stringify({
          type: "request_current_state",
        }));
        addLog("Requested current controller state");
      } catch (error) {
        console.error("Error requesting controller state:", error);
      }
    };

    channel.onclose = () => {
      addLog(`Data channel closed${prefix ? ` (${prefix})` : ""}`);

      // Disconnection not initiated by user, try to reconnect
      disconnect(false);
    };

    channel.onmessage = (event) => {
      handleChannelMessage(event, channel, prefix);
    };

    return channel;
  };

  // Connect to the target peer
  const connect = async () => {
    if (!targetId.value) {
      addLog("Please enter a target ID");
      return;
    }

    await initRTC();
  };

  // Initialize the WebRTC connection
  const initRTC = async () => {
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

    // Create data channel
    const channel = peerConnection.createDataChannel("dataChannel");
    dataChannel.value = channel;

    // Setup the data channel with our unified handlers
    setupDataChannel(channel, "CLIENT");

    // Handle receiving a data channel
    peerConnection.ondatachannel = (event) => {
      const receivedChannel = event.channel;
      dataChannel.value = receivedChannel;

      // Setup the received channel with our unified handlers
      setupDataChannel(receivedChannel, "RECEIVED");
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
  };

  // Send a message through the data channel
  const sendMessage = () => {
    if (!dataChannel.value || dataChannel.value.readyState !== "open") {
      addLog("Data channel not open");
      return;
    }

    dataChannel.value.send(message.value);
    addLog(`Sent: ${message.value}`);
    message.value = "";
  };

  // Connection status is now verified directly by the controller
  // through ping/pong messages rather than being reported by clients

  // Check if we need to reconnect
  const checkReconnection = () => {
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

      // Connect to the controller
      connectToController(activeController.value);
    }
  };

  // Disconnect and clean up the connection
  const disconnect = (isUserInitiated: boolean = true) => {
    if (dataChannel.value) {
      dataChannel.value.close();
      dataChannel.value = null;
    }

    if (connection.value) {
      connection.value.close();
      connection.value = null;
    }

    connected.value = false;

    // Only reset these if user initiated the disconnect
    if (isUserInitiated) {
      // Close the websocket cleanly
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        // We'll set up a new socket after disconnecting
        const oldSocket = socket.value;
        socket.value = null;

        // Close the socket properly
        oldSocket.close(1000, "User initiated disconnect");

        // Reconnect to signaling server with a new WebSocket
        setTimeout(connectWebSocket, 500);
      }

      targetId.value = "";
      autoConnectAttempted.value = false;
      addLog("Disconnected by user");
    } else {
      // This was an automatic/error disconnect
      addLog("Connection lost - will attempt to reconnect");
      targetId.value = ""; // Clear target ID to avoid confusion

      // Schedule a reconnection attempt after a delay
      setTimeout(() => {
        autoConnectAttempted.value = false; // Reset to allow auto-connect
        requestActiveController(); // Request controller info again
      }, 2000);
    }
  };

  // Request the active controller from the signaling server
  const requestActiveController = () => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      console.log("Requesting active controller from signaling server");
      socket.value.send(JSON.stringify({
        type: "get-controller",
      }));
      addLog("Requested active controller");
    } else {
      console.error("Cannot request controller: WebSocket not open");
    }
  };

  // Auto-connect to the active controller
  const connectToController = (controllerId: string) => {
    if (!controllerId) {
      console.log("No active controller available");
      return;
    }

    if (connected.value) {
      console.log("Already connected, not connecting to controller");
      return;
    }

    console.log(`Auto-connecting to controller: ${controllerId}`);
    addLog(`Auto-connecting to controller: ${controllerId}`);
    activeController.value = controllerId;

    // Set target ID and connect
    targetId.value = controllerId;

    // Set flag before calling connect to prevent multiple attempts
    autoConnectAttempted.value = true;

    // Call connect with a small delay to ensure everything is ready
    setTimeout(() => {
      console.log("Executing delayed connection to", controllerId);
      connect();
    }, 100);
  };

  // Connect to the WebSocket signaling server
  const connectWebSocket = () => {
    // deno-lint-ignore no-window
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // deno-lint-ignore no-window
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/signal`);
    socket.value = ws;

    ws.onopen = () => {
      addLog("Signaling server connected");
      ws.send(JSON.stringify({ type: "register", id: id.value }));

      // Request active controller after registration
      setTimeout(() => {
        requestActiveController();
      }, 500);

      // Start sending heartbeats to keep the connection alive
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          // Regular heartbeat - no state, just keeps connection open
          ws.send(JSON.stringify({
            type: "heartbeat",
          }));
        }
      }, 30000); // Send heartbeat every 30 seconds
    };

    ws.onclose = () => {
      addLog("Signaling server disconnected");

      // Don't try to reconnect if we deliberately disconnected
      if (connection.value || !socket.value) {
        setTimeout(connectWebSocket, 1000); // Reconnect
      }
    };

    ws.onerror = (error) => {
      addLog(`WebSocket error. Will try to reconnect...`);
      console.error("WebSocket error:", error);
    };

    ws.onmessage = (event) => {
      try {
        console.log("WebSocket message received:", event.data);
        const message = JSON.parse(event.data);
        console.log("Parsed message:", message);

        switch (message.type) {
          case "controller-info":
            // Handle controller info message
            console.log("Received controller info:", message);
            if (message.controllerId) {
              activeController.value = message.controllerId;
              addLog(`Active controller: ${message.controllerId}`);

              // Auto-connect if we have audio enabled and haven't attempted connection yet
              console.log("Received controller info, should connect:", {
                isMuted: audio.isMuted.value,
                connected: connected.value,
                autoConnectAttempted: autoConnectAttempted.value,
                audioState: audio.audioContextState.value,
                showAudioButton: showAudioButton.value,
              });

              // Always attempt connection regardless of audio state
              if (!connected.value && !autoConnectAttempted.value) {
                console.log(
                  "ATTEMPTING AUTO-CONNECTION to controller:",
                  message.controllerId,
                );
                connectToController(message.controllerId);
              }
            } else {
              activeController.value = null;
              addLog("No active controller available");
            }
            break;

          case "offer":
            // Handle offer asynchronously
            console.log("Received WebRTC offer from:", message.source);
            handleOffer(message).catch((error) => {
              console.error("Error handling offer:", error);
              addLog(
                `Error handling offer: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            });
            break;

          case "answer":
            console.log("Received WebRTC answer from:", message.source);
            handleAnswer(message);
            break;

          case "ice-candidate":
            console.log("Received ICE candidate from:", message.source);
            handleIceCandidate(message);
            break;

          default:
            addLog(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        addLog(
          `Error handling message: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    };
  };

  // Handle an incoming offer
  const handleOffer = async (message: OfferMessage) => {
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
        console.log(
          "Data channel received in offer handler:",
          event.channel.label,
        );
        const receivedChannel = event.channel;
        dataChannel.value = receivedChannel;

        // Setup the received channel with our unified handlers
        setupDataChannel(receivedChannel, "ALT");
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
  };

  // Handle an incoming answer
  const handleAnswer = (message: AnswerMessage) => {
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
  };

  // Handle an incoming ICE candidate
  const handleIceCandidate = (message: IceCandidateMessage) => {
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
  };

  // Initialize audio context with user gesture
  const initAudioContext = useCallback(async () => {
    try {
      // Initialize the audio context
      await audio.initializeAudioContext();

      // Start pink noise for volume check
      audio.startPinkNoise(0.15);

      // Update UI state
      showAudioButton.value = false;

      // Log success
      addLog("Audio initialized and pink noise started for volume check");
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
    // Connect to signaling server (but don't enable audio yet)
    connectWebSocket();

    // Request wake lock to prevent screen from sleeping
    requestWakeLock().then((lock) => {
      wakeLock.value = lock;
    });

    // Setup wake lock event listeners for reacquisition
    const cleanup = setupWakeLockListeners(
      () => wakeLock.value,
      (lock) => wakeLock.value = lock,
    );

    // Set up periodic connection checks for auto-reconnection
    const reconnectionInterval = setInterval(() => {
      checkReconnection();
    }, 10000); // Check every 10 seconds

    // Set up periodic controller info refresh
    const controllerRefreshInterval = setInterval(() => {
      // Only refresh if we're not connected to avoid unnecessary requests
      if (!connected.value) {
        requestActiveController();
      }
    }, 30000); // Refresh every 30 seconds

    // Cleanup function
    return () => {
      // Clear intervals
      clearInterval(reconnectionInterval);
      clearInterval(controllerRefreshInterval);

      // Release wake lock
      if (wakeLock.value) {
        wakeLock.value.release().catch((err) =>
          console.error("Error releasing wake lock", err)
        );
      }

      // Remove wake lock event listeners
      if (cleanup) cleanup();

      // Close connections
      if (socket.value) socket.value.close();
      if (connection.value) connection.value.close();

      // Audio engine cleanup is handled automatically by useAudioEngine hook's useEffect cleanup
    };
  }, []);

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
            {/* Conditionally render Pink Noise UI elements */}
            {audio.pinkNoiseActive.value && !audio.pinkNoiseSetupDone.value && (
              <div
                class="pink-noise-setup"
                style="text-align: center; padding: 20px; border-bottom: 1px solid #eee; margin-bottom: 20px;"
              >
                <h1>Volume Adjustment</h1>
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
