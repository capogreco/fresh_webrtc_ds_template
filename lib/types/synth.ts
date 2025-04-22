/**
 * Legacy synth types - now imported from the centralized synth library
 */

// Import and re-export from the new synth library
export { 
  SynthParams,
  OscillatorType,
  AudioState,
  SynthMessage,
  SynthMessageType,
  SynthParamMessage,
  AudioStateMessage
} from "../synth/types.ts";

export { DEFAULT_SYNTH_PARAMS as defaultSynthParams } from "../synth/defaults.ts";
export { NOTE_FREQUENCIES as noteFrequencies } from "../synth/constants.ts";