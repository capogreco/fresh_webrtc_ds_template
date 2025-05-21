import { ControllerMode, KNOWN_CONTROLLER_MODES } from "../controllerModes.ts";
import { type SynthParamDescriptor } from "../synthParams.ts"; // Path to global descriptor type
import { IKEDA_MODE_MVP_PARAMS } from "./ikeda/params.ts";
// Import SYNTH_PARAMS for SYNTH_MODE
import { SYNTH_PARAMS } from "../synthParams.ts";

// Default Mode is no longer a separate thing, system defaults to IKEDA mode

export const MODE_PARAMS_MAP: Record<
  ControllerMode,
  readonly SynthParamDescriptor[]
> = {
  [KNOWN_CONTROLLER_MODES.IKEDA]: IKEDA_MODE_MVP_PARAMS,
  // Remove references to DEFAULT mode as it's no longer separate
  // Placeholders for future modes
  [KNOWN_CONTROLLER_MODES.DRONE]: [], // Placeholder
  [KNOWN_CONTROLLER_MODES.GRID]: [], // Placeholder
  [KNOWN_CONTROLLER_MODES.SYNTH_MODE]: SYNTH_PARAMS, // SYNTH_MODE uses standard SYNTH_PARAMS
};

// Set the active mode to IKEDA
export const active = "IKEDA";

// Centralized exports
export { IKEDA_MODE_MVP_PARAMS } from "./ikeda/params.ts";
// No need to export MODE_PARAMS_MAP explicitly as it's already exported by the declaration above
