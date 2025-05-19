/**
 * Types for Default Mode synth engine
 */

import type { ResolutionMode } from "./sin_resolver.ts";

/**
 * Noise types supported in Default Mode
 */
export type NoiseType = "white" | "pink" | "brown" | "blue" | "violet";

// Filter types removed for Ryoji Ikeda aesthetic

/**
 * Click types supported in Default Mode
 */
export type ClickType = "sine" | "burst" | "pulse" | "digital";

/**
 * Default Mode parameter group names
 */
export type DefaultModeGroup =
  | "basic" // Basic parameters
  | "noise" // Noise generator parameters (bottom layer)
  | "filter" // Filter parameters
  | "blips" // Blip generator parameters (middle layer - tonal pulses)
  | "clicks" // Click generator parameters (top layer - high frequency clicks)
  | "envelope" // Envelope parameters
  | "timing" // Timing parameters
  | "pattern" // Pattern parameters
  | "reverb"; // Reverb parameters

/**
 * Basic parameters for Default Mode
 */
export interface BasicParams {
  /** Overall volume level (0-1) */
  volume: number;

  /** Whether the engine is actively generating sound */
  active: boolean;

  /** CPM (cycles per minute) */
  tempo: number;

  /** Global SIN resolution mode */
  sinResolution: ResolutionMode;

  /** Harmonic root frequency in Hz */
  harmonicRoot: number;

  /** Volume check level for initial pink noise (0-1) */
  volumeCheckLevel: number;
}

/**
 * Noise generator parameters
 */
export interface NoiseParams {
  /** Type of noise to generate */
  type: NoiseType;

  /** Noise volume level (0-1) */
  level: number;

  /** Whether the noise is enabled */
  enabled: boolean;

  /** Amount of noise sent to reverb (0-1) */
  reverbSend: number;

  /** Numerator for noise LFO rate as a fraction of CPM (SIN string) */
  rateNumerator: string;

  /** How the rate numerator should be resolved */
  rateNumeratorMode: ResolutionMode;

  /** Denominator for noise LFO rate as a fraction of CPM (SIN string) */
  rateDenominator: string;

  /** How the rate denominator should be resolved */
  rateDenominatorMode: ResolutionMode;

  /** Density of noise (0-1), controls how often noise is triggered (legacy) */
  density: string;

  /** How the density parameter should be resolved (legacy) */
  densityMode: ResolutionMode;
}

// Filter section removed for Ryoji Ikeda aesthetic

/**
 * Blip generator parameters (mid-range tonal pulses)
 */
export interface BlipParams {
  /** Type of blip sound */
  type: ClickType;

  /** Duration of the blip in milliseconds */
  duration: number;

  /** Blip volume level (0-1) */
  level: number;

  /** Whether blips are enabled */
  enabled: boolean;

  /** Amount of blip signal sent to reverb (0-1) */
  reverbSend: number;

  /** Frequency of the blip in Hz when using sine type */
  frequency: string;

  /** How the frequency parameter should be resolved */
  frequencyMode: ResolutionMode;

  /** Pitch range for blips in semitones */
  pitchRange: string;

  /** How the pitch range parameter should be resolved */
  pitchRangeMode: ResolutionMode;
}

/**
 * Click generator parameters (high-frequency clicks)
 */
export interface ClickParams {
  /** Type of click sound (e.g., "digital") */
  type: string;

  /** Duration of the click in milliseconds (typically shorter than blips) */
  duration: number;

  /** Click volume level (0-1) */
  level: number;

  /** Whether clicks are enabled */
  enabled: boolean;

  /** Amount of click signal sent to reverb (0-1) */
  reverbSend: number;

  /** Base frequency for clicks in Hz (typically higher than blips) */
  frequency: number;
}

// Envelope section removed for Ryoji Ikeda aesthetic

/**
 * Timing parameters
 */
export interface TimingParams {
  /** Subdivision numerator SIN string (typically "1") */
  subdivisionNumerator: string;

  /** How the subdivision numerator should be resolved */
  subdivisionNumeratorMode: ResolutionMode;

  /** Subdivision denominator SIN string (e.g., "8 / 16" for choosing between 8 and 16) */
  subdivisionDenominator: string;

  /** How the subdivision denominator should be resolved */
  subdivisionDenominatorMode: ResolutionMode;
}

/**
 * Pattern parameters for rhythm generation
 */
export interface PatternParams {
  /** Number of steps in the pattern */
  steps: number;

  /** Number of pulses (active beats) in the pattern */
  pulses: string;

  /** How the pulses parameter should be resolved */
  pulsesMode: ResolutionMode;

  /** Pattern rotation amount */
  rotation: string;

  /** How the rotation parameter should be resolved */
  rotationMode: ResolutionMode;
}

/**
 * Reverb parameters
 */
export interface ReverbParams {
  /** Reverb wet/dry mix (0-1) */
  mix: number;

  /** Reverb decay time in seconds (0-20) */
  decay: number;

  /** Reverb pre-delay in milliseconds (0-500) */
  preDelay: number;

  /** Whether reverb is enabled */
  enabled: boolean;
}

/**
 * Complete Default Mode parameters
 */
export interface DefaultModeParams {
  basic: BasicParams;
  noise: NoiseParams;
  // Filter removed for Ryoji Ikeda aesthetic
  blips: BlipParams; // Mid-range tonal pulses (was clicks previously)
  clicks: ClickParams; // High-frequency click layer (new)
  // Envelope removed for Ryoji Ikeda aesthetic
  timing: TimingParams;
  pattern: PatternParams;
  reverb: ReverbParams;
}

/**
 * Message for updating Default Mode parameters
 */
export interface DefaultModeParamMessage {
  /** Message type */
  type: "default_mode_param";

  /** Parameter group to update */
  group: DefaultModeGroup;

  /** Parameter key within the group */
  param: string;

  /** New parameter value */
  value: string | number | boolean;
}

/**
 * Trigger types for Default Mode events
 */
export type TriggerType =
  | "tick" // Regular clock tick
  | "pulse" // Euclidean pattern pulse
  | "manual" // Manual trigger from UI
  | "random"; // Random/stochastic trigger
