import { h } from "preact";
import {
  SYNTH_PARAMS,
  type SynthParamDescriptor,
} from "../../shared/synthParams.ts";

interface SynthControlsProps {
  // Changed clientId to idPrefix and made it optional
  idPrefix?: string; // Used to make HTML element IDs unique
  // Holds current values like { frequency: 440, volume: 0.7 }
  // These values are typically sourced from client.synthParams
  params: Record<string, unknown>;
  onParamChange: (paramId: string, value: unknown) => void;
  // New prop to accept custom parameter descriptors for different modes
  paramDescriptors?: SynthParamDescriptor[];
}

export function SynthControls(
  { idPrefix, params, onParamChange, paramDescriptors = [...SYNTH_PARAMS] }:
    SynthControlsProps,
) {
  // Check if a parameter is a SIN format string
  const isSINString = (value: unknown): boolean => {
    if (typeof value !== "string") return false;
    // Simple check - SIN strings contain commas or colons (harmonic ratios)
    return value.includes(",") || value.includes(":");
  };

  // Check if we're using Default Mode parameters that have a global toggle
  const hasDefaultModeGlobalToggle = paramDescriptors.some((p) =>
    p.id === "defaultGlobalOnOff"
  );

  return (
    <div className="client-synth-controls">
      <div className="synth-controls-compact">
        {/* Note On/Off Controls - only show for standard synth parameters */}
        {!hasDefaultModeGlobalToggle && paramDescriptors === SYNTH_PARAMS && (
          <div className="control-group-compact">
            <label>Note On</label>
            <div className="power-controls">
              {/* Checkbox */}
              <input
                id={`note-${idPrefix || "global"}`}
                type="checkbox"
                className="power-checkbox"
                checked={Boolean(params["oscillatorEnabled"])}
                onChange={(e) => {
                  console.log(
                    `[CONTROLLER] Note checkbox changed to ${e.currentTarget.checked}`,
                  );
                  if (e.currentTarget.checked) {
                    // Note On with current frequency
                    onParamChange("note_on", params["frequency"] ?? 440);
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
                  params["oscillatorEnabled"] ? "power-on" : "power-off"
                }`}
                onClick={() => {
                  console.log(
                    `[CONTROLLER] Note button clicked, current state: ${
                      params["oscillatorEnabled"]
                    }, new state: ${!params["oscillatorEnabled"]}`,
                  );
                  if (!params["oscillatorEnabled"]) {
                    // Note On with current frequency
                    onParamChange("note_on", params["frequency"] ?? 440);
                  } else {
                    // Note Off
                    onParamChange("note_off", null);
                  }
                }}
              >
                {params["oscillatorEnabled"] ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        )}

        {/* Dynamically generated controls */}
        {paramDescriptors.filter((descriptor) =>
          descriptor.id !== "oscillatorEnabled" && // Already handled by Note On/Off
          descriptor.id !== "ikedaVolumeCheckLevel" // Exclude volume check level as it's not a user-adjustable UI element
          // Add other parameters to exclude from generic rendering if they have custom UI
        ).map((descriptor: SynthParamDescriptor) => {
          const currentValue = params[descriptor.id] ?? descriptor.defaultValue;
          // Generate a unique ID using idPrefix
          const controlId = `${idPrefix ? idPrefix + "_" : ""}${descriptor.id}`;

          return (
            <div key={descriptor.id} className="control-group-compact">
              <label htmlFor={controlId} title={descriptor.description}>
                {descriptor.label}
                {descriptor.unit && descriptor.type !== "number"
                  ? ` (${descriptor.unit})`
                  : ""}
              </label>
              {descriptor.type === "number" && (
                <div class="control-row">
                  <input
                    type="range"
                    id={controlId}
                    min={descriptor.min}
                    max={descriptor.max}
                    step={descriptor.step}
                    value={String(currentValue)}
                    class="param-slider"
                    onInput={(e) =>
                      onParamChange(
                        descriptor.id,
                        parseFloat(e.currentTarget.value),
                      )}
                  />
                  <span class="param-value">
                    {parseFloat(String(currentValue)).toFixed(
                      // Determine precision based on step or if it's volume
                      descriptor.id === "volume"
                        ? 2
                        : (descriptor.step ?? 1) < 1
                        ? (descriptor.step === 0.001 ? 3 : 2)
                        : 0,
                    )}
                    {descriptor.unit
                      ? `${
                        descriptor.unit === "%" ? "" : " "
                      }${descriptor.unit}`
                      : ""}
                  </span>
                </div>
              )}
              {descriptor.type === "enum" && descriptor.enumValues && (
                <select
                  id={controlId}
                  class="waveform-select waveform-select-compact" /* Re-use existing class */
                  value={String(currentValue)}
                  onChange={(e) =>
                    onParamChange(descriptor.id, e.currentTarget.value)}
                >
                  {descriptor.enumValues.map((val) => (
                    <option key={val} value={val}>
                      {val.charAt(0).toUpperCase() + val.slice(1)}
                    </option>
                  ))}
                </select>
              )}
              {descriptor.type === "boolean" && (
                <input
                  type="checkbox"
                  id={controlId}
                  class="param-checkbox"
                  checked={Boolean(currentValue)}
                  onChange={(e) =>
                    onParamChange(descriptor.id, e.currentTarget.checked)}
                />
              )}
              {descriptor.type === "string" && (
                <div class="control-row">
                  <input
                    type="text"
                    id={controlId}
                    class="param-text-input"
                    value={String(currentValue)}
                    placeholder={String(descriptor.defaultValue)}
                    onChange={(e) =>
                      onParamChange(descriptor.id, e.currentTarget.value)}
                  />
                  {isSINString(currentValue) && (
                    <span
                      class="param-info sin-indicator"
                      title="Stochastic Integer Notation"
                    >
                      SIN
                    </span>
                  )}
                </div>
              )}
              {/* 'note' type might need custom handling if we re-introduce specialized UI */}
            </div>
          );
        })}
      </div>
    </div>
  );
}
