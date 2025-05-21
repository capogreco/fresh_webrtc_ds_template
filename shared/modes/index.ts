import { ControllerMode, KNOWN_CONTROLLER_MODES } from "../controllerModes.ts";
import { type SynthParamDescriptor } from "../synthParams.ts"; // Path to global descriptor type
import { IKEDA_MODE_MVP_PARAMS } from "./ikeda/params.ts";
// Import SYNTH_PARAMS for SYNTH_MODE
import { SYNTH_PARAMS } from "../synthParams.ts";
// Import the DEFAULT_MODE_PARAMS (but not the MODE_PARAMS_MAP) from default/params
import {
  DEFAULT_MODE_PARAMS,
  RESOLUTION_MODES,
  ResolutionMode,
} from "./default/params.ts";

export const MODE_PARAMS_MAP: Record<
  ControllerMode,
  readonly SynthParamDescriptor[]
> = {
  [KNOWN_CONTROLLER_MODES.IKEDA]: IKEDA_MODE_MVP_PARAMS,
  [KNOWN_CONTROLLER_MODES.DEFAULT]: IKEDA_MODE_MVP_PARAMS, // DEFAULT now points to Ikeda MVP params
  [KNOWN_CONTROLLER_MODES.DRONE]: [], // Placeholder
  [KNOWN_CONTROLLER_MODES.GRID]: [], // Placeholder
  [KNOWN_CONTROLLER_MODES.SYNTH_MODE]: SYNTH_PARAMS, // SYNTH_MODE uses standard SYNTH_PARAMS
};

// Centralized exports
// Only re-export selected items from default/params to avoid conflicts
export { DEFAULT_MODE_PARAMS, RESOLUTION_MODES, ResolutionMode };
export { IKEDA_MODE_MVP_PARAMS } from "./ikeda/params.ts";
// No need to export MODE_PARAMS_MAP explicitly as it's already exported by the declaration above
