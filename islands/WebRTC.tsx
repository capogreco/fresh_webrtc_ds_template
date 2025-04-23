import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  requestWakeLock,
  setupWakeLockListeners,
} from "../lib/utils/wakeLock.ts";
import {
  DEFAULT_SYNTH_PARAMS,
  frequencyToNote,
  noteToFrequency,
  PARAM_DESCRIPTORS,
  SynthParams,
} from "../lib/synth/index.ts";
import { formatTime } from "../lib/utils/formatTime.ts";
import { Signal } from "@preact/signals";

// Extend the window object for Web Audio API
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// Type definitions for abstracted functionality
type ParamHandler = (value: any, source?: string) => void;
type MessageHandler = (event: MessageEvent, channel: RTCDataChannel) => void;

// Audio context for the synth
let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let filterNode: BiquadFilterNode | null = null;
let vibratoOsc: OscillatorNode | null = null;
let vibratoGain: GainNode | null = null;

// Web Audio Synthesizer Nodes - using direct Web Audio API

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

  // Audio context state
  const isMuted = useSignal(true); // Start muted
  const audioState = useSignal<string>("suspended");
  const showAudioButton = useSignal(true); // Start by showing the enable audio button

  // Synth parameters using the physics-based approach
  const frequency = useSignal(DEFAULT_SYNTH_PARAMS.frequency);
  const waveform = useSignal<OscillatorType>(DEFAULT_SYNTH_PARAMS.waveform);
  const volume = useSignal(DEFAULT_SYNTH_PARAMS.volume);
  const detune = useSignal(DEFAULT_SYNTH_PARAMS.detune);
  const currentNote = useSignal(
    frequencyToNote(DEFAULT_SYNTH_PARAMS.frequency),
  ); // Derived value for display
  const isNoteActive = useSignal(false); // Track if a note is currently playing

  // New synth parameters
  const attack = useSignal(DEFAULT_SYNTH_PARAMS.attack);
  const release = useSignal(DEFAULT_SYNTH_PARAMS.release);
  const filterCutoff = useSignal(DEFAULT_SYNTH_PARAMS.filterCutoff);
  const filterResonance = useSignal(DEFAULT_SYNTH_PARAMS.filterResonance);
  const vibratoRate = useSignal(DEFAULT_SYNTH_PARAMS.vibratoRate);
  const vibratoWidth = useSignal(DEFAULT_SYNTH_PARAMS.vibratoWidth);
  const portamentoTime = useSignal(DEFAULT_SYNTH_PARAMS.portamentoTime);

  // Using imported formatTime utility

  // Add a log entry
  const addLog = (text: string) => {
    logs.value = [...logs.value, `${formatTime()}: ${text}`];
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector(".log");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 0);
  };

  // Generic parameter update utility
  type AudioParamUpdateOptions<T> = {
    // Required parameters
    signal: Signal<T>; // Signal storing the parameter value
    paramName: string; // Parameter name for logging and sending
    newValue: T; // New value to set

    // Optional parameters
    audioNode?: AudioParam | null; // Web Audio node parameter to update (if applicable)
    formatValue?: (value: T) => string; // Function to format value for display
    unit?: string; // Unit of measurement for logging
    extraUpdates?: ((value: T) => void) | null; // Additional updates to perform
    skipSendToController?: boolean; // Skip sending to controller
    rampTime?: number; // Time in seconds for parameter ramping (0 for immediate)
    useExponentialRamp?: boolean; // Whether to use exponential ramping vs linear
  };

  // Utility for sending a parameter update to controller
  const sendParamToController = (param: string, value: any) => {
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

  // Generic parameter update function
  const updateAudioParam = <T extends unknown>({
    signal,
    paramName,
    newValue,
    audioNode = null,
    formatValue = String,
    unit = "",
    extraUpdates = null,
    skipSendToController = false,
    rampTime = 0, // Default: no ramping
    useExponentialRamp = false, // Default: linear ramping
  }: AudioParamUpdateOptions<T>) => {
    // Update the signal value
    signal.value = newValue;

    // Update the audio node if provided and audioContext exists
    if (audioNode && audioContext) {
      const now = audioContext.currentTime;

      // If ramping is enabled
      if (rampTime > 0) {
        // Cancel any scheduled parameter changes
        audioNode.cancelScheduledValues(now);

        // Set current value at current time to start the ramp from
        const currentValue = audioNode.value;
        audioNode.setValueAtTime(currentValue, now);

        // Use exponential ramp for frequency (must be > 0) or linear ramp otherwise
        if (
          useExponentialRamp && currentValue > 0 && (newValue as number) > 0
        ) {
          // Exponential ramps sound more natural for frequency changes
          audioNode.exponentialRampToValueAtTime(
            newValue as number,
            now + rampTime,
          );
        } else {
          // Linear ramp for other parameters or if values are zero/negative
          audioNode.linearRampToValueAtTime(newValue as number, now + rampTime);
        }
      } else {
        // Immediate change without ramping
        audioNode.setValueAtTime(newValue as number, now);
      }
    }

    // Perform any extra updates
    if (extraUpdates) {
      extraUpdates(newValue);
    }

    // Log the change
    const formattedValue = formatValue(newValue);
    const unitString = unit ? ` ${unit}` : "";
    addLog(`${paramName} updated to ${formattedValue}${unitString}`);

    // Send to controller if connected and not skipped
    if (!skipSendToController) {
      sendParamToController(paramName.toLowerCase(), newValue);
    }

    return newValue;
  };

  // Utility for sending all synth parameters to controller
  const sendAllSynthParameters = (channel: RTCDataChannel) => {
    try {
      // Define all parameters to send
      const params = [
        { param: "frequency", value: frequency.value },
        { param: "waveform", value: waveform.value },
        { param: "volume", value: volume.value },
        { param: "oscillatorEnabled", value: isNoteActive.value },
        { param: "detune", value: detune.value },
        { param: "attack", value: attack.value },
        { param: "release", value: release.value },
        { param: "filterCutoff", value: filterCutoff.value },
        { param: "filterResonance", value: filterResonance.value },
        { param: "vibratoRate", value: vibratoRate.value },
        { param: "vibratoWidth", value: vibratoWidth.value },
        { param: "portamentoTime", value: portamentoTime.value },
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
        isMuted: isMuted.value,
        audioState: audioState.value,
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
        pendingNote: isNoteActive.value, // Let controller know if there's a pending note
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
  const paramHandlers: Record<string, ParamHandler> = {
    frequency: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.frequency.validate(Number(value));
      updateFrequency(validValue);
      addLog(`Frequency updated to ${validValue}Hz by ${source}`);
    },
    waveform: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.waveform.validate(value);
      updateWaveform(validValue);
      addLog(`Waveform updated to ${validValue} by ${source}`);
    },
    volume: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.volume.validate(Number(value));
      updateVolume(validValue);
      addLog(`Volume updated to ${validValue} by ${source}`);
    },
    detune: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.detune.validate(Number(value));
      updateDetune(validValue);
      addLog(`Detune updated to ${validValue} cents by ${source}`);
    },
    oscillatorEnabled: (value, source = "controller") => {
      const enabled = PARAM_DESCRIPTORS.oscillatorEnabled.validate(value);
      // Handle as note on/off
      if (enabled) {
        noteOn(frequency.value);
        isNoteActive.value = true;
      } else {
        noteOff();
        isNoteActive.value = false;
      }
      addLog(`Note ${enabled ? "on" : "off"} by ${source}`);
    },
    attack: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.attack.validate(Number(value));
      updateAttack(validValue);
      addLog(`Attack updated to ${validValue}s by ${source}`);
    },
    release: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.release.validate(Number(value));
      updateRelease(validValue);
      addLog(`Release updated to ${validValue}s by ${source}`);
    },
    filterCutoff: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.filterCutoff.validate(Number(value));
      updateFilterCutoff(validValue);
      addLog(`Filter cutoff updated to ${validValue}Hz by ${source}`);
    },
    filterResonance: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.filterResonance.validate(
        Number(value),
      );
      updateFilterResonance(validValue);
      addLog(`Filter resonance updated to ${validValue} by ${source}`);
    },
    vibratoRate: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.vibratoRate.validate(Number(value));
      updateVibratoRate(validValue);
      addLog(`Vibrato rate updated to ${validValue}Hz by ${source}`);
    },
    vibratoWidth: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.vibratoWidth.validate(Number(value));
      updateVibratoWidth(validValue);
      addLog(`Vibrato width updated to ${validValue} cents by ${source}`);
    },
    portamentoTime: (value, source = "controller") => {
      const validValue = PARAM_DESCRIPTORS.portamentoTime.validate(
        Number(value),
      );
      updatePortamentoTime(validValue);
      addLog(`Portamento time updated to ${validValue}s by ${source}`);
    },
    note: (value, source = "controller") => {
      // Convert note to frequency (physics-based approach)
      const noteFreq = noteToFrequency(value as string);
      updateFrequency(noteFreq);
      currentNote.value = value as string;
      addLog(`Note ${value} (${noteFreq}Hz) set by ${source}`);
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

          // Special handling for oscillatorEnabled - update isNoteActive
          if (param === "oscillatorEnabled") {
            console.log(
              `[SYNTH] Received oscillatorEnabled=${value}, current isNoteActive=${isNoteActive.value}, isMuted=${isMuted.value}`,
            );
            isNoteActive.value = !!value; // Convert to boolean

            // If audio is already enabled (not muted) and oscillatorEnabled is true, play the note immediately
            if (isNoteActive.value && !isMuted.value && audioContext) {
              console.log(
                "[SYNTH] Audio already enabled and oscillatorEnabled=true, playing note immediately",
              );
              noteOn(frequency.value);
              addLog(
                `Playing note ${currentNote.value} (${frequency.value}Hz) due to controller setting`,
              );
            } else if (isNoteActive.value && (isMuted.value || !audioContext)) {
              // If muted or no audio context, just log the note request and notify controller
              addLog(
                `Note ${currentNote.value} requested but audio not enabled`,
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
            // Update the frequency value
            frequency.value = message.frequency;
            currentNote.value = frequencyToNote(message.frequency);

            // Always update state to track that note should be on
            isNoteActive.value = true;

            // Only play sound if audio is already initialized
            if (audioContext && !isMuted.value) {
              noteOn(message.frequency);
              addLog(
                `Playing note ${currentNote.value} (${frequency.value}Hz)`,
              );
            } else {
              // If audio not enabled, just log the message and notify controller
              addLog(
                `Note ${currentNote.value} requested but audio not enabled`,
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
          noteOff();
          isNoteActive.value = false;
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
      if (!isMuted.value) { // Not muted means audio is enabled
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

  // Fetch ICE servers from Twilio
  const fetchIceServers = async () => {
    try {
      const response = await fetch("/api/twilio-ice");
      if (!response.ok) {
        console.error("Failed to fetch ICE servers from Twilio");
        // Fallback to Google's STUN server
        return [{ urls: "stun:stun.l.google.com:19302" }];
      }

      const data = await response.json();
      console.log("Retrieved ICE servers from Twilio:", data.iceServers);
      return data.iceServers;
    } catch (error) {
      console.error("Error fetching ICE servers:", error);
      // Fallback to Google's STUN server
      return [{ urls: "stun:stun.l.google.com:19302" }];
    }
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
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
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
                isMuted: isMuted.value,
                connected: connected.value,
                autoConnectAttempted: autoConnectAttempted.value,
                audioState: audioState.value,
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
  const handleOffer = async (message: any) => {
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
  const handleAnswer = (message: any) => {
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
  const handleIceCandidate = (message: any) => {
    console.log("Handling ICE candidate from:", message.source, message);

    if (connection.value) {
      console.log("Adding ICE candidate to connection");
      connection.value.addIceCandidate(new RTCIceCandidate(message.data))
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

  // Send audio state to controller
  const sendAudioState = () => {
    if (!dataChannel.value || dataChannel.value.readyState !== "open") {
      return;
    }

    if (isMuted.value) {
      sendAudioStateOnly(dataChannel.value);
    } else {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "audio_state",
          isMuted: isMuted.value,
          audioState: audioState.value,
          pendingNote: false, // No pending notes when audio is enabled
          isNoteActive: isNoteActive.value, // Current note state
        }));
        console.log(
          "Sent audio state update:",
          isMuted.value ? "muted" : "unmuted",
          audioState.value,
          isNoteActive.value ? "note active" : "note inactive",
        );
      } catch (error) {
        console.error("Error sending audio state:", error);
      }
    }
  };

  // Initialize audio context with user gesture
  const initAudioContext = () => {
    try {
      // Track previous audio state before making any changes
      const wasNoteActive = isNoteActive.value;

      // Create audio context if it doesn't exist
      if (!audioContext) {
        audioContext = new (globalThis.AudioContext ||
          (globalThis as any).webkitAudioContext)();
        addLog("Audio context created");

        // Create audio processing chain:
        // Oscillator -> Vibrato -> Filter -> GainNode (volume) -> Destination

        // Create filter node (always in chain)
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "lowpass";
        filterNode.frequency.value = filterCutoff.value;
        filterNode.Q.value = filterResonance.value;

        // Create gain node for volume control (always in chain)
        gainNode = audioContext.createGain();

        // Start with zero gain - we'll use attack/release envelopes
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);

        // Connect filter to gain, and gain to destination
        filterNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Always create vibrato components - we'll set gain to 0 if not active
        // Create vibrato oscillator (LFO)
        vibratoOsc = audioContext.createOscillator();
        vibratoOsc.type = "sine"; // Sine wave is best for vibrato
        vibratoOsc.frequency.value = vibratoRate.value;

        // Create vibrato gain to control depth
        vibratoGain = audioContext.createGain();

        // Only make vibrato audible if both rate and width are non-zero
        if (vibratoRate.value > 0 && vibratoWidth.value > 0) {
          // Calculate proper vibrato amplitude based on the frequency
          const semitoneRatio = Math.pow(2, 1 / 12); // Semitone ratio
          const semitoneAmount = vibratoWidth.value / 100; // Convert cents to semitone fraction
          // We'll need to set the actual amount when the oscillator exists
          // For now, use a safe estimate based on A4 frequency
          const baseFreq = 440;
          const vibratoAmount = baseFreq *
            (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);
          vibratoGain.gain.value = vibratoAmount;

          console.log(
            `Vibrato prepared with rate: ${vibratoRate.value}Hz and width: ${vibratoWidth.value}¢ (est. amount: ${vibratoAmount}Hz)`,
          );
          addLog(
            `Vibrato prepared at ${vibratoRate.value}Hz with width ${vibratoWidth.value}¢`,
          );
        } else {
          // Zero gain means no vibrato effect
          vibratoGain.gain.value = 0;
          console.log("Vibrato prepared but disabled (zero rate or width)");
        }

        // Connect vibrato components - we'll connect to oscillator later
        vibratoOsc.connect(vibratoGain);

        // Start the vibrato oscillator
        vibratoOsc.start();

        // Create oscillator regardless of whether it's enabled
        // We'll control its audibility through the gain node
        oscillator = audioContext.createOscillator();
        oscillator.type = waveform.value;
        oscillator.frequency.value = frequency.value;
        oscillator.detune.value = detune.value;

        // Always connect vibrato LFO to oscillator frequency parameter
        // (gain is set to 0 if vibrato should be inactive)
        if (vibratoGain) {
          vibratoGain.connect(oscillator.frequency);

          // Update the vibrato amount based on the new oscillator's frequency
          if (vibratoWidth.value > 0) {
            const semitoneRatio = Math.pow(2, 1 / 12);
            const semitoneAmount = vibratoWidth.value / 100;
            const currentFreq = oscillator.frequency.value;
            const vibratoAmount = currentFreq *
              (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);

            vibratoGain.gain.value = vibratoAmount;
            console.log(
              `Vibrato amount adjusted to ${vibratoAmount}Hz based on oscillator frequency ${currentFreq}Hz`,
            );
          }
        }

        // Connect oscillator to filter
        oscillator.connect(filterNode);

        // Start the oscillator
        oscillator.start();

        // All notes start silent - will be triggered by noteOn()

        // Log oscillator creation
        addLog(
          `Oscillator started with note ${currentNote.value} (${frequency.value}Hz) ` +
            `using ${waveform.value} waveform, detune: ${detune.value}¢, ` +
            `filter: ${Math.round(filterCutoff.value)}Hz (Q:${
              filterResonance.value.toFixed(1)
            })`,
        );

        // Start with gain set to 0 - notes will use noteOn() to play sound
        // with proper attack envelope
      }

      // Resume the audio context (needed for browsers that suspend by default)
      if (audioContext && audioContext.state !== "running") {
        audioContext.resume().then(() => {
          if (audioContext) {
            addLog(`Audio context resumed, state: ${audioContext.state}`);
            audioState.value = audioContext.state;
          }
          sendAudioState(); // Send updated state to controller
        }).catch((err) => {
          addLog(
            `Error resuming audio context: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      } else if (audioContext) {
        audioState.value = audioContext.state;
      }

      // Setup audio state change listener
      if (audioContext) {
        audioContext.onstatechange = () => {
          if (audioContext) {
            audioState.value = audioContext.state;
            addLog(`Audio context state changed to: ${audioContext.state}`);
            sendAudioState(); // Send updated state to controller
          }
        };
      }

      // Mark audio as enabled and hide the button
      isMuted.value = false; // Not muted = audio enabled
      showAudioButton.value = false;

      // If the controller had already set Note On, play a note immediately
      // This ensures immediate sound after enabling audio if Note On is selected
      if (wasNoteActive || isNoteActive.value) {
        console.log(
          "[SYNTH] Auto-playing note because controller has Note On selected",
        );
        noteOn(frequency.value);
        addLog(
          `Auto-playing note ${currentNote.value} (${frequency.value}Hz) after enabling audio`,
        );
      }

      // Send audio state to controller if connected
      sendAudioState();

      // Request current controller state to ensure we're in sync
      // especially for note on/off status
      if (dataChannel.value && dataChannel.value.readyState === "open") {
        try {
          dataChannel.value.send(JSON.stringify({
            type: "request_current_state",
          }));
          console.log(
            "[SYNTH] Requested current controller state after audio initialization",
          );
          addLog("Requested updated controller state");
        } catch (error) {
          console.error("Error requesting controller state:", error);
        }
      }

      // No need to auto-connect here since we now connect immediately when receiving controller info
      // Request controller info if we don't have it yet and haven't attempted a connection
      if (!activeController.value && !autoConnectAttempted.value) {
        requestActiveController();
      }
    } catch (error) {
      addLog(
        `Error initializing audio context: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      console.error("Audio context initialization failed:", error);
    }
  };

  // Update oscillator frequency
  const updateFrequency = (newFrequency: number) => {
    // Always update the stored value
    frequency.value = newFrequency;

    // Update UI note display as well
    currentNote.value = frequencyToNote(newFrequency);

    // Update the Web Audio oscillator if it exists
    if (oscillator && audioContext) {
      const now = audioContext.currentTime;
      const currentFreq = oscillator.frequency.value;

      // Apply portamento if enabled
      if (portamentoTime.value > 0) {
        // Proper sequence for smooth automation:
        // 1. Cancel any scheduled automation first
        oscillator.frequency.cancelScheduledValues(now);

        // 2. Set current value at current time
        oscillator.frequency.setValueAtTime(currentFreq, now);

        // 3. Use exponential ramp for perceptually smooth pitch transition
        // Note: exponentialRamp can't go to zero, but that's not an issue for frequencies
        oscillator.frequency.exponentialRampToValueAtTime(
          newFrequency,
          now + portamentoTime.value,
        );

        addLog(
          `Frequency gliding to ${newFrequency}Hz (${currentNote.value}) over ${portamentoTime.value}s`,
        );
      } else {
        // Instant frequency change
        // Still need to cancel any existing automation first
        oscillator.frequency.cancelScheduledValues(now);
        oscillator.frequency.setValueAtTime(
          newFrequency,
          now,
        );
        addLog(`Frequency changed to ${newFrequency}Hz (${currentNote.value})`);
      }

      // Update vibrato amount when frequency changes (if vibrato is active)
      if (vibratoGain && vibratoOsc && vibratoWidth.value > 0 && audioContext) {
        const now = audioContext.currentTime;
        const semitoneRatio = Math.pow(2, 1 / 12);
        const semitoneAmount = vibratoWidth.value / 100;
        // Calculate new vibrato amount based on new frequency
        const vibratoAmount = newFrequency *
          (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);

        vibratoGain.gain.setValueAtTime(vibratoAmount, now);
        console.log(
          `Vibrato amount adjusted to ${vibratoAmount}Hz for new frequency ${newFrequency}Hz`,
        );
      }
    } else {
      // Just log the change if no oscillator exists
      addLog(`Frequency changed to ${newFrequency}Hz (${currentNote.value})`);
    }

    // Send frequency update to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "frequency",
          value: newFrequency,
        }));
      } catch (error) {
        console.error("Error sending frequency update:", error);
      }
    }
  };

  // Update oscillator waveform
  const updateWaveform = (newWaveform: OscillatorType) => {
    // Update the signal value
    waveform.value = newWaveform;

    // Update the actual oscillator if it exists
    if (oscillator) {
      // Need to update oscillator type directly since it's not an AudioParam
      oscillator.type = newWaveform;

      // Log the change
      addLog(`Waveform updated to ${newWaveform}`);
    } else {
      // Just update the signal if no oscillator exists
      updateAudioParam({
        signal: waveform,
        paramName: "Waveform",
        newValue: newWaveform,
      });
    }

    // Send to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "waveform",
          value: newWaveform,
        }));
      } catch (error) {
        console.error("Error sending waveform update:", error);
      }
    }
  };

  // Update volume
  const updateVolume = (newVolume: number) => {
    // Update the signal value
    volume.value = newVolume;

    // Update the gain node if it exists
    if (gainNode && audioContext) {
      // Don't interrupt attack/release envelopes
      // Only update the volume if the oscillator is in steady state or there's no oscillator
      if ((oscillator && isNoteActive.value) || !oscillator) {
        // Check the current gain value
        const currentGain = gainNode.gain.value;

        // If we're in steady state (not in middle of attack/release) it's safe to update
        if (currentGain > 0.9 * volume.value || !oscillator) {
          updateAudioParam({
            signal: volume,
            paramName: "Volume",
            newValue: newVolume,
            audioNode: gainNode.gain,
            formatValue: (val) => `${Math.round(val * 100)}%`,
            rampTime: 0.02, // 20ms ramp time
            useExponentialRamp: false, // Linear ramping for volume
            skipSendToController: true, // We'll handle controller updates manually
          });
        }
        // Otherwise we're probably in an attack or release phase, don't interrupt
      } else {
        // Just update the signal without changing audio - it will be used next time a note is played
        addLog(`Volume updated to ${Math.round(newVolume * 100)}%`);
      }
    } else {
      // Just log if no gainNode exists
      addLog(`Volume updated to ${Math.round(newVolume * 100)}%`);
    }

    // Send to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "volume",
          value: newVolume,
        }));
      } catch (error) {
        console.error("Error sending volume update:", error);
      }
    }
  };

  // Note frequencies are now imported from the synth library

  // Convert note to frequency (for UI convenience)
  const updateNoteByName = (note: string) => {
    // Get the frequency for this note from our mapping
    const newFrequency = noteToFrequency(note);

    // Update the UI note display
    currentNote.value = note;

    // Update the actual frequency (physics-based parameter)
    updateFrequency(newFrequency);

    addLog(`Note changed to ${note} (${newFrequency}Hz)`);
  };

  // Update detune value
  const updateDetune = (cents: number) => {
    // Update the signal value
    detune.value = cents;

    // Update the oscillator if it exists
    if (oscillator) {
      updateAudioParam({
        signal: detune,
        paramName: "Detune",
        newValue: cents,
        audioNode: oscillator.detune,
        unit: "cents",
        formatValue: (val) => val > 0 ? `+${val}` : String(val),
      });
    } else {
      // Just update the signal if no oscillator exists
      updateAudioParam({
        signal: detune,
        paramName: "Detune",
        newValue: cents,
        unit: "cents",
        formatValue: (val) => val > 0 ? `+${val}` : String(val),
      });
    }

    // Send to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "detune",
          value: cents,
        }));
      } catch (error) {
        console.error("Error sending detune update:", error);
      }
    }
  };

  // Update attack time
  const updateAttack = (attackTime: number) => {
    // No audioNode for attack as it's applied when oscillator is restarted
    updateAudioParam({
      signal: attack,
      paramName: "Attack",
      newValue: attackTime,
      unit: "s",
      formatValue: (val) =>
        val < 0.01 ? `${Math.round(val * 1000)}ms` : `${val.toFixed(2)}s`,
    });

    // Send to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "attack",
          value: attackTime,
        }));
      } catch (error) {
        console.error("Error sending attack update:", error);
      }
    }
  };

  // Update release time
  const updateRelease = (releaseTime: number) => {
    // No audioNode for release as it's applied when oscillator is released
    updateAudioParam({
      signal: release,
      paramName: "Release",
      newValue: releaseTime,
      unit: "s",
      formatValue: (val) =>
        val < 0.01 ? `${Math.round(val * 1000)}ms` : `${val.toFixed(2)}s`,
    });

    // Send to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "release",
          value: releaseTime,
        }));
      } catch (error) {
        console.error("Error sending release update:", error);
      }
    }
  };

  // Update filter cutoff
  const updateFilterCutoff = (cutoffFreq: number) => {
    // Update the signal value
    filterCutoff.value = cutoffFreq;

    // Update the filter if it exists
    if (filterNode) {
      updateAudioParam({
        signal: filterCutoff,
        paramName: "Filter cutoff",
        newValue: cutoffFreq,
        audioNode: filterNode.frequency,
        unit: "Hz",
        formatValue: (val) =>
          val < 1000 ? `${Math.round(val)}` : `${(val / 1000).toFixed(1)}k`,
        rampTime: 0.02, // 20ms ramp time
        useExponentialRamp: true, // Use exponential ramping for frequency
      });
    } else {
      // Just update the signal if no filter exists
      updateAudioParam({
        signal: filterCutoff,
        paramName: "Filter cutoff",
        newValue: cutoffFreq,
        unit: "Hz",
        formatValue: (val) =>
          val < 1000 ? `${Math.round(val)}` : `${(val / 1000).toFixed(1)}k`,
      });
    }

    // Send to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "filterCutoff",
          value: cutoffFreq,
        }));
      } catch (error) {
        console.error("Error sending filter cutoff update:", error);
      }
    }
  };

  // Update filter resonance
  const updateFilterResonance = (resonance: number) => {
    // Update the signal value
    filterResonance.value = resonance;

    // Update the filter if it exists
    if (filterNode) {
      updateAudioParam({
        signal: filterResonance,
        paramName: "Filter resonance",
        newValue: resonance,
        audioNode: filterNode.Q,
        formatValue: (val) => val.toFixed(1),
        rampTime: 0.02, // 20ms ramp time
        useExponentialRamp: false, // Linear ramping for resonance
      });
    } else {
      // Just update the signal if no filter exists
      updateAudioParam({
        signal: filterResonance,
        paramName: "Filter resonance",
        newValue: resonance,
        formatValue: (val) => val.toFixed(1),
      });
    }

    // Send to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "filterResonance",
          value: resonance,
        }));
      } catch (error) {
        console.error("Error sending filter resonance update:", error);
      }
    }
  };

  // Update vibrato rate
  const updateVibratoRate = (rate: number) => {
    // Special processing is needed for vibrato rate
    const vibratoRateUpdates = (rate: number) => {
      if (!vibratoOsc || !audioContext) return;

      const now = audioContext.currentTime;

      // If rate is 0, effectively disable vibrato by setting the LFO to 0Hz
      if (rate === 0) {
        // Set to very low value (0.001Hz = one cycle per ~17 minutes)
        vibratoOsc.frequency.setValueAtTime(0.001, now);

        // Also, if we have vibratoGain, set it to 0
        if (vibratoGain) {
          vibratoGain.gain.setValueAtTime(0, now);
        }

        console.log("Vibrato disabled (rate set to 0)");
      } else {
        // Normal rate update
        vibratoOsc.frequency.setValueAtTime(rate, now);

        // If vibrato was disabled before and we have width > 0, re-enable it
        if (vibratoGain && vibratoWidth.value > 0 && oscillator) {
          const semitoneRatio = Math.pow(2, 1 / 12);
          const semitoneAmount = vibratoWidth.value / 100;
          const currentFreq = oscillator.frequency.value;
          const vibratoAmount = currentFreq *
            (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);

          vibratoGain.gain.setValueAtTime(vibratoAmount, now);
          console.log(
            `Vibrato re-enabled with rate ${rate}Hz and amount ${vibratoAmount}Hz`,
          );
        }
      }
    };

    // Use the generic update function with custom processing
    updateAudioParam({
      signal: vibratoRate,
      paramName: "Vibrato rate",
      newValue: rate,
      unit: "Hz",
      extraUpdates: vibratoRateUpdates,
      formatValue: (val) => val === 0 ? "off" : val.toFixed(1),
    });
  };

  // Update vibrato width
  const updateVibratoWidth = (width: number) => {
    // Special processing is needed for vibrato width
    const vibratoWidthUpdates = (width: number) => {
      if (!vibratoGain || !audioContext || !oscillator) return;

      // Calculate vibrato amount based on semitone ratio and current frequency
      const semitoneRatio = Math.pow(2, 1 / 12);
      const semitoneAmount = width / 100;
      const currentFreq = oscillator.frequency.value;
      const vibratoAmount = currentFreq *
        (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);

      vibratoGain.gain.setValueAtTime(vibratoAmount, audioContext.currentTime);
      console.log(
        `Vibrato width set to ${width} cents (amount: ${vibratoAmount}Hz around ${currentFreq}Hz)`,
      );

      // When width is 0, disable vibrato completely by setting gain to 0
      if (width === 0 && vibratoOsc) {
        vibratoGain.gain.setValueAtTime(0, audioContext.currentTime);
      }
    };

    // Use the generic update function with custom processing
    updateAudioParam({
      signal: vibratoWidth,
      paramName: "Vibrato width",
      newValue: width,
      unit: "cents",
      extraUpdates: vibratoWidthUpdates,
      formatValue: (val) => val === 0 ? "off" : val.toString(),
    });
  };

  // Update portamento time
  const updatePortamentoTime = (time: number) => {
    // Use the generic update function
    updateAudioParam({
      signal: portamentoTime,
      paramName: "Portamento time",
      newValue: time,
      unit: "s",
      formatValue: (val) => val === 0 ? "off" : val.toFixed(2),
    });
  };

  // Play a note with the given frequency (with attack envelope)
  const noteOn = (noteFrequency: number) => {
    console.log(`[SYNTH] noteOn called with frequency=${noteFrequency}Hz`);

    if (!audioContext || isMuted.value) {
      console.warn("[SYNTH] Cannot play note: audio not initialized or muted");
      return;
    }

    const now = audioContext.currentTime;

    // Initialize audio nodes if needed
    if (!oscillator) {
      console.log("[SYNTH] Creating and starting new oscillator");

      // Check if audio nodes exist and create them if missing
      if (!filterNode) {
        console.log("[SYNTH] Creating missing filter node");
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "lowpass";
        filterNode.frequency.value = filterCutoff.value;
        filterNode.Q.value = filterResonance.value;
      }

      if (!gainNode) {
        console.log("[SYNTH] Creating missing gain node");
        gainNode = audioContext.createGain();

        // Start with zero gain for attack envelope
        gainNode.gain.setValueAtTime(0, now);

        // Connect filter to gain and gain to destination
        filterNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
      } else {
        // Just set gain to zero for existing gain node
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
      }

      // Create vibrato if it doesn't exist and parameters are non-zero
      if (!vibratoOsc && vibratoRate.value > 0 && vibratoWidth.value > 0) {
        console.log("[SYNTH] Creating vibrato LFO");
        vibratoOsc = audioContext.createOscillator();
        vibratoOsc.type = "sine";
        vibratoOsc.frequency.value = vibratoRate.value;

        vibratoGain = audioContext.createGain();
        const vibratoAmount = vibratoWidth.value / 100 * 0.5;
        vibratoGain.gain.value = vibratoAmount;

        // Connect vibrato oscillator to gain
        vibratoOsc.connect(vibratoGain);
        vibratoOsc.start();
      }

      // Create main oscillator
      oscillator = audioContext.createOscillator();
      oscillator.type = waveform.value;
      oscillator.frequency.value = noteFrequency;
      oscillator.detune.value = detune.value;

      // Connect vibrato to frequency if it exists
      if (vibratoOsc && vibratoGain) {
        vibratoGain.connect(oscillator.frequency);
      }

      // Connect oscillator to filter (which is connected to the gain node)
      console.log("[SYNTH] Connecting oscillator to audio chain");
      oscillator.connect(filterNode);

      // Start the oscillator
      console.log("[SYNTH] Starting oscillator");
      oscillator.start();
    } else {
      // Update frequency of existing oscillator
      updateFrequency(noteFrequency);
    }

    // Update frequency display
    frequency.value = noteFrequency;
    currentNote.value = frequencyToNote(noteFrequency);

    // Apply attack envelope to gain
    if (gainNode) {
      const attackTime = attack.value;

      // Cancel any previous scheduled changes
      gainNode.gain.cancelScheduledValues(now);

      // Always start from zero for a consistent attack envelope,
      // regardless of whether the oscillator was just created or already existed
      gainNode.gain.setValueAtTime(0, now);

      // Ramp up to full volume over attack time
      gainNode.gain.linearRampToValueAtTime(volume.value, now + attackTime);
      console.log(
        `[SYNTH] Applied attack envelope: ${attackTime}s from zero to ${volume.value}`,
      );
    }

    addLog(
      `Note on: ${waveform.value} @ ${noteFrequency}Hz (${currentNote.value}) ` +
        `with attack: ${attack.value}s, release: ${release.value}s`,
    );

    // Send note_on state to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "note_on",
          frequency: noteFrequency,
        }));
      } catch (error) {
        console.error("Error sending note_on:", error);
      }
    }
  };

  // Release the current note (with release envelope)
  const noteOff = () => {
    console.log("[SYNTH] noteOff called");

    if (!audioContext || isMuted.value) {
      return;
    }

    const now = audioContext.currentTime;

    // Apply release envelope
    if (oscillator && gainNode) {
      const releaseTime = release.value;

      // Cancel any previous scheduled changes
      gainNode.gain.cancelScheduledValues(now);

      // Get current gain value
      const currentGain = gainNode.gain.value;
      gainNode.gain.setValueAtTime(currentGain, now);

      // Ramp down to zero over release time
      gainNode.gain.linearRampToValueAtTime(0, now + releaseTime);
      console.log(`[SYNTH] Applied release envelope: ${releaseTime}s`);

      // Schedule actual oscillator stop after release is complete
      setTimeout(() => {
        if (oscillator) {
          try {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
            console.log("[SYNTH] Oscillator stopped after release");
          } catch (error) {
            console.error("[SYNTH] Error stopping oscillator:", error);
          }

          // Don't stop vibrato, just disconnect it from the oscillator
          if (vibratoGain) {
            try {
              // Just disconnect the gain node (removing connections to oscillator.frequency)
              vibratoGain.disconnect();
              console.log(
                "[SYNTH] Disconnected vibrato from oscillator frequency",
              );
            } catch (error) {
              console.error("[SYNTH] Error disconnecting vibrato:", error);
            }
          }
        }
      }, releaseTime * 1000);

      addLog(`Note off with release: ${release.value}s`);
    } else if (oscillator) {
      // No gain node, just stop the oscillator immediately
      console.log(
        "[SYNTH] Stopping and disconnecting oscillator (no envelope)",
      );
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
      addLog("Note off (immediate)");

      // Don't stop vibrato, just disconnect it from the oscillator
      if (vibratoGain) {
        try {
          // Just disconnect the gain node (removing connections to oscillator.frequency)
          vibratoGain.disconnect();
          console.log("[SYNTH] Disconnected vibrato from oscillator frequency");
        } catch (error) {
          console.error("[SYNTH] Error disconnecting vibrato:", error);
        }
      }
    } else {
      console.log("[SYNTH] No note to release");
    }

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
  };

  // Wake lock sentinel reference
  const wakeLock = useSignal<any>(null);

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

      // Stop audio and clean up audio nodes
      if (oscillator) {
        try {
          oscillator.stop();
          oscillator.disconnect();
          console.log("Oscillator stopped and disconnected");
        } catch (err) {
          console.error("Error stopping oscillator:", err);
        }
      }

      if (vibratoOsc) {
        try {
          vibratoOsc.stop();
          vibratoOsc.disconnect();
          console.log("Vibrato oscillator stopped and disconnected");
        } catch (err) {
          console.error("Error stopping vibrato oscillator:", err);
        }
      }

      if (vibratoGain) {
        try {
          vibratoGain.disconnect();
          console.log("Vibrato gain node disconnected");
        } catch (err) {
          console.error("Error disconnecting vibrato gain:", err);
        }
      }

      if (filterNode) {
        try {
          filterNode.disconnect();
          console.log("Filter node disconnected");
        } catch (err) {
          console.error("Error disconnecting filter node:", err);
        }
      }

      if (gainNode) {
        try {
          gainNode.disconnect();
          console.log("Gain node disconnected");
        } catch (err) {
          console.error("Error disconnecting gain node:", err);
        }
      }

      // Close audio context
      if (audioContext && !isMuted.value) { // Not muted = audio enabled
        audioContext.close().then(() => {
          addLog("Audio context closed");
        }).catch((err) => {
          console.error("Error closing audio context:", err);
        });
      }
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
        ? (
          // Show the Enable Audio button if audio is not yet enabled
          <div class="audio-enable">
            <h1>WebRTC Synth</h1>
            <div class="controller-connection-info">
              {activeController.value && !connected.value
                ? (
                  <div class="controller-available">
                    <p>Controller available: {activeController.value}</p>
                    <button
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
              onClick={initAudioContext}
              class="audio-button"
            >
              Enable Audio
            </button>
          </div>
        )
        : (
          // Show the full synth UI after audio is enabled
          <div class="synth-ui">
            <h1>WebRTC Synth</h1>

            <div class="status-bar">
              <div>
                <span class="id-display">ID: {id.value}</span>
                <span
                  class={`connection-status ${
                    connected.value ? "status-connected" : "status-disconnected"
                  }`}
                >
                  {connected.value ? "Connected" : "Disconnected"}
                </span>
                <span class={`audio-status audio-${audioState.value}`}>
                  Audio: {audioState.value}
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
                    onClick={() =>
                      connectToController(activeController.value as string)}
                    class="auto-connect-button"
                  >
                    Connect
                  </button>
                </div>
              )}
            </div>

            <div class="synth-status">
              <div class="synth-info">
                <h3>Synth Status</h3>
                <div class="param-display">
                  <p>
                    Note Status:{" "}
                    <span
                      class={isNoteActive.value ? "status-on" : "status-off"}
                    >
                      {isNoteActive.value ? "PLAYING" : "OFF"}
                    </span>
                  </p>
                  <p>
                    Pitch: <span class="param-value">{currentNote.value}</span>
                  </p>
                  <p>
                    Waveform: <span class="param-value">{waveform.value}</span>
                  </p>
                  <p>
                    Detune:{" "}
                    <span class="param-value">
                      {detune.value > 0 ? `+${detune.value}` : detune.value} ¢
                    </span>
                  </p>
                  <p>
                    Volume:{" "}
                    <span class="param-value">
                      {Math.round(volume.value * 100)}%
                    </span>
                  </p>
                  <p>
                    Attack:{" "}
                    <span class="param-value">
                      {attack.value < 0.01
                        ? `${Math.round(attack.value * 1000)}ms`
                        : `${attack.value.toFixed(2)}s`}
                    </span>
                  </p>
                  <p>
                    Release:{" "}
                    <span class="param-value">
                      {release.value < 0.01
                        ? `${Math.round(release.value * 1000)}ms`
                        : `${release.value.toFixed(2)}s`}
                    </span>
                  </p>
                  <p>
                    Filter:{" "}
                    <span class="param-value">
                      {filterCutoff.value < 1000
                        ? `${Math.round(filterCutoff.value)}Hz`
                        : `${(filterCutoff.value / 1000).toFixed(1)}kHz`}{" "}
                      (Q:{filterResonance.value.toFixed(1)})
                    </span>
                  </p>
                  <p>
                    Vibrato:{" "}
                    <span class="param-value">
                      {vibratoRate.value.toFixed(1)}Hz,{" "}
                      {Math.round(vibratoWidth.value)}¢
                    </span>
                  </p>
                  <p>
                    Portamento:{" "}
                    <span class="param-value">
                      {portamentoTime.value === 0
                        ? "Off"
                        : `${portamentoTime.value.toFixed(2)}s`}
                    </span>
                  </p>
                </div>
                <p class="control-info">
                  Synth controls available in controller interface
                </p>
              </div>
            </div>

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
                    onClick={() => disconnect(true)}
                    class="disconnect-button"
                  >
                    Disconnect
                  </button>
                )
                : (
                  <button onClick={connect} disabled={!targetId.value.trim()}>
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
          </div>
        )}
    </div>
  );
}
