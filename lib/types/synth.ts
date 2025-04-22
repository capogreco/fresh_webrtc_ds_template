/**
 * Legacy synth types - now imported from the centralized synth library
 */

// Import and re-export from the new synth library
export {
  AudioState,
  AudioStateMessage,
  OscillatorType,
  SynthMessage,
  SynthMessageType,
  SynthParamMessage,
  SynthParams,
} from "../synth/types.ts";

export { DEFAULT_SYNTH_PARAMS as defaultSynthParams } from "../synth/defaults.ts";
export { NOTE_FREQUENCIES as noteFrequencies } from "../synth/constants.ts";
