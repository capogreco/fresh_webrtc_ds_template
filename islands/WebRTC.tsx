import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { 
  SynthParams, 
  validateFrequency,
  validateVolume,
  validateDetune,
  validateWaveform,
  validateAttack,
  validateRelease,
  validateFilterCutoff,
  validateFilterResonance,
  validateVibratoRate,
  validateVibratoWidth,
  validatePortamentoTime,
  DEFAULT_SYNTH_PARAMS,
  frequencyToNote,
  noteToFrequency
} from "../lib/synth/index.ts";
import { formatTime } from "../lib/utils/formatTime.ts";
import { Signal } from "@preact/signals";

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
  const oscillatorEnabled = useSignal(DEFAULT_SYNTH_PARAMS.oscillatorEnabled);
  const detune = useSignal(DEFAULT_SYNTH_PARAMS.detune);
  const currentNote = useSignal(frequencyToNote(DEFAULT_SYNTH_PARAMS.frequency)); // Derived value for display
  
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
  
  // Utility for sending all synth parameters to controller
  const sendAllSynthParameters = (channel: RTCDataChannel) => {
    try {
      // Define all parameters to send
      const params = [
        { param: "frequency", value: frequency.value },
        { param: "waveform", value: waveform.value },
        { param: "volume", value: volume.value },
        { param: "oscillatorEnabled", value: oscillatorEnabled.value },
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
      }));
      addLog("Sent audio state to controller (audio not enabled)");
    } catch (error) {
      console.error("Error sending audio state:", error);
    }
  };
  
  // Handle ping messages
  const handlePingMessage = (data: string, channel: RTCDataChannel, prefix: string = "") => {
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
      addLog(`Failed to respond to ping: ${error.message}`);
    }
  };
  
  // Handle test messages
  const handleTestMessage = (data: string, channel: RTCDataChannel, prefix: string = "") => {
    console.log(`[${prefix}] TEST message detected!`);
    
    // Reply with the same test message
    try {
      // Echo back the test message
      channel.send(`ECHOED:${data}`);
      console.log(`[${prefix}] Echoed test message`);
      addLog(`Echoed test message`);
    } catch (error) {
      console.error(`[${prefix}] Error echoing test message:`, error);
      addLog(`Failed to echo test message: ${error.message}`);
    }
  };
  
  // Unified parameter handler map
  const paramHandlers: Record<string, ParamHandler> = {
    frequency: (value, source = "controller") => {
      const validValue = validateFrequency(Number(value));
      updateFrequency(validValue);
      addLog(`Frequency updated to ${validValue}Hz by ${source}`);
    },
    waveform: (value, source = "controller") => {
      const validValue = validateWaveform(value);
      updateWaveform(validValue);
      addLog(`Waveform updated to ${validValue} by ${source}`);
    },
    volume: (value, source = "controller") => {
      const validValue = validateVolume(Number(value));
      updateVolume(validValue);
      addLog(`Volume updated to ${validValue} by ${source}`);
    },
    detune: (value, source = "controller") => {
      const validValue = validateDetune(Number(value));
      updateDetune(validValue);
      addLog(`Detune updated to ${validValue} cents by ${source}`);
    },
    oscillatorEnabled: (value, source = "controller") => {
      const enabled = value === true || value === "true" || value === 1;
      toggleOscillator(enabled);
      addLog(`Oscillator ${enabled ? "enabled" : "disabled"} by ${source}`);
    },
    attack: (value, source = "controller") => {
      const validValue = validateAttack(Number(value));
      updateAttack(validValue);
      addLog(`Attack updated to ${validValue}s by ${source}`);
    },
    release: (value, source = "controller") => {
      const validValue = validateRelease(Number(value));
      updateRelease(validValue);
      addLog(`Release updated to ${validValue}s by ${source}`);
    },
    filterCutoff: (value, source = "controller") => {
      const validValue = validateFilterCutoff(Number(value));
      updateFilterCutoff(validValue);
      addLog(`Filter cutoff updated to ${validValue}Hz by ${source}`);
    },
    filterResonance: (value, source = "controller") => {
      const validValue = validateFilterResonance(Number(value));
      updateFilterResonance(validValue);
      addLog(`Filter resonance updated to ${validValue} by ${source}`);
    },
    vibratoRate: (value, source = "controller") => {
      const validValue = validateVibratoRate(Number(value));
      updateVibratoRate(validValue);
      addLog(`Vibrato rate updated to ${validValue}Hz by ${source}`);
    },
    vibratoWidth: (value, source = "controller") => {
      const validValue = validateVibratoWidth(Number(value));
      updateVibratoWidth(validValue);
      addLog(`Vibrato width updated to ${validValue} cents by ${source}`);
    },
    portamentoTime: (value, source = "controller") => {
      const validValue = validatePortamentoTime(Number(value));
      updatePortamentoTime(validValue);
      addLog(`Portamento time updated to ${validValue}s by ${source}`);
    },
    note: (value, source = "controller") => {
      // Convert note to frequency (physics-based approach)
      const noteFreq = noteToFrequency(value as string);
      updateFrequency(noteFreq);
      currentNote.value = value as string;
      addLog(`Note ${value} (${noteFreq}Hz) set by ${source}`);
    }
  };
  
  // Unified channel message handler
  const handleChannelMessage = (event: MessageEvent, channel: RTCDataChannel, prefix: string = "") => {
    console.log(`[${prefix || "CLIENT"}] Received message:`, event.data);
    
    // Try to parse JSON messages
    if (typeof event.data === "string" && event.data.startsWith("{")) {
      try {
        const message = JSON.parse(event.data);
        
        // Handle synth parameter update messages
        if (message.type === "synth_param") {
          const param = message.param;
          const value = message.value;
          
          if (paramHandlers[param]) {
            paramHandlers[param](value, prefix ? `${prefix} controller` : "controller");
          } else {
            console.warn(`Unknown synth parameter: ${param}`);
            addLog(`Unknown synth parameter: ${param}`);
          }
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
        addLog(`Error creating offer: ${error}`);
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
                showAudioButton: showAudioButton.value
              });
              
              // Always attempt connection regardless of audio state
              if (!connected.value && !autoConnectAttempted.value) {
                console.log("ATTEMPTING AUTO-CONNECTION to controller:", message.controllerId);
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
              addLog(`Error handling offer: ${error.message}`);
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
        addLog(`Error handling message: ${error}`);
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
        console.log("ICE candidate generated (offer handler):", event.candidate);
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
        console.log("Data channel received in offer handler:", event.channel.label);
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
          addLog(`Error creating answer: ${error}`);
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
          addLog(`Error setting remote description: ${error}`);
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
          addLog(`Error adding ICE candidate: ${error}`);
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
        }));
        console.log(
          "Sent audio state update:",
          isMuted.value ? "muted" : "unmuted",
          audioState.value,
        );
      } catch (error) {
        console.error("Error sending audio state:", error);
      }
    }
  };

  // Initialize audio context with user gesture
  const initAudioContext = () => {
    try {
      // Create audio context if it doesn't exist
      if (!audioContext) {
        audioContext =
          new (window.AudioContext || (window as any).webkitAudioContext)();
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
        gainNode.gain.value = volume.value;
        
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
          const semitoneRatio = Math.pow(2, 1/12); // Semitone ratio
          const semitoneAmount = vibratoWidth.value / 100; // Convert cents to semitone fraction
          // We'll need to set the actual amount when the oscillator exists
          // For now, use a safe estimate based on A4 frequency
          const baseFreq = 440;
          const vibratoAmount = baseFreq * (Math.pow(semitoneRatio, semitoneAmount/2) - 1);
          vibratoGain.gain.value = vibratoAmount;
          
          console.log(`Vibrato prepared with rate: ${vibratoRate.value}Hz and width: ${vibratoWidth.value}¢ (est. amount: ${vibratoAmount}Hz)`);
          addLog(`Vibrato prepared at ${vibratoRate.value}Hz with width ${vibratoWidth.value}¢`);
        } else {
          // Zero gain means no vibrato effect
          vibratoGain.gain.value = 0;
          console.log("Vibrato prepared but disabled (zero rate or width)");
        }
        
        // Connect vibrato components - we'll connect to oscillator later
        vibratoOsc.connect(vibratoGain);
        
        // Start the vibrato oscillator
        vibratoOsc.start();

        // Create oscillator if enabled
        if (oscillatorEnabled.value) {
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
              const semitoneRatio = Math.pow(2, 1/12);
              const semitoneAmount = vibratoWidth.value / 100;
              const currentFreq = oscillator.frequency.value;
              const vibratoAmount = currentFreq * (Math.pow(semitoneRatio, semitoneAmount/2) - 1);
              
              vibratoGain.gain.value = vibratoAmount;
              console.log(`Vibrato amount adjusted to ${vibratoAmount}Hz based on oscillator frequency ${currentFreq}Hz`);
            }
          }
          
          // Connect oscillator to filter
          oscillator.connect(filterNode);
          
          // Start the oscillator
          oscillator.start();

          addLog(
            `Oscillator started with note ${currentNote.value} (${frequency.value}Hz) ` +
            `using ${waveform.value} waveform, detune: ${detune.value}¢, ` +
            `filter: ${Math.round(filterCutoff.value)}Hz (Q:${filterResonance.value.toFixed(1)})`
          );
        } else {
          addLog("Oscillator is disabled");
        }
      }

      // Resume the audio context (needed for browsers that suspend by default)
      if (audioContext.state !== "running") {
        audioContext.resume().then(() => {
          addLog(`Audio context resumed, state: ${audioContext.state}`);
          audioState.value = audioContext.state;
          sendAudioState(); // Send updated state to controller
        }).catch((err) => {
          addLog(`Error resuming audio context: ${err.message}`);
        });
      } else {
        audioState.value = audioContext.state;
      }

      // Setup audio state change listener
      audioContext.onstatechange = () => {
        audioState.value = audioContext.state;
        addLog(`Audio context state changed to: ${audioContext.state}`);
        sendAudioState(); // Send updated state to controller
      };

      // Mark audio as enabled and hide the button
      isMuted.value = false; // Not muted = audio enabled
      showAudioButton.value = false;

      // Send audio state to controller if connected
      sendAudioState();

      // No need to auto-connect here since we now connect immediately when receiving controller info
      // Request controller info if we don't have it yet and haven't attempted a connection
      if (!activeController.value && !autoConnectAttempted.value) {
        requestActiveController();
      }
    } catch (error) {
      addLog(`Error initializing audio context: ${error.message}`);
      console.error("Audio context initialization failed:", error);
    }
  };

  // Update oscillator frequency
  const updateFrequency = (newFrequency: number) => {
    // Always update the stored value
    frequency.value = newFrequency;
    
    // Update UI note display as well
    currentNote.value = frequencyToNote(newFrequency);
    
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
          now + portamentoTime.value
        );
        
        addLog(`Frequency gliding to ${newFrequency}Hz (${currentNote.value}) over ${portamentoTime.value}s`);
      } else {
        // Instant frequency change
        // Still need to cancel any existing automation first
        oscillator.frequency.cancelScheduledValues(now);
        oscillator.frequency.setValueAtTime(
          newFrequency,
          now
        );
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
      
      // Update vibrato amount when frequency changes (if vibrato is active)
      if (vibratoGain && vibratoOsc && vibratoWidth.value > 0 && audioContext) {
        const now = audioContext.currentTime;
        const semitoneRatio = Math.pow(2, 1/12);
        const semitoneAmount = vibratoWidth.value / 100;
        // Calculate new vibrato amount based on new frequency
        const vibratoAmount = newFrequency * (Math.pow(semitoneRatio, semitoneAmount/2) - 1);
        
        vibratoGain.gain.setValueAtTime(vibratoAmount, now);
        console.log(`Vibrato amount adjusted to ${vibratoAmount}Hz for new frequency ${newFrequency}Hz`);
      }
    }
  };

  // Update oscillator waveform
  const updateWaveform = (newWaveform: OscillatorType) => {
    if (oscillator) {
      oscillator.type = newWaveform;
      waveform.value = newWaveform;
      addLog(`Waveform changed to ${newWaveform}`);

      // Send waveform update to controller if connected
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
    }
  };

  // Update volume
  const updateVolume = (newVolume: number) => {
    if (gainNode) {
      gainNode.gain.value = newVolume;
      volume.value = newVolume;

      // Send volume update to controller if connected
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
    detune.value = cents;

    // Update oscillator if it exists
    if (oscillator && audioContext) {
      oscillator.detune.setValueAtTime(cents, audioContext.currentTime);
      addLog(`Detune set to ${cents} cents`);
    }

    // Send detune update to controller if connected
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
    attack.value = attackTime;
    
    // Implementation will be applied when oscillator is restarted
    addLog(`Attack time set to ${attackTime}s`);
    
    // Send attack update to controller if connected
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
    release.value = releaseTime;
    
    // Implementation will be applied when oscillator is released
    addLog(`Release time set to ${releaseTime}s`);
    
    // Send release update to controller if connected
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
    filterCutoff.value = cutoffFreq;
    
    // Update filter if it exists
    if (filterNode && audioContext) {
      filterNode.frequency.setValueAtTime(cutoffFreq, audioContext.currentTime);
      addLog(`Filter cutoff set to ${cutoffFreq}Hz`);
    }
    
    // Send filter cutoff update to controller if connected
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
    filterResonance.value = resonance;
    
    // Update filter if it exists
    if (filterNode && audioContext) {
      filterNode.Q.setValueAtTime(resonance, audioContext.currentTime);
      addLog(`Filter resonance set to ${resonance}`);
    }
    
    // Send filter resonance update to controller if connected
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
    vibratoRate.value = rate;
    
    // Update vibrato oscillator if it exists
    if (vibratoOsc && audioContext) {
      const now = audioContext.currentTime;
      
      // If rate is 0, effectively disable vibrato by setting the LFO to 0Hz
      // (This won't actually make it 0Hz due to Web Audio limitations, but it'll be very slow)
      if (rate === 0) {
        // Set to very low value (0.001Hz = one cycle per ~17 minutes)
        vibratoOsc.frequency.setValueAtTime(0.001, now);
        
        // Also, if we have vibratoGain, set it to 0
        if (vibratoGain) {
          vibratoGain.gain.setValueAtTime(0, now);
        }
        
        addLog("Vibrato disabled (rate set to 0)");
      } else {
        // Normal rate update
        vibratoOsc.frequency.setValueAtTime(rate, now);
        
        // If vibrato was disabled before and we have width > 0, re-enable it
        if (vibratoGain && vibratoWidth.value > 0 && oscillator) {
          const semitoneRatio = Math.pow(2, 1/12);
          const semitoneAmount = vibratoWidth.value / 100;
          const currentFreq = oscillator.frequency.value;
          const vibratoAmount = currentFreq * (Math.pow(semitoneRatio, semitoneAmount/2) - 1);
          
          vibratoGain.gain.setValueAtTime(vibratoAmount, now);
          console.log(`Vibrato re-enabled with rate ${rate}Hz and amount ${vibratoAmount}Hz`);
        }
        
        addLog(`Vibrato rate set to ${rate}Hz`);
      }
    }
    
    // Send vibrato rate update to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "vibratoRate",
          value: rate,
        }));
      } catch (error) {
        console.error("Error sending vibrato rate update:", error);
      }
    }
  };
  
  // Update vibrato width
  const updateVibratoWidth = (width: number) => {
    vibratoWidth.value = width;
    
    // Update vibrato gain if it exists
    if (vibratoGain && audioContext && oscillator) {
      // Calculate the proper vibrato amount based on semitone ratio and current frequency
      // Convert width from cents to a multiplier (100 cents = 1 semitone)
      const semitoneRatio = Math.pow(2, 1/12); // Semitone ratio
      
      // Calculate how much of a semitone we want for vibrato
      const semitoneAmount = width / 100;
      
      // For vibrato, we need the deviation around the base frequency
      // The amount needs to be current frequency * how much the frequency changes per semitone * fraction of semitone
      const currentFreq = oscillator.frequency.value;
      
      // Calculate proper vibrato amplitude
      // This creates a deviation of +/- (width cents) around the fundamental frequency
      const vibratoAmount = currentFreq * (Math.pow(semitoneRatio, semitoneAmount/2) - 1);
      
      vibratoGain.gain.setValueAtTime(vibratoAmount, audioContext.currentTime);
      console.log(`Vibrato width set to ${width} cents (amount: ${vibratoAmount}Hz around ${currentFreq}Hz)`);
      addLog(`Vibrato width set to ${width} cents`);
      
      // When width is 0, disable vibrato completely by setting gain to 0
      if (width === 0 && vibratoOsc) {
        vibratoGain.gain.setValueAtTime(0, audioContext.currentTime);
      }
    }
    
    // Send vibrato width update to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "vibratoWidth",
          value: width,
        }));
      } catch (error) {
        console.error("Error sending vibrato width update:", error);
      }
    }
  };
  
  // Update portamento time
  const updatePortamentoTime = (time: number) => {
    portamentoTime.value = time;
    
    // Implementation will be applied when frequency changes
    addLog(`Portamento time set to ${time}s`);
    
    // Send portamento time update to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "portamentoTime",
          value: time,
        }));
      } catch (error) {
        console.error("Error sending portamento time update:", error);
      }
    }
  };

  // Toggle oscillator on/off
  const toggleOscillator = (enabled: boolean) => {
    console.log(
      `[SYNTH] toggleOscillator called with enabled=${enabled}, current value=${oscillatorEnabled.value}`,
    );

    oscillatorEnabled.value = enabled;

    if (!audioContext) {
      console.warn(
        "[SYNTH] Cannot toggle oscillator: audioContext is not initialized",
      );
      return;
    }

    if (enabled) {
      // Turn oscillator on
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
          gainNode.gain.value = volume.value;
          
          // Connect filter to gain and gain to destination
          filterNode.connect(gainNode);
          gainNode.connect(audioContext.destination);
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
        oscillator.frequency.value = frequency.value;
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
        
        addLog(
          `Oscillator turned on: ${waveform.value} @ ${frequency.value}Hz ` +
          `(detune: ${detune.value}¢, filter: ${Math.round(filterCutoff.value)}Hz, Q: ${filterResonance.value.toFixed(1)})`
        );
      } else {
        console.log(
          "[SYNTH] Oscillator already exists, not creating a new one",
        );
      }
    } else {
      // Turn oscillator off
      if (oscillator) {
        console.log("[SYNTH] Stopping and disconnecting oscillator");
        oscillator.stop();
        oscillator.disconnect();
        oscillator = null;
        addLog("Oscillator turned off");
        
        // Don't stop vibrato, just disconnect it from the oscillator
        // This way it's preserved for when the oscillator is turned back on
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
        console.log("[SYNTH] No oscillator to turn off");
      }
    }

    // Send oscillator state to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === "open") {
      try {
        dataChannel.value.send(JSON.stringify({
          type: "synth_param",
          param: "oscillatorEnabled",
          value: enabled,
        }));
      } catch (error) {
        console.error("Error sending oscillator state:", error);
      }
    }
  };

  // Connect to the signaling server on mount and clean up on unmount
  useEffect(() => {
    // Connect to signaling server (but don't enable audio yet)
    connectWebSocket();

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
              {activeController.value && !connected.value ? (
                <div class="controller-available">
                  <p>Controller available: {activeController.value}</p>
                  <button
                    class="connect-button"
                    onClick={() => connectToController(activeController.value as string)}
                  >
                    Connect to Controller
                  </button>
                </div>
              ) : connected.value ? (
                <p class="connection-status status-connected">
                  Connected to controller
                </p>
              ) : (
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
                    Oscillator:{" "}
                    <span
                      class={oscillatorEnabled.value
                        ? "status-on"
                        : "status-off"}
                    >
                      {oscillatorEnabled.value ? "ON" : "OFF"}
                    </span>
                  </p>
                  <p>
                    Note: <span class="param-value">{currentNote.value}</span>
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
                        : `${(filterCutoff.value / 1000).toFixed(1)}kHz`} (Q:{filterResonance.value.toFixed(1)})
                    </span>
                  </p>
                  <p>
                    Vibrato:{" "}
                    <span class="param-value">
                      {vibratoRate.value.toFixed(1)}Hz, {Math.round(vibratoWidth.value)}¢
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
