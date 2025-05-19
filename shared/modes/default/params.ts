import { SynthParamDescriptor } from "../../synthParams.ts";
import { ControllerMode } from "../../controllerModes.ts";

/**
 * Resolution mode for SIN strings
 * Controls how SIN rules are resolved
 */
export enum ResolutionMode {
  STATIC = "static", // Use same value until changed
  RANDOM = "random", // Pick new random value each time
  SHUFFLE = "shuffle", // Iterate through values in random order
  ASCEND = "ascend", // Iterate through values in ascending order
  DESCEND = "descend", // Iterate through values in descending order
}

// Static list of resolution modes for select dropdowns
export const RESOLUTION_MODES = [
  ResolutionMode.STATIC,
  ResolutionMode.RANDOM,
  ResolutionMode.SHUFFLE,
  ResolutionMode.ASCEND,
  ResolutionMode.DESCEND,
] as const;

/**
 * Default Mode - Parameters inspired by Ryoji Ikeda's aesthetic
 */

// --- Global Parameters ---
export const GLOBAL_PARAMS: SynthParamDescriptor[] = [
  {
    id: "defaultGlobalOnOff",
    label: "Master On/Off",
    type: "boolean",
    defaultValue: false,
    description: "Master play/stop for Default Mode rhythmic elements",
  },
  {
    id: "global_volume",
    label: "Global Volume",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.8,
    unit: "",
    description: "Master volume for all sounds",
  },
  {
    id: "global_tempo",
    label: "Global Tempo",
    type: "number",
    min: 10,
    max: 120,
    step: 1,
    defaultValue: 30,
    unit: "CPM",
    description: "Global tempo in cycles per minute",
  },
  {
    id: "global_sin_resolution",
    label: "SIN Resolution",
    type: "enum",
    enumValues: RESOLUTION_MODES,
    defaultValue: ResolutionMode.STATIC,
    description: "How SIN values are resolved globally",
  },
  {
    id: "global_harmonic_root",
    label: "Harmonic Root",
    type: "number",
    min: 20,
    max: 1000,
    step: 1,
    defaultValue: 55, // A1 frequency
    unit: "Hz",
    description: "Root frequency for harmonic ratio calculations",
  },
];

// --- Pink Noise Parameters ---
export const PINK_NOISE_PARAMS: SynthParamDescriptor[] = [
  {
    id: "noise_enabled",
    label: "Noise Enabled",
    type: "boolean",
    defaultValue: true,
    description: "Enable/disable the pink noise layer",
  },
  {
    id: "noise_volume",
    label: "Noise Volume",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.5,
    unit: "",
    description: "Volume of the pink noise layer",
  },
  {
    id: "noise_filter_cutoff",
    label: "Noise Filter Cutoff",
    type: "string", // SIN string type
    defaultValue: "1000, 4000, 8000",
    description: "Filter cutoff frequency range for noise (SIN format)",
  },
  {
    id: "noise_filter_cutoff_resolution",
    label: "Noise Filter Resolution",
    type: "enum",
    enumValues: RESOLUTION_MODES,
    defaultValue: ResolutionMode.RANDOM,
    description: "How filter cutoff SIN values are resolved",
  },
  {
    id: "noise_filter_q",
    label: "Noise Filter Q",
    type: "string", // SIN string type
    defaultValue: "0.5, 1, 2, 5, 10",
    description: "Filter resonance range for noise (SIN format)",
  },
  {
    id: "noise_filter_q_resolution",
    label: "Noise Filter Q Resolution",
    type: "enum",
    enumValues: RESOLUTION_MODES,
    defaultValue: ResolutionMode.RANDOM,
    description: "How filter Q SIN values are resolved",
  },
  {
    id: "noise_rhythm",
    label: "Noise Rhythm",
    type: "string", // SIN string format for Euclidean rhythm
    defaultValue: "3,8", // 3 hits distributed over 8 steps
    description: "Noise rhythmic pattern as pulses,steps (Euclidean)",
  },
];

// --- Sine Blips Parameters ---
export const SINE_BLIPS_PARAMS: SynthParamDescriptor[] = [
  {
    id: "blips_enabled",
    label: "Blips Enabled",
    type: "boolean",
    defaultValue: true,
    description: "Enable/disable the sine blips layer",
  },
  {
    id: "blips_volume",
    label: "Blips Volume",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.6,
    unit: "",
    description: "Volume of the sine blips layer",
  },
  {
    id: "blips_harmonic_ratio",
    label: "Harmonic Ratios",
    type: "string", // SIN string type
    defaultValue: "1:1, 3:2, 4:3, 5:4, 9:8, 16:15",
    description: "Harmonic ratios for blips, applied to root (SIN format)",
  },
  {
    id: "blips_harmonic_resolution",
    label: "Harmonic Resolution",
    type: "enum",
    enumValues: RESOLUTION_MODES,
    defaultValue: ResolutionMode.SHUFFLE,
    description: "How harmonic ratio SIN values are resolved",
  },
  {
    id: "blips_duration",
    label: "Blips Duration",
    type: "string", // SIN string type
    defaultValue: "50, 75, 100, 150",
    unit: "ms",
    description: "Duration range for blips in milliseconds (SIN format)",
  },
  {
    id: "blips_duration_resolution",
    label: "Duration Resolution",
    type: "enum",
    enumValues: RESOLUTION_MODES,
    defaultValue: ResolutionMode.RANDOM,
    description: "How duration SIN values are resolved",
  },
  {
    id: "blips_rhythm",
    label: "Blips Rhythm",
    type: "string", // SIN string format for Euclidean rhythm
    defaultValue: "5,16", // 5 hits distributed over 16 steps
    description: "Blips rhythmic pattern as pulses,steps (Euclidean)",
  },
];

// --- Clicks Parameters ---
export const CLICKS_PARAMS: SynthParamDescriptor[] = [
  {
    id: "clicks_enabled",
    label: "Clicks Enabled",
    type: "boolean",
    defaultValue: true,
    description: "Enable/disable the clicks layer",
  },
  {
    id: "clicks_volume",
    label: "Clicks Volume",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.7,
    unit: "",
    description: "Volume of the clicks layer",
  },
  {
    id: "clicks_frequency",
    label: "Clicks Frequency",
    type: "string", // SIN string type
    defaultValue: "4000, 6000, 8000, 10000",
    unit: "Hz",
    description: "Frequency range for clicks (SIN format)",
  },
  {
    id: "clicks_frequency_resolution",
    label: "Clicks Frequency Resolution",
    type: "enum",
    enumValues: RESOLUTION_MODES,
    defaultValue: ResolutionMode.RANDOM,
    description: "How frequency SIN values are resolved for clicks",
  },
  {
    id: "clicks_duration",
    label: "Clicks Duration",
    type: "string", // SIN string type
    defaultValue: "1, 2, 3, 5",
    unit: "ms",
    description: "Duration range for clicks in milliseconds (SIN format)",
  },
  {
    id: "clicks_duration_resolution",
    label: "Clicks Duration Resolution",
    type: "enum",
    enumValues: RESOLUTION_MODES,
    defaultValue: ResolutionMode.RANDOM,
    description: "How duration SIN values are resolved for clicks",
  },
  {
    id: "clicks_rhythm",
    label: "Clicks Rhythm",
    type: "string", // SIN string format for Euclidean rhythm
    defaultValue: "7,12", // 7 hits distributed over 12 steps
    description: "Clicks rhythmic pattern as pulses,steps (Euclidean)",
  },
];

// Combine all parameter groups for the DEFAULT mode
export const DEFAULT_MODE_PARAMS: SynthParamDescriptor[] = [
  ...GLOBAL_PARAMS,
  ...PINK_NOISE_PARAMS,
  ...SINE_BLIPS_PARAMS,
  ...CLICKS_PARAMS,
];

// Export the map of controller modes to their parameter descriptors
export const MODE_PARAMS_MAP: Record<ControllerMode, SynthParamDescriptor[]> = {
  [ControllerMode.DEFAULT]: DEFAULT_MODE_PARAMS,
  [ControllerMode.SYNTH]: [], // Will be populated with the standard synth parameters
  [ControllerMode.DRONE]: [], // Future implementation
  [ControllerMode.GRID]: [], // Future implementation
};

// Helper function to get parameters for a specific mode
export function getParamsForMode(mode: ControllerMode): SynthParamDescriptor[] {
  return MODE_PARAMS_MAP[mode] || [];
}
