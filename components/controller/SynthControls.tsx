import { h } from "preact";
import { SynthParams } from "../../lib/synth/index.ts";
import { NOTE_FREQUENCIES, noteToFrequency } from "../../lib/synth/index.ts";

interface SynthControlsProps {
  clientId: string;
  params: SynthParams;
  onParamChange: (param: string, value: unknown) => void;
}

export function SynthControls(
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
              type="button"
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
              } as h.JSX.CSSProperties}
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
                  // 100px movement = full detune range (1200 cents)
                  const detuneChange = deltaY * 12;
                  const newDetune = Math.max(
                    -1200,
                    Math.min(1200, startDetune + detuneChange),
                  );
                  onParamChange("detune", newDetune);
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
                "--rotation": `${(params.detune / 1200) * 270}deg`,
              } as h.JSX.CSSProperties}
            />
            <div className="knob-value knob-value-compact">
              {params.detune > 0 ? "+" : ""}
              {Math.round(params.detune)} cents
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
