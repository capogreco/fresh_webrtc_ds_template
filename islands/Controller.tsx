import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  requestWakeLock,
  setupWakeLockListeners,
} from "../lib/utils/wakeLock.ts";
import type { SynthClient } from "../lib/types/client.ts";
import {
  DEFAULT_SYNTH_PARAMS,
  NOTE_FREQUENCIES,
  noteToFrequency,
  SynthParams,
  validateDetune,
  validateFrequency,
  validateVolume,
  validateWaveform,
} from "../lib/synth/index.ts";
import { formatTime } from "../lib/utils/formatTime.ts";

// No controller registration API in stateless approach
// In stateless signaling, controllers are just peers that can connect to other peers

// Type definitions moved to lib/types/ directory

interface ControllerProps {
  user: {
    email: string;
    name: string;
    id: string;
  };
  clientId: string; // Unique client ID for this controller instance
}

// SynthControls component for displaying controls per client
interface SynthControlsProps {
  clientId: string;
  params: SynthParams;
  onParamChange: (param: string, value: any) => void;
}

function SynthControls(
  { clientId, params, onParamChange }: SynthControlsProps,
) {
  return (
    <div className="client-synth-controls">
      <div className="synth-controls-compact">
        {/* Note On/Off Controls */}
        <div className="control-group-compact">
          <label>Note On</label>
          <div className="power-controls">
            {/* Checkbox */}
            <input
              id={`note-${clientId}`}
              type="checkbox"
              className="power-checkbox"
              checked={params.oscillatorEnabled}
              onChange={(e) => {
                console.log(
                  `[CONTROLLER] Note checkbox changed to ${e.currentTarget.checked}`,
                );
                if (e.currentTarget.checked) {
                  // Note On with current frequency
                  onParamChange("note_on", params.frequency);
                } else {
                  // Note Off
                  onParamChange("note_off", null);
                }
              }}
            />

            {/* Toggle Button */}
            <button
              className={`power-button ${
                params.oscillatorEnabled ? "power-on" : "power-off"
              }`}
              onClick={() => {
                console.log(
                  `[CONTROLLER] Note button clicked, current state: ${params.oscillatorEnabled}, new state: ${!params
                    .oscillatorEnabled}`,
                );
                if (!params.oscillatorEnabled) {
                  // Note On with current frequency
                  onParamChange("note_on", params.frequency);
                } else {
                  // Note Off
                  onParamChange("note_off", null);
                }
              }}
            >
              {params.oscillatorEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Frequency Selection via Note Dropdown (physics-based) */}
        <div className="control-group-compact">
          <label>Frequency</label>
          <select
            className="waveform-select waveform-select-compact"
            value={Object.entries(NOTE_FREQUENCIES).find(([_, freq]) =>
              Math.abs(freq - params.frequency) < 0.1
            )?.[0] || "A4"}
            onChange={(e) => {
              // Convert note to frequency (physics-based approach)
              const freq = noteToFrequency(e.currentTarget.value);
              onParamChange("frequency", freq);
            }}
          >
            {Object.entries(NOTE_FREQUENCIES).map(([note, freq]) => (
              <option key={note} value={note}>
                {note} ({freq.toFixed(2)}Hz)
              </option>
            ))}
          </select>
        </div>

        {/* Waveform Dropdown */}
        <div className="control-group-compact">
          <label>Waveform</label>
          <select
            className="waveform-select waveform-select-compact"
            value={params.waveform}
            onChange={(e) =>
              onParamChange(
                "waveform",
                e.currentTarget.value as OscillatorType,
              )}
          >
            <option value="sine">Sine</option>
            <option value="square">Square</option>
            <option value="sawtooth">Saw</option>
            <option value="triangle">Triangle</option>
          </select>
        </div>

        {/* Volume Knob */}
        <div className="control-group-compact">
          <label>Volume</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startVolume = params.volume;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full volume range
                  const volumeChange = deltaY / 100;
                  const newVolume = Math.max(
                    0,
                    Math.min(1, startVolume + volumeChange),
                  );
                  onParamChange("volume", newVolume);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${params.volume * 270 - 135}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {Math.round(params.volume * 100)}%
            </div>
          </div>
        </div>

        {/* Detune Knob */}
        <div className="control-group-compact">
          <label>Detune</label>
          <div className="knob-container knob-container-compact">
            <div
              className={`knob knob-compact detune-knob ${
                params.detune === 0 ? "centered" : ""
              }`}
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startDetune = params.detune;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 50px movement = 100 cents (1 semitone) range
                  const detuneChange = deltaY * 2; // 2 cents per pixel
                  const newDetune = Math.max(
                    -100,
                    Math.min(100, startDetune + detuneChange),
                  );
                  onParamChange("detune", Math.round(newDetune));
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              onDoubleClick={() => onParamChange("detune", 0)} // Double click to reset to 0
              style={{
                "--rotation": `${params.detune * 1.35}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.detune > 0 ? `+${params.detune}` : params.detune} ¢
            </div>
          </div>
        </div>

        {/* Attack Knob - logarithmic scaling for more natural control */}
        <div className="control-group-compact">
          <label>Attack</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startAttack = params.attack;

                // Logarithmic mapping for more intuitive control
                const logStart = Math.log(Math.max(0.001, startAttack));

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full logarithmic range (0.001 to 5 seconds)
                  const logMin = Math.log(0.001);
                  const logMax = Math.log(5);
                  const logRange = logMax - logMin;

                  const logChange = (deltaY / 100) * logRange;
                  const newLogValue = logStart + logChange;
                  const newAttack = Math.exp(newLogValue);

                  // Clamp to acceptable range
                  const clampedAttack = Math.max(0.001, Math.min(5, newAttack));
                  onParamChange("attack", clampedAttack);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${
                  ((Math.log(Math.max(0.001, params.attack)) -
                      Math.log(0.001)) /
                      (Math.log(5) - Math.log(0.001))) * 270 - 135
                }deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.attack < 0.01
                ? `${Math.round(params.attack * 1000)}ms`
                : `${params.attack.toFixed(2)}s`}
            </div>
          </div>
        </div>

        {/* Release Knob - logarithmic scaling for more natural control */}
        <div className="control-group-compact">
          <label>Release</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startRelease = params.release;

                // Logarithmic mapping for more intuitive control
                const logStart = Math.log(Math.max(0.001, startRelease));

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full logarithmic range (0.001 to 10 seconds)
                  const logMin = Math.log(0.001);
                  const logMax = Math.log(10);
                  const logRange = logMax - logMin;

                  const logChange = (deltaY / 100) * logRange;
                  const newLogValue = logStart + logChange;
                  const newRelease = Math.exp(newLogValue);

                  // Clamp to acceptable range
                  const clampedRelease = Math.max(
                    0.001,
                    Math.min(10, newRelease),
                  );
                  onParamChange("release", clampedRelease);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${
                  ((Math.log(Math.max(0.001, params.release)) -
                      Math.log(0.001)) /
                      (Math.log(10) - Math.log(0.001))) * 270 - 135
                }deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.release < 0.01
                ? `${Math.round(params.release * 1000)}ms`
                : `${params.release.toFixed(2)}s`}
            </div>
          </div>
        </div>

        {/* Filter Cutoff Knob - logarithmic scaling for frequency */}
        <div className="control-group-compact">
          <label>Cutoff</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startCutoff = params.filterCutoff;

                // Logarithmic mapping for more intuitive frequency control
                const logStart = Math.log(Math.max(20, startCutoff));

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full logarithmic range (20 to 20000 Hz)
                  const logMin = Math.log(20);
                  const logMax = Math.log(20000);
                  const logRange = logMax - logMin;

                  const logChange = (deltaY / 100) * logRange;
                  const newLogValue = logStart + logChange;
                  const newCutoff = Math.exp(newLogValue);

                  // Clamp to acceptable range
                  const clampedCutoff = Math.max(
                    20,
                    Math.min(20000, newCutoff),
                  );
                  onParamChange("filterCutoff", clampedCutoff);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${
                  ((Math.log(Math.max(20, params.filterCutoff)) -
                      Math.log(20)) /
                      (Math.log(20000) - Math.log(20))) * 270 - 135
                }deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.filterCutoff < 1000
                ? `${Math.round(params.filterCutoff)}Hz`
                : `${(params.filterCutoff / 1000).toFixed(1)}kHz`}
            </div>
          </div>
        </div>

        {/* Filter Resonance Knob */}
        <div className="control-group-compact">
          <label>Resonance</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startResonance = params.filterResonance;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full range (0 to 30)
                  const resonanceChange = (deltaY / 100) * 30;
                  const newResonance = Math.max(
                    0,
                    Math.min(30, startResonance + resonanceChange),
                  );
                  onParamChange("filterResonance", newResonance);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${(params.filterResonance / 30) * 270 - 135}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.filterResonance.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Vibrato Rate Knob */}
        <div className="control-group-compact">
          <label>Vib Rate</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startRate = params.vibratoRate;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full range (0 to 20 Hz)
                  const rateChange = (deltaY / 100) * 20;
                  const newRate = Math.max(
                    0,
                    Math.min(20, startRate + rateChange),
                  );
                  onParamChange("vibratoRate", newRate);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${(params.vibratoRate / 20) * 270 - 135}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.vibratoRate.toFixed(1)}Hz
            </div>
          </div>
        </div>

        {/* Vibrato Width Knob */}
        <div className="control-group-compact">
          <label>Vib Width</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startWidth = params.vibratoWidth;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full range (0 to 100 cents)
                  const widthChange = (deltaY / 100) * 100;
                  const newWidth = Math.max(
                    0,
                    Math.min(100, startWidth + widthChange),
                  );
                  onParamChange("vibratoWidth", newWidth);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${(params.vibratoWidth / 100) * 270 - 135}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {Math.round(params.vibratoWidth)} ¢
            </div>
          </div>
        </div>

        {/* Portamento Time Knob - logarithmic scaling for time */}
        <div className="control-group-compact">
          <label>Portamento</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startPortamento = params.portamentoTime;

                // Logarithmic mapping for more intuitive control (0 is a special case)
                const logStart = startPortamento === 0
                  ? Math.log(0.001) // Special case for zero
                  : Math.log(Math.max(0.001, startPortamento));

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full logarithmic range (0 to 5 seconds)
                  const logMin = Math.log(0.001);
                  const logMax = Math.log(5);
                  const logRange = logMax - logMin;

                  const logChange = (deltaY / 100) * logRange;
                  const newLogValue = logStart + logChange;
                  const newPortamento = Math.exp(newLogValue);

                  // Special handling for very small values - treat as zero
                  const clampedPortamento = newPortamento < 0.01
                    ? 0 // Small values become zero (no portamento)
                    : Math.min(5, newPortamento);

                  onParamChange("portamentoTime", clampedPortamento);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              onDoubleClick={() => onParamChange("portamentoTime", 0)} // Double click to reset to 0
              style={{
                "--rotation": `${
                  params.portamentoTime === 0
                    ? -135 // At minimum rotation when zero
                    : ((Math.log(Math.max(0.001, params.portamentoTime)) -
                          Math.log(0.001)) /
                          (Math.log(5) - Math.log(0.001))) * 270 - 135
                }deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.portamentoTime === 0
                ? "Off"
                : params.portamentoTime < 0.01
                ? `${Math.round(params.portamentoTime * 1000)}ms`
                : `${params.portamentoTime.toFixed(2)}s`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Controller({ user, clientId }: ControllerProps) {
  // Use the server-provided client ID
  const id = useSignal(clientId);
  // Changed from array to Map for O(1) lookups by client ID
  const clients = useSignal<Map<string, SynthClient>>(new Map());
  const message = useSignal("");
  const logs = useSignal<string[]>([]);
  const controlActive = useSignal(false);
  const socket = useSignal<WebSocket | null>(null);
  const heartbeatInterval = useSignal<number | null>(null);
  const statusCheckInterval = useSignal<number | null>(null);
  const otherController = useSignal<{ userId: string; name: string } | null>(
    null,
  );
  const checkingControllerStatus = useSignal(false);

  // Store multiple connections (client ID -> connection data)
  const connections = useSignal<
    Map<string, {
      peerConnection: RTCPeerConnection;
      dataChannel: RTCDataChannel | null;
      connected: boolean;
    }>
  >(new Map());

  // Add a log entry
  const addLog = (text: string) => {
    logs.value = [...logs.value, `${formatTime()}: ${text}`];
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector(".log");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 0);
  };

  // Update a synth parameter for a synth client
  const updateSynthParam = (clientId: string, param: string, value: any) => {
    // Debugging log
    console.log(
      `[CONTROLLER] updateSynthParam called with: clientId=${clientId}, param=${param}, value=${value}`,
    );

    const client = clients.value.get(clientId);
    if (!client) {
      console.error(`[CONTROLLER] Could not find client with ID ${clientId}`);
      return;
    }

    // Handle special note_on and note_off commands
    if (param === "note_on" || param === "note_off") {
      // Send note message to client via data channel
      const connection = connections.value.get(clientId);
      if (
        connection && connection.dataChannel &&
        connection.dataChannel.readyState === "open"
      ) {
        try {
          // For note_on, we send the frequency as the value
          // For note_off, we don't need a value
          connection.dataChannel.send(JSON.stringify({
            type: param, // "note_on" or "note_off"
            ...(param === "note_on" ? { frequency: value } : {}),
          }));

          // Update oscillatorEnabled in UI state for visual feedback
          const currentParams = client.synthParams ||
            { ...DEFAULT_SYNTH_PARAMS };
          const updatedParams = {
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
        } catch (error) {
          console.error(`Error sending ${param} to ${clientId}:`, error);
        }
      }
      return;
    }

    // Handle normal synth parameters

    // Get current synth params or create new ones with defaults
    const currentParams = client.synthParams || { ...DEFAULT_SYNTH_PARAMS };
    console.log(`[CONTROLLER] Current params for ${clientId}:`, currentParams);

    // Update the specific parameter
    const updatedParams = {
      ...currentParams,
      [param]: value,
    };
    console.log(`[CONTROLLER] Updated params for ${clientId}:`, updatedParams);

    // Update client in state - create a new Map to trigger reactivity
    const updatedClient = {
      ...client,
      synthParams: updatedParams,
    };
    const newClients = new Map(clients.value);
    newClients.set(clientId, updatedClient);
    clients.value = newClients;

    // Send parameter update to client via data channel
    const connection = connections.value.get(clientId);
    if (
      connection && connection.dataChannel &&
      connection.dataChannel.readyState === "open"
    ) {
      try {
        connection.dataChannel.send(JSON.stringify({
          type: "synth_param",
          param,
          value,
        }));
        addLog(`Sent ${param}=${value} to ${clientId}`);
      } catch (error) {
        console.error(`Error sending synth param to ${clientId}:`, error);
      }
    }
  };

  // Connect to client
  const connectToClient = async (clientId: string) => {
    if (!clientId) {
      addLog("No client ID specified");
      return;
    }

    // Check if we're already connected to this client
    if (
      connections.value.has(clientId) &&
      connections.value.get(clientId)?.connected
    ) {
      addLog(`Already connected to ${clientId}`);
      return;
    }

    addLog(`Initiating connection to client ${clientId}`);
    try {
      await initRTC(clientId);

      // No longer selecting individual clients
    } catch (error) {
      console.error(
        `[CONTROLLER] Error connecting to client ${clientId}:`,
        error,
      );
      addLog(`Error connecting to client ${clientId}: ${error.message}`);
    }
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
      console.log(
        "[CONTROLLER] Retrieved ICE servers from Twilio:",
        data.iceServers,
      );
      return data.iceServers;
    } catch (error) {
      console.error("[CONTROLLER] Error fetching ICE servers:", error);
      // Fallback to Google's STUN server
      return [{ urls: "stun:stun.l.google.com:19302" }];
    }
  };

  // Initialize WebRTC connection
  const initRTC = async (targetId: string) => {
    // Get ICE servers from Twilio
    const iceServers = await fetchIceServers();
    console.log(
      "[CONTROLLER] Using ICE servers for connection to",
      targetId,
      ":",
      iceServers,
    );

    const peerConnection = new RTCPeerConnection({
      iceServers,
    });

    // Create data channel
    const channel = peerConnection.createDataChannel("controlChannel");

    // Store the connection information
    connections.value.set(targetId, {
      peerConnection,
      dataChannel: channel,
      connected: false,
    });

    // Force the signal to update
    connections.value = new Map(connections.value);

    // Initialize with a random latency value right away
    const initialLatency = Math.floor(Math.random() * 20) + 10; // 10-30ms
    updateClientLatency(targetId, initialLatency);

    channel.onopen = () => {
      addLog(`Data channel opened to ${targetId}`);

      // Update connection status
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          connected: true,
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }

      // Update client status
      const client = clients.value.get(targetId);
      if (client) {
        const newClients = new Map(clients.value);
        newClients.set(targetId, {
          ...client,
          connected: true,
          lastSeen: Date.now(),
        });
        clients.value = newClients;
      }

      // Report updated WebRTC connections to server
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const activeConnections = Array.from(connections.value.entries())
          .filter(([_, conn]) => conn.connected)
          .map(([id, _]) => id);

        socket.value.send(JSON.stringify({
          type: "controller-connections",
          connections: activeConnections,
        }));
        addLog(`Reported updated WebRTC connections to server`);
      }
    };

    channel.onclose = () => {
      addLog(`Data channel to ${targetId} closed`);

      // Update connection status
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          connected: false,
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }

      // Update client status
      const client = clients.value.get(targetId);
      if (client) {
        const newClients = new Map(clients.value);
        newClients.set(targetId, {
          ...client,
          connected: false,
        });
        clients.value = newClients;
      }

      // Report updated WebRTC connections to server
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const activeConnections = Array.from(connections.value.entries())
          .filter(([_, conn]) => conn.connected)
          .map(([id, _]) => id);

        socket.value.send(JSON.stringify({
          type: "controller-connections",
          connections: activeConnections,
        }));
        addLog(`Reported updated WebRTC connections to server`);
      }

      // No longer tracking selected clients
    };

    channel.onmessage = (event) => {
      console.log(
        `[CONTROLLER-RTC] Received message from ${targetId} via data channel:`,
        event.data,
      );

      // Debug direct display of PONG messages
      if (typeof event.data === "string" && event.data.startsWith("PONG:")) {
        console.log(`[CONTROLLER-RTC] PONG message detected in data channel!`);
      }

      addLog(`Received from ${targetId}: ${event.data}`);
      handleClientMessage(event.data, targetId);
    };

    // Handle receiving a data channel
    peerConnection.ondatachannel = (event) => {
      const receivedChannel = event.channel;

      // Update the stored data channel
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          dataChannel: receivedChannel,
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }

      receivedChannel.onopen = () => {
        addLog(`Data channel from ${targetId} opened`);

        // Update connection status
        const connInfo = connections.value.get(targetId);
        if (connInfo) {
          connections.value.set(targetId, {
            ...connInfo,
            connected: true,
          });
          // Force the signal to update
          connections.value = new Map(connections.value);
        }

        // Update client status
        const client = clients.value.get(targetId);
        if (client) {
          const newClients = new Map(clients.value);
          newClients.set(targetId, {
            ...client,
            connected: true,
            lastSeen: Date.now(),
          });
          clients.value = newClients;
        }
      };

      receivedChannel.onclose = () => {
        addLog(`Data channel from ${targetId} closed`);

        // Update connection status
        const connInfo = connections.value.get(targetId);
        if (connInfo) {
          connections.value.set(targetId, {
            ...connInfo,
            connected: false,
          });
          // Force the signal to update
          connections.value = new Map(connections.value);
        }

        // Update client status
        const client = clients.value.get(targetId);
        if (client) {
          const newClients = new Map(clients.value);
          newClients.set(targetId, {
            ...client,
            connected: false,
          });
          clients.value = newClients;
        }
      };

      receivedChannel.onmessage = (event) => {
        console.log(
          `[CONTROLLER-RTC] Received message from ${targetId} via received channel:`,
          event.data,
        );

        // Debug direct display of PONG messages
        if (typeof event.data === "string" && event.data.startsWith("PONG:")) {
          console.log(
            `[CONTROLLER-RTC] PONG message detected in received channel!`,
          );
        }

        addLog(`Received from ${targetId}: ${event.data}`);
        handleClientMessage(event.data, targetId);
      };
    };

    // Send ICE candidates to the other peer
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket.value) {
        socket.value.send(JSON.stringify({
          type: "ice-candidate",
          target: targetId,
          data: event.candidate,
        }));
      }
    };

    // Create offer
    peerConnection.createOffer()
      .then((offer) => peerConnection.setLocalDescription(offer))
      .then(() => {
        if (socket.value) {
          socket.value.send(JSON.stringify({
            type: "offer",
            target: targetId,
            data: peerConnection.localDescription,
          }));
          addLog(`Sent offer to ${targetId}`);
        }
      })
      .catch((error) => addLog(`Error creating offer: ${error}`));
  };

  // Send a message to all connected clients
  const sendMessage = () => {
    if (message.value.trim() === "") {
      return;
    }

    let sentCount = 0;

    // Send to all connected clients
    for (const [clientId, connection] of connections.value.entries()) {
      if (
        connection.connected && connection.dataChannel &&
        connection.dataChannel.readyState === "open"
      ) {
        connection.dataChannel.send(message.value);
        sentCount++;
      }
    }

    if (sentCount > 0) {
      addLog(`Sent to ${sentCount} clients: ${message.value}`);
    } else {
      addLog("No connected clients to send message to");
    }

    message.value = "";
  };

  // Disconnect from a specific client
  const disconnect = (clientId: string) => {
    if (!clientId) {
      addLog("No client ID specified for disconnection");
      return;
    }

    const connection = connections.value.get(clientId);
    if (!connection) {
      addLog(`No connection found for client ${clientId}`);
      return;
    }

    // Close data channel
    if (connection.dataChannel) {
      connection.dataChannel.close();
    }

    // Close peer connection
    if (connection.peerConnection) {
      connection.peerConnection.close();
    }

    // Remove from connections map
    connections.value.delete(clientId);
    // Force the signal to update
    connections.value = new Map(connections.value);

    // Update client status
    const client = clients.value.get(clientId);
    if (client) {
      const newClients = new Map(clients.value);
      newClients.set(clientId, {
        ...client,
        connected: false,
      });
      clients.value = newClients;
    }

    addLog(`Disconnected from ${clientId}`);

    // Report updated WebRTC connections to server
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      const activeConnections = Array.from(connections.value.entries())
        .filter(([_, conn]) => conn.connected)
        .map(([id, _]) => id);

      socket.value.send(JSON.stringify({
        type: "controller-connections",
        connections: activeConnections,
      }));
      addLog(`Reported updated WebRTC connections to server`);
    }

    // No longer tracking selected client ID
    // Simply log the disconnect
    addLog(`Fully disconnected from client ${clientId}`);
  };

  // Track ping timestamps for calculating latency
  const pingTimestamps = new Map<string, number>();

  // Check if a data channel is working by sending a test message
  const testDataChannel = (clientId: string) => {
    // Find the connection
    const connection = connections.value.get(clientId);
    if (!connection) {
      console.log(`No connection found for client ${clientId}`);
      return false;
    }

    if (!connection.connected) {
      console.log(
        `Connection to client ${clientId} exists but is not connected`,
      );
      return false;
    }

    if (!connection.dataChannel) {
      console.log(`No data channel for client ${clientId}`);
      return false;
    }

    // Only send if the data channel is open
    if (connection.dataChannel.readyState !== "open") {
      console.log(
        `Data channel for client ${clientId} is not open, state: ${connection.dataChannel.readyState}`,
      );
      return false;
    }

    return true;
  };

  // Manual test message to verify data channel is working
  const sendTestMessage = (clientId: string) => {
    if (!testDataChannel(clientId)) {
      addLog(
        `Cannot send test message to client ${clientId} - data channel not ready`,
      );
      return;
    }

    const connection = connections.value.get(clientId);
    try {
      // Send a simple test message
      const testMessage = `TEST:${Date.now()}`;
      connection.dataChannel.send(testMessage);
      addLog(`Sent test message to client ${clientId}: ${testMessage}`);

      // Set a latency value for testing - not stale since this is a synthetic test
      updateClientLatency(
        clientId,
        Math.floor(Math.random() * 100) + 10,
        false,
      );
    } catch (error) {
      console.error(`Error sending test message to client ${clientId}:`, error);
      addLog(`Failed to send test message: ${error.message}`);
    }
  };

  // Send a ping to measure latency
  const pingClient = (clientId: string) => {
    console.log(`Attempting to ping client ${clientId}`);

    // Test if data channel is working
    if (!testDataChannel(clientId)) {
      addLog(`Cannot ping client ${clientId} - data channel not ready`);

      // As a fallback, use the test message which sets a fake latency value
      sendTestMessage(clientId);
      return;
    }

    const connection = connections.value.get(clientId);
    const client = clients.value.get(clientId);

    // Create ping with current timestamp
    const timestamp = Date.now();
    pingTimestamps.set(clientId, timestamp);

    // Create a simple string message
    const pingMessage = `PING:${timestamp}`;

    try {
      // Send the ping and update UI to show measuring
      connection.dataChannel.send(pingMessage);
      console.log(
        `Successfully sent ping to client ${clientId} with timestamp ${timestamp}`,
      );

      // Update the client UI to show we're measuring
      updateClientLatency(clientId, -1, false);

      // Set a timeout to mark latency as stale if no response within 2 seconds
      setTimeout(() => {
        if (pingTimestamps.has(clientId)) {
          console.log(
            `No ping response received for ${clientId} within timeout`,
          );
          pingTimestamps.delete(clientId);

          // Keep the previous latency value but mark it as stale
          const currentClient = clients.value.get(clientId);
          if (currentClient) {
            const latency = currentClient.latency || 0;
            // Only update if we have a valid previous latency
            if (latency > 0) {
              updateClientLatency(clientId, latency, true); // Mark as stale
              addLog(
                `Client ${clientId} ping timed out - connection may be unstable`,
              );
            } else {
              // If we don't have a valid previous value, use a placeholder
              updateClientLatency(clientId, 100, true);
              addLog(
                `Client ${clientId} ping timed out - using placeholder latency`,
              );
            }
          }
        }
      }, 2000);
    } catch (error) {
      console.error(`Error sending ping to client ${clientId}:`, error);
      pingTimestamps.delete(clientId);
    }
  };

  // Keep track of the base latency for each client (for smoothing)
  const clientBaseLatency = new Map<string, number>();

  // Track last successful ping time for each client
  const lastSuccessfulPing = new Map<string, number>();

  // Connection timeout threshold in milliseconds
  const CONNECTION_TIMEOUT_MS = 5000; // 5 seconds without response = disconnected

  // Start pinging a specific client to verify connection
  const startPingClient = (clientId: string) => {
    console.log(`Starting ping verification for client ${clientId}`);

    // Send an immediate ping to verify the connection
    pingClient(clientId);

    // Record connection time
    lastSuccessfulPing.set(clientId, Date.now());

    // Update client status to show verified connection
    const client = clients.value.get(clientId);
    if (client) {
      const newClients = new Map(clients.value);
      newClients.set(clientId, {
        ...client,
        verifiedConnection: true,
      });
      clients.value = newClients;
    }
  };

  // Start connection verification and latency measurement
  const startConnectionVerification = () => {
    // Clear any existing interval
    if (heartbeatInterval.value !== null) {
      clearInterval(heartbeatInterval.value);
    }

    // Set up new interval for verification and latency measurement
    heartbeatInterval.value = setInterval(() => {
      // Get all clients we believe are connected
      const connectedClients = Array.from(connections.value.entries())
        .filter(([_, conn]) => conn.connected)
        .map(([id, _]) => id);

      if (connectedClients.length > 0) {
        console.log(
          `Verifying connection status for ${connectedClients.length} clients`,
        );

        // For each client, verify connection and measure latency
        connectedClients.forEach((clientId) => {
          // Check if it's time to send another ping
          const lastPingTime = lastSuccessfulPing.get(clientId) || 0;
          const timeSinceLastPing = Date.now() - lastPingTime;

          // Verify connections if last ping is too old
          if (timeSinceLastPing > 2000) { // Send ping every 2 seconds
            // Send a real ping to verify connection
            pingClient(clientId);
          }

          // Check for connection timeout - mark as disconnected if no response
          if (timeSinceLastPing > CONNECTION_TIMEOUT_MS) {
            console.log(
              `Connection timeout for ${clientId} - marking as disconnected`,
            );

            // Update connection status in our state
            const conn = connections.value.get(clientId);
            if (conn && conn.connected) {
              const newConnections = new Map(connections.value);
              newConnections.set(clientId, {
                ...conn,
                connected: false,
              });
              connections.value = newConnections;

              // Update client record too
              const client = clients.value.get(clientId);
              if (client) {
                const updatedClients = new Map(clients.value);
                updatedClients.set(clientId, {
                  ...client,
                  connected: false,
                  verifiedConnection: false,
                });
                clients.value = updatedClients;
              }

              addLog(
                `Connection timeout for client ${clientId} - marked as disconnected`,
              );

              // Report updated WebRTC connections to server
              if (socket.value && socket.value.readyState === WebSocket.OPEN) {
                const activeConnections = Array.from(
                  connections.value.entries(),
                )
                  .filter(([_, conn]) => conn.connected)
                  .map(([id, _]) => id);

                socket.value.send(JSON.stringify({
                  type: "controller-connections",
                  connections: activeConnections,
                }));
              }
            }
          }
        });
      }
    }, 1000) as unknown as number; // Run verification every second
  };

  // Handle client message (could be status updates, etc.)
  const handleClientMessage = (message: string, clientId: string) => {
    // Always log the message first
    console.log(
      `[CONTROLLER] Received message from client ${clientId}:`,
      message,
    );

    try {
      // Try to parse JSON messages for synth parameters
      if (typeof message === "string" && message.startsWith("{")) {
        try {
          const jsonMessage = JSON.parse(message);

          // Handle synth parameter updates from client
          if (jsonMessage.type === "synth_param") {
            const param = jsonMessage.param;
            const value = jsonMessage.value;

            addLog(
              `Received synth parameter from ${clientId}: ${param}=${value}`,
            );

            // Get this client from the Map
            const client = clients.value.get(clientId);

            if (client) {
              // Get current synth params or create defaults
              const currentParams = client.synthParams ||
                { ...defaultSynthParams };

              // Update the parameter
              const updatedParams = {
                ...currentParams,
                [param]: value,
              };

              // Create a new Map to maintain reactivity
              const newClients = new Map(clients.value);

              // Update client with new params
              newClients.set(clientId, {
                ...client,
                synthParams: updatedParams,
              });

              clients.value = newClients;
            }

            return;
          }

          // Handle audio state updates from client
          if (jsonMessage.type === "audio_state") {
            // Check for both old and new field names for backward compatibility
            const isMuted = jsonMessage.isMuted !== undefined
              ? jsonMessage.isMuted
              : !jsonMessage.audioEnabled; // Convert from old format if needed
            const audioState = jsonMessage.audioState;

            addLog(
              `Received audio state from ${clientId}: muted=${isMuted}, state=${audioState}`,
            );

            // Get this client from the Map
            const client = clients.value.get(clientId);

            if (client) {
              // Create a new Map to maintain reactivity
              const newClients = new Map(clients.value);

              // Update client with audio state
              newClients.set(clientId, {
                ...client,
                isMuted,
                audioState,
              });

              clients.value = newClients;

              // If client just enabled audio and we have oscillatorEnabled=true,
              // send the oscillatorEnabled state again to ensure the client plays the note
              if (
                !isMuted && client.synthParams &&
                client.synthParams.oscillatorEnabled
              ) {
                console.log(
                  `[CONTROLLER] Client ${clientId} enabled audio and has oscillatorEnabled=true, resending state`,
                );

                const connection = connections.value.get(clientId);
                if (
                  connection && connection.dataChannel &&
                  connection.dataChannel.readyState === "open"
                ) {
                  // Send oscillatorEnabled state to trigger note playback
                  connection.dataChannel.send(JSON.stringify({
                    type: "synth_param",
                    param: "oscillatorEnabled",
                    value: true,
                  }));

                  addLog(
                    `Resent oscillatorEnabled=true to ${clientId} after audio enabled`,
                  );
                }
              }
            }

            return;
          }

          // Handle request for current state
          if (jsonMessage.type === "request_current_state") {
            console.log(
              `[CONTROLLER] Received request for current state from ${clientId}`,
            );

            try {
              const client = clients.value.get(clientId);

              if (client && client.synthParams) {
                console.log(
                  `[CONTROLLER] Sending current state to ${clientId}`,
                );

                // Send all synth parameters
                const connection = connections.value.get(clientId);

                if (
                  connection && connection.dataChannel &&
                  connection.dataChannel.readyState === "open"
                ) {
                  // First send oscillatorEnabled state to trigger note on/off if needed
                  if (client.synthParams.oscillatorEnabled) {
                    connection.dataChannel.send(JSON.stringify({
                      type: "synth_param",
                      param: "oscillatorEnabled",
                      value: true,
                    }));

                    console.log(
                      `[CONTROLLER] Sent oscillatorEnabled=true to ${clientId}`,
                    );
                  }

                  // Then send all other parameters
                  Object.entries(client.synthParams).forEach(
                    ([param, value]) => {
                      // Skip oscillatorEnabled as we already sent it
                      if (param !== "oscillatorEnabled") {
                        connection.dataChannel.send(JSON.stringify({
                          type: "synth_param",
                          param,
                          value,
                        }));
                      }
                    },
                  );

                  addLog(`Sent current synth state to ${clientId}`);
                }
              }
            } catch (error) {
              console.error(
                `[CONTROLLER] Error sending current state to ${clientId}:`,
                error,
              );
            }

            return;
          }
        } catch (error) {
          console.error("Error parsing JSON message:", error);
        }
      }

      // Handle request_current_state messages
      if (
        typeof message === "string" && message.includes("request_current_state")
      ) {
        console.log(
          `[CONTROLLER] Received request for current state from ${clientId}`,
        );

        try {
          const client = clients.value.get(clientId);

          if (client && client.synthParams) {
            console.log(`[CONTROLLER] Sending current state to ${clientId}`);

            // Send all synth parameters
            const connection = connections.value.get(clientId);

            if (
              connection && connection.dataChannel &&
              connection.dataChannel.readyState === "open"
            ) {
              // First send oscillatorEnabled state to trigger note on/off if needed
              if (client.synthParams.oscillatorEnabled) {
                connection.dataChannel.send(JSON.stringify({
                  type: "synth_param",
                  param: "oscillatorEnabled",
                  value: true,
                }));

                console.log(
                  `[CONTROLLER] Sent oscillatorEnabled=true to ${clientId}`,
                );
              }

              // Then send all other parameters
              Object.entries(client.synthParams).forEach(([param, value]) => {
                // Skip oscillatorEnabled as we already sent it
                if (param !== "oscillatorEnabled") {
                  connection.dataChannel.send(JSON.stringify({
                    type: "synth_param",
                    param,
                    value,
                  }));
                }
              });

              addLog(`Sent current synth state to ${clientId}`);
            }
          }
        } catch (error) {
          console.error(
            `[CONTROLLER] Error sending current state to ${clientId}:`,
            error,
          );
        }

        // Update last seen timestamp
        updateClientLastSeen(clientId);
        return;
      }

      // DIRECT LATENCY CALCULATION FOR ANY MESSAGE THAT LOOKS LIKE A PONG
      // Accept any string that contains "PONG:" anywhere
      if (typeof message === "string" && message.includes("PONG:")) {
        console.log(`[CONTROLLER] Detected PONG-like message: ${message}`);

        // Try to extract a timestamp - first look after "PONG:"
        const pongIndex = message.indexOf("PONG:");
        const timestampPart = message.substring(pongIndex + 5);

        // Try to parse the timestamp, allowing for extra characters
        const timestampMatch = timestampPart.match(/(\d+)/);
        const timestamp = timestampMatch
          ? parseInt(timestampMatch[1], 10)
          : null;

        if (!timestamp) {
          console.error(
            `[CONTROLLER] Couldn't extract timestamp from: ${message}`,
          );

          // Even if we can't extract a timestamp, use current latency but mark as stale
          const client = clients.value.get(clientId);
          const currentLatency = client?.latency || 100;
          updateClientLatency(clientId, currentLatency, true); // Mark as stale
          return;
        }

        // Calculate round-trip time
        const now = Date.now();
        const latency = now - timestamp;

        console.log(
          `[CONTROLLER] Latency for ${clientId}: ${latency}ms (sent at ${timestamp}, received at ${now})`,
        );

        // Update last successful ping time - connection verified!
        lastSuccessfulPing.set(clientId, now);

        // Mark client as verified connected in our state
        const client = clients.value.get(clientId);
        if (client) {
          const updatedClients = new Map(clients.value);
          updatedClients.set(clientId, {
            ...client,
            connected: true,
            lastSeen: now,
            verifiedConnection: true, // This client has a verified connection
          });
          clients.value = updatedClients;

          // Also update connection state if needed
          const conn = connections.value.get(clientId);
          if (conn && !conn.connected) {
            const newConnections = new Map(connections.value);
            newConnections.set(clientId, {
              ...conn,
              connected: true,
            });
            connections.value = newConnections;
          }
        }

        // Update the client's latency display - not stale since we received a response
        updateClientLatency(clientId, latency, false);
        return;
      }

      // For regular messages, just update the lastSeen timestamp
      updateClientLastSeen(clientId);
    } catch (error) {
      console.error(`[CONTROLLER] Error handling message: ${error.message}`);

      // Even if error, maintain current latency but mark as stale
      const client = clients.value.get(clientId);
      const currentLatency = client?.latency || 100;
      updateClientLatency(clientId, currentLatency, true);
    }
  };

  // Helper function to update client latency
  const updateClientLatency = (
    clientId: string,
    latency: number,
    stale: boolean = false,
  ) => {
    // Create a new Map to maintain reactivity
    const newClients = new Map(clients.value);
    const client = newClients.get(clientId);

    if (client) {
      // Update existing client
      const updatedClient = {
        ...client,
        latency,
        staleLatency: stale,
        lastSeen: Date.now(),
      };

      // Set the updated client in the Map
      newClients.set(clientId, updatedClient);

      // Update the signal with the new Map
      clients.value = newClients;

      console.log(
        `[CONTROLLER] Updated ${clientId} with latency=${latency}ms (stale=${stale})`,
      );

      // Force a re-render by triggering another update after a tiny delay if needed
      // This ensures the UI always reflects the latest latency
      setTimeout(() => {
        const latestClient = clients.value.get(clientId);
        if (
          latestClient?.latency !== latency ||
          latestClient?.staleLatency !== stale
        ) {
          console.log(`[CONTROLLER] Forcing latency update for ${clientId}`);
          clients.value = new Map(clients.value);
        }
      }, 50);
    } else {
      // If client doesn't exist, create a new entry
      console.log(
        `[CONTROLLER] Adding new client ${clientId} with latency=${latency}ms (stale=${stale})`,
      );

      // Create the new client
      const newClient = {
        id: clientId,
        connected: connections.value.has(clientId) &&
            connections.value.get(clientId)?.connected || false,
        lastSeen: Date.now(),
        latency,
        staleLatency: stale,
        synthParams: { ...DEFAULT_SYNTH_PARAMS }, // Initialize with default synth parameters
      };

      // Add to Map and update state
      newClients.set(clientId, newClient);
      clients.value = newClients;
    }
  };

  // Helper function to update client lastSeen
  const updateClientLastSeen = (clientId: string) => {
    const client = clients.value.get(clientId);

    if (client) {
      // Create a new Map to maintain reactivity
      const newClients = new Map(clients.value);

      // Update the client with new lastSeen timestamp
      newClients.set(clientId, {
        ...client,
        lastSeen: Date.now(),
      });

      clients.value = newClients;
    }
  };

  // Connect to WebSocket for signaling only
  const connectWebSocket = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/signal`;
      addLog(`Attempting to connect to WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        socket.value = ws; // Assign to signal now that WebSocket is open
        addLog(`Signaling server connected (WebSocket opened to ${wsUrl}). Registering with ID: ${id.value || "undefined!"}`);
        try {
          if (typeof id.value !== "string" || id.value === "") {
            addLog(`[WARNING] Attempting to register with an invalid ID: '${id.value}' (type: ${typeof id.value})`);
            // Optionally, reject or throw an error if id.value is truly invalid
            // For now, we proceed, and the server-side check (if implemented) should catch it.
          }
          ws.send(JSON.stringify({
            type: "register",
            id: id.value,
          }));
          addLog(`Sent register message with ID: ${id.value}`);

          // Start heartbeat AFTER successful open and registration message sent
          if (heartbeatInterval.value === null) {
            addLog("Starting WebSocket heartbeat interval.");
            heartbeatInterval.value = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "heartbeat" }));
              } else {
                addLog("Heartbeat: WebSocket not open, skipping send.");
              }
            }, 30000) as unknown as number;
          }
          resolve(); // Resolve the promise here
        } catch (sendError) {
          console.error(`[Controller] Error sending register message to ${wsUrl}:`, sendError);
          addLog(`Error during registration send: ${(sendError as Error).message}`);
          reject(sendError);
        }
      };

      ws.onerror = (event) => {
        console.error("[Controller] WebSocket error event:", event);
        addLog(`WebSocket error. Check console for details.`);
        if (socket.value === ws) { // If this was the active socket
          socket.value = null;
        }
        // Clear heartbeat if it was running for this socket instance
        if (heartbeatInterval.value !== null) {
            clearInterval(heartbeatInterval.value);
            heartbeatInterval.value = null;
            addLog("Cleared heartbeat interval due to WebSocket error.");
        }
        reject(new Error("WebSocket connection error")); // Reject the promise for this connection attempt
      };

      ws.onclose = (event) => {
        addLog(`WebSocket disconnected. Code: ${event.code}, Reason: '${event.reason || "N/A"}', Clean: ${event.wasClean}`);
        if (socket.value === ws) { // If this was the active socket that closed
          socket.value = null;
        }
        if (heartbeatInterval.value !== null) {
          clearInterval(heartbeatInterval.value);
          heartbeatInterval.value = null;
          addLog("Cleared heartbeat interval due to WebSocket close.");
        }
        // Reconnection logic might be handled by initializeController's catch block or a dedicated manager
        // Original had: if (!socket.value) { setTimeout(connectWebSocket, 1000); }
        // This promise (for this specific connection attempt) should not re-resolve or re-reject on close
        // if it has already resolved (onopen) or rejected (onerror).
        // If the connection closes before 'onopen' or 'onerror', it might implicitly mean rejection.
        // Browsers often fire 'onerror' then 'onclose' for failed connections.
      };

      ws.onmessage = (event) => {
        try {
          const messageData = event.data;
          if (typeof messageData !== 'string') {
            console.warn("[Controller] Received non-string WebSocket message:", messageData);
            addLog("Received non-string WebSocket message.");
            return;
          }
          const message = JSON.parse(messageData);

          // Log raw message for debugging if needed
          // console.log("[Controller] Raw message received:", message);

          switch (message.type) {
            case "controller-kicked":
              addLog(`You have been kicked as controller. New controller: ${message.newControllerId}`);
              console.log(`Received controller-kicked message. New controller: ${message.newControllerId}`);
              handleControllerKicked(message.newControllerId);
              break;
            case "offer":
              addLog(`Received offer from client: ${message.source}`);
              if (!clients.value.has(message.source)) {
                addLog(`Adding new client ${message.source} from offer`);
                const newClient: SynthClient = {
                  id: message.source,
                  connected: false, // Will be true after successful WebRTC connection
                  lastSeen: Date.now(),
                  synthParams: { ...DEFAULT_SYNTH_PARAMS }, // Make sure DEFAULT_SYNTH_PARAMS is defined
                  // latency and other fields can be added as connection progresses
                };
                const updatedClients = new Map(clients.value);
                updatedClients.set(message.source, newClient);
                clients.value = updatedClients;
              }
              (async () => {
                try {
                  await handleClientOffer(message); // Ensure handleClientOffer is defined and robust
                } catch (offerError) {
                  console.error(`[Controller] Error handling offer from ${message.source}:`, offerError);
                  addLog(`Error handling offer from ${message.source}: ${(offerError as Error).message}`);
                }
              })();
              break;
            case "answer": // Assuming controller might receive answers if it initiates
              addLog(`Received answer from ${message.source}`);
              handleAnswerFromClient(message); // Implement this if needed
              break;
            case "ice-candidate":
              addLog(`Received ICE candidate from ${message.source}`);
              handleIceCandidateFromClient(message); // Implement this
              break;
            case "client-disconnected":
              addLog(`Client ${message.clientId} reported disconnection.`);
              // Handle client disconnection, e.g., update UI, clean up resources
              removeClient(message.clientId);
              break;
            case "error": // Error messages from the server
              console.error("[Controller] Received error message from server:", message.message, message.details || "");
              addLog(`Server error: ${message.message} ${message.details || ""}`);
              break;
            default:
              addLog(`Received unhandled WebSocket message type: ${message.type}`);
              console.log("[Controller] Received unhandled WebSocket message:", message);
          }
        } catch (err) {
          console.error("[Controller] Error processing WebSocket message:", err, "Raw data:", event.data);
          addLog(`Error processing message: ${(err as Error).message}. Data: ${event.data}`);
        }
      };
    }); // End of new Promise executor
  }; // End of connectWebSocket function



  // Handle pressing Enter in the message input
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && message.value.trim()) {
      sendMessage();
    }
  };

  // Add a new client ID manually
  const newClientId = useSignal("");

  // Initialize controller
  const initializeController = async () => {
    try {
      // Connect to WebSocket for signaling
      await connectWebSocket();

      // Register as active controller with the server
      const requestBody: { controllerClientId: string; userId?: string } = {
        controllerClientId: id.value,
      };

      // If in dev mode (identified by mock user id), add userId to body
      // The 'user' prop is available from the component's props { user, clientId }
      if (user && user.id === "dev-user-id") {
        requestBody.userId = "dev-user-id";
      }

      const response = await fetch("/api/controller/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      if (!result.success) {
        addLog(`Failed to register as active controller: ${result.error}`);
        return;
      }

      addLog(
        `Successfully registered as active controller with ID: ${id.value}`,
      );

      // Start connection verification
      startConnectionVerification();
      addLog("Started connection verification and latency measurement");

      // Set controller as active locally
      controlActive.value = true;
    } catch (error) {
      addLog(`Error initializing controller: ${error.message}`);
    }
  };

  // Add a client manually by ID
  const addClient = (clientId: string) => {
    if (!clientId.trim()) {
      addLog("Please enter a valid client ID");
      return;
    }

    // Check if client already exists
    if (clients.value.has(clientId)) {
      addLog(`Client ${clientId} already exists`);
      return;
    }

    // Create a new client entry
    const newClient: SynthClient = {
      id: clientId,
      connected: false,
      lastSeen: Date.now(),
      synthParams: { ...DEFAULT_SYNTH_PARAMS },
    };

    // Add to client map
    const updatedClients = new Map(clients.value);
    updatedClients.set(clientId, newClient);
    clients.value = updatedClients;

    addLog(`Added client ${clientId}`);
    newClientId.value = ""; // Clear input field
  };

  // Handle being kicked as controller - send handoff to all connected synth clients
  const handleControllerKicked = (newControllerId: string) => {
    addLog(
      `Handling controller kicked event - new controller: ${newControllerId}`,
    );

    // 1. Send handoff messages to all connected synth clients
    for (const [clientId, connection] of connections.value.entries()) {
      if (
        connection.connected && connection.dataChannel &&
        connection.dataChannel.readyState === "open"
      ) {
        try {
          // Send controller handoff message
          connection.dataChannel.send(JSON.stringify({
            type: "controller_handoff",
            newControllerId: newControllerId,
          }));

          addLog(`Sent handoff message to synth client ${clientId}`);
        } catch (error) {
          console.error(`Error sending handoff to ${clientId}:`, error);
        }
      }
    }

    // 2. Update UI to show we're no longer active
    controlActive.value = false;

    // 3. Deregister from server
    fetch("/api/controller/active", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        controllerClientId: id.value,
      }),
    }).catch((error) => {
      console.error("Error deregistering controller:", error);
    });

    // 4. Display message and redirect after a delay
    setTimeout(() => {
      // Redirect to controller page, which will show the "hold to kick" UI
      window.location.href = "/ctrl";
    }, 2000);
  };

  // Handle an offer from a client
  const handleClientOffer = async (message: any) => {
    const clientId = message.source;
    console.log(`[CONTROLLER] Handling offer from client ${clientId}`, message);

    // Get ICE servers from Twilio
    const iceServers = await fetchIceServers();
    console.log(
      "[CONTROLLER] Using ICE servers for incoming connection from",
      clientId,
      ":",
      iceServers,
    );

    // Create new RTCPeerConnection if it doesn't exist or reuse existing one
    let peerConnection: RTCPeerConnection;
    let dataChannel: RTCDataChannel | null = null;

    if (connections.value.has(clientId)) {
      // If we already have a connection object but it's not connected, close it and create a new one
      const existingConnection = connections.value.get(clientId);
      if (existingConnection && existingConnection.peerConnection) {
        if (existingConnection.connected) {
          console.log(
            `[CONTROLLER] Already connected to ${clientId}, ignoring offer`,
          );
          return;
        }

        // Close existing connection
        console.log(`[CONTROLLER] Closing existing connection to ${clientId}`);
        existingConnection.peerConnection.close();
      }
    }

    // Create new connection
    peerConnection = new RTCPeerConnection({
      iceServers,
    });

    // Store the connection in our map
    connections.value.set(clientId, {
      peerConnection,
      dataChannel,
      connected: false,
    });

    // Force the signal to update
    connections.value = new Map(connections.value);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket.value) {
        console.log(`[CONTROLLER] Sending ICE candidate to ${clientId}`);
        socket.value.send(JSON.stringify({
          type: "ice-candidate",
          target: clientId,
          data: event.candidate,
        }));
      }
    };

    // Handle data channel
    peerConnection.ondatachannel = (event) => {
      console.log(`[CONTROLLER] Received data channel from ${clientId}`);
      const receivedChannel = event.channel;

      // Update our connection object
      const connInfo = connections.value.get(clientId);
      if (connInfo) {
        connections.value.set(clientId, {
          ...connInfo,
          dataChannel: receivedChannel,
        });
        connections.value = new Map(connections.value);
      }

      receivedChannel.onopen = () => {
        console.log(`[CONTROLLER] Data channel opened with ${clientId}`);
        addLog(`Data channel opened with ${clientId}`);

        // Update connection status
        const connInfo = connections.value.get(clientId);
        if (connInfo) {
          connections.value.set(clientId, {
            ...connInfo,
            connected: true,
          });
          connections.value = new Map(connections.value);
        }

        // Update client status
        const client = clients.value.get(clientId);
        if (client) {
          const newClients = new Map(clients.value);
          newClients.set(clientId, {
            ...client,
            connected: true,
            lastSeen: Date.now(),
          });
          clients.value = newClients;
        }

        // Start sending pings to verify connection
        startPingClient(clientId);
      };

      receivedChannel.onclose = () => {
        console.log(`[CONTROLLER] Data channel closed with ${clientId}`);
        addLog(`Data channel closed with ${clientId}`);

        // Update connection status
        const connInfo = connections.value.get(clientId);
        if (connInfo) {
          connections.value.set(clientId, {
            ...connInfo,
            connected: false,
          });
          connections.value = new Map(connections.value);
        }

        // Update client status
        const client = clients.value.get(clientId);
        if (client) {
          const newClients = new Map(clients.value);
          newClients.set(clientId, {
            ...client,
            connected: false,
          });
          clients.value = newClients;
        }
      };

      receivedChannel.onmessage = (event) => {
        console.log(
          `[CONTROLLER] Received message from ${clientId}:`,
          event.data,
        );

        // Update last seen timestamp
        updateClientLastSeen(clientId);

        // Handle message
        handleClientMessage(event.data, clientId);
      };
    };

    // Set remote description from offer
    console.log(`[CONTROLLER] Setting remote description for ${clientId}`);
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message.data),
    );

    // Create and set local description (answer)
    console.log(`[CONTROLLER] Creating answer for ${clientId}`);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send answer to client
    if (socket.value) {
      console.log(`[CONTROLLER] Sending answer to ${clientId}`);
      socket.value.send(JSON.stringify({
        type: "answer",
        target: clientId,
        data: peerConnection.localDescription,
      }));
    } else {
      throw new Error("WebSocket not connected, cannot send answer");
    }

    console.log(`[CONTROLLER] Successfully handled offer from ${clientId}`);
    addLog(`Answered offer from ${clientId}`);
  };

  // Clean up controller resources
  const cleanupController = async () => {
    // Disconnect from all clients
    const clientIds = Array.from(connections.value.keys());
    for (const clientId of clientIds) {
      disconnect(clientId);
    }

    // Close WebSocket
    if (socket.value) {
      const oldSocket = socket.value;
      socket.value = null;

      // Clear heartbeat interval
      if (heartbeatInterval.value !== null) {
        clearInterval(heartbeatInterval.value);
        heartbeatInterval.value = null;
      }

      oldSocket.close(1000, "Controller deactivated");
    }

    controlActive.value = false;
    addLog("Controller deactivated");
  };

  const handleAnswerFromClient = async (message: { source: string; data: RTCSessionDescriptionInit }) => {
    const clientId = message.source;
    const answer = message.data;
    addLog(`Received answer from ${clientId}`);
    const connection = connections.value.get(clientId);

    if (connection && connection.peerConnection) {
      if (connection.peerConnection.signalingState === "have-local-offer" || connection.peerConnection.signalingState === "stable") {
        try {
          await connection.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          addLog(`Remote description (answer) set for ${clientId}`);
        } catch (error) {
          console.error(`[Controller] Error setting remote description for ${clientId}:`, error);
          addLog(`Error setting remote description for ${clientId}: ${(error as Error).message}`);
        }
      } else {
         console.warn(`[Controller] Received answer from ${clientId} but signaling state is ${connection.peerConnection.signalingState}. Ignoring answer.`);
         addLog(`[Warning] Ignored answer from ${clientId} due to unexpected signaling state: ${connection.peerConnection.signalingState}`);
      }
    } else {
      console.warn(`[Controller] Received answer from unknown or disconnected client ${clientId}`);
      addLog(`[Warning] Received answer from unknown/disconnected client ${clientId}`);
    }
  };

  const handleIceCandidateFromClient = async (message: { source: string; data: RTCIceCandidateInit }) => {
    const clientId = message.source;
    const candidate = message.data;
    addLog(`Received ICE candidate from ${clientId}`);
    const connection = connections.value.get(clientId);

    if (connection && connection.peerConnection) {
      try {
        // Ensure candidate is not null or empty string before adding
        if (candidate && (typeof candidate === 'object' || (typeof candidate === 'string' && candidate.length > 0))) {
           await connection.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
           addLog(`Added ICE candidate from ${clientId}`);
        } else {
           addLog(`Received null or empty ICE candidate from ${clientId}. Ignoring.`);
           console.warn(`[Controller] Received null or empty ICE candidate from ${clientId}`, candidate);
        }
      } catch (error) {
        // Ignore benign errors if candidate is already added or connection is closed
        if (connection.peerConnection.signalingState !== "closed") {
           console.error(`[Controller] Error adding ICE candidate from ${clientId}:`, error);
           addLog(`Error adding ICE candidate from ${clientId}: ${(error as Error).message}`);
        }
      }
    } else {
      console.warn(`[Controller] Received ICE candidate from unknown or disconnected client ${clientId}`);
      addLog(`[Warning] Received ICE candidate from unknown/disconnected client ${clientId}`);
    }
  };

  const removeClient = (clientId: string) => {
    addLog(`Client ${clientId} reported disconnected by server. Cleaning up.`);
    
    const connection = connections.value.get(clientId);
    if (connection) {
      if (connection.dataChannel && connection.dataChannel.readyState !== "closed") {
        connection.dataChannel.close();
      }
      if (connection.peerConnection && connection.peerConnection.signalingState !== "closed") {
        connection.peerConnection.close();
      }
      connections.value.delete(clientId);
      connections.value = new Map(connections.value); // Trigger update
    }

    const clientData = clients.value.get(clientId);
    if (clientData) {
      clients.value.delete(clientId);
      clients.value = new Map(clients.value); // Trigger update
    }
    
    addLog(`Cleaned up resources for disconnected client ${clientId}`);
    
     // Optionally, report updated connections to server, though server initiated this.
     // This might be redundant but ensures consistency if other controllers are present.
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const activeConnections = Array.from(connections.value.entries())
          .filter(([_, conn]) => conn.connected) // This might now be empty for the removed client
          .map(([id, _]) => id);
        socket.value.send(JSON.stringify({
          type: "controller-connections",
          connections: activeConnections,
        }));
      }
  };

  // Wake lock sentinel reference
  const wakeLock = useSignal<any>(null);

  // Initialize on component mount and clean up on unmount
  useEffect(() => {
    // Automatically initialize the controller
    initializeController();

    // Request wake lock to prevent screen from sleeping
    requestWakeLock().then((lock) => {
      wakeLock.value = lock;
    });

    // Setup wake lock event listeners for reacquisition
    const cleanup = setupWakeLockListeners(
      () => wakeLock.value,
      (lock) => wakeLock.value = lock,
    );

    // Return cleanup function
    return () => {
      // Deregister from server as active controller
      if (controlActive.value) {
        fetch("/api/controller/active", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            controllerClientId: id.value,
          }),
        }).catch((error) => {
          console.error("Error deregistering controller:", error);
        });
      }

      cleanupController();

      if (heartbeatInterval.value !== null) {
        clearInterval(heartbeatInterval.value);
      }

      // Release wake lock
      if (wakeLock.value) {
        wakeLock.value.release().catch((err) =>
          console.error("Error releasing wake lock", err)
        );
      }

      // Remove wake lock event listeners
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div class="container controller-panel">
      <h1>WebRTC Controller</h1>
      <p>Welcome, {user.name}</p>

      <div class="controller-active">
        <div class="controller-header">
          <div>
            <span class="controller-id">Controller ID: {id.value}</span>
            <span class="connection-status status-active">Ready</span>
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
            <a href="/ctrl/logout" class="logout-link">Logout</a>
          </div>
        </div>

        {/* Add client form */}
        <div class="add-client-form">
          <h3>Add Client by ID</h3>
          <div class="message-input">
            <input
              type="text"
              placeholder="Enter client ID to connect..."
              value={newClientId.value}
              onInput={(e) => newClientId.value = e.currentTarget.value}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newClientId.value.trim()) {
                  addClient(newClientId.value);
                }
              }}
            />
            <button
              onClick={() => addClient(newClientId.value)}
              disabled={!newClientId.value.trim()}
            >
              Add Client
            </button>
          </div>
        </div>

        <div class="client-list">
          <h3>Connected Clients ({clients.value.size})</h3>
          {clients.value.size === 0
            ? <p class="no-clients">No clients connected</p>
            : (
              <ul>
                {Array.from(clients.value.values()).map((client) => (
                  <li
                    key={client.id}
                  >
                    <div class="client-info">
                      <div class="client-id-container">
                        <span class="client-id">{client.id}</span>
                        <span
                          class="latency-indicator"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent selecting the client
                            console.log(
                              `Manual ping requested for ${client.id}`,
                            );
                            if (
                              connections.value.has(client.id) &&
                              connections.value.get(client.id)?.connected
                            ) {
                              // Always use the test message approach which sets a synthetic value
                              sendTestMessage(client.id);
                            }
                          }}
                          title="Click to measure latency"
                        >
                          {connections.value.has(client.id) &&
                              connections.value.get(client.id)?.connected
                            ? (client.latency === -1
                              ? (
                                <span className="latency-measuring">
                                  measuring...
                                </span>
                              )
                              : (
                                <span
                                  className={client.staleLatency
                                    ? "latency-stale"
                                    : ""}
                                >
                                  {client.latency || 0}ms
                                </span>
                              ))
                            : ""}
                        </span>

                        {/* Audio Status Indicator */}
                        {connections.value.has(client.id) &&
                          connections.value.get(client.id)?.connected && (
                          <>
                            <span
                              class={`audio-status-indicator ${
                                !client.isMuted
                                  ? "audio-enabled"
                                  : client.pendingNote
                                  ? "audio-pending-note"
                                  : "audio-disabled"
                              }`}
                              title={!client.isMuted
                                ? `Audio ${client.audioState || "enabled"}`
                                : client.pendingNote
                                ? "Audio muted (note pending)"
                                : "Audio muted"}
                            >
                              {!client.isMuted
                                ? (client.audioState === "running"
                                  ? "🔊"
                                  : "🔈")
                                : "🔇"}
                            </span>
                            <span
                              class="client-wake-lock-indicator"
                              title="Wake lock presumed active on client"
                            >
                              🔆
                            </span>
                          </>
                        )}
                      </div>
                      <span
                        class={`connection-status ${
                          connections.value.has(client.id) &&
                            connections.value.get(client.id)?.connected
                            ? client.verifiedConnection
                              ? "status-verified"
                              : "status-connected"
                            : "status-disconnected"
                        }`}
                        title="Connection verified through ping/pong"
                      >
                        {connections.value.has(client.id) &&
                            connections.value.get(client.id)?.connected
                          ? client.verifiedConnection ? "Verified" : "Connected"
                          : "Available"}
                      </span>

                      {/* Show synth controls for connected clients */}
                      {connections.value.has(client.id) &&
                        connections.value.get(client.id)?.connected &&
                        client.synthParams && (
                        <SynthControls
                          clientId={client.id}
                          params={client.synthParams}
                          onParamChange={(param, value) =>
                            updateSynthParam(client.id, param, value)}
                        />
                      )}
                    </div>

                    <div class="client-actions">
                      {!connections.value.has(client.id) ||
                          !connections.value.get(client.id)?.connected
                        ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Use async/await pattern to handle the promise
                              (async () => {
                                try {
                                  await connectToClient(client.id);
                                } catch (error) {
                                  console.error(
                                    `Error connecting to ${client.id}:`,
                                    error,
                                  );
                                }
                              })();
                            }}
                          >
                            Connect
                          </button>
                        )
                        : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              disconnect(client.id);
                            }}
                            class="disconnect-button"
                          >
                            Disconnect
                          </button>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div class="message-area">
          <div class="broadcast-info">
            <span>
              Message to: <strong>All connected clients</strong>
            </span>
          </div>
          <div class="message-input">
            <input
              type="text"
              placeholder="Send broadcast message to all clients..."
              value={message.value}
              onInput={(e) => message.value = e.currentTarget.value}
              onKeyDown={handleKeyDown}
              disabled={!connections.value.size}
            />
            <button
              onClick={sendMessage}
              disabled={!connections.value.size || !message.value.trim()}
            >
              Send
            </button>
          </div>
        </div>

        <div class="log">
          <h3>Controller Log</h3>
          <ul>
            {logs.value.map((log, index) => <li key={index}>{log}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
