/**
 * Main entry point for the synthesizer module
 * Exports types and combined parameters
 */

// Export core types
export * from "./core/types.ts";

// Re-export all parameters and functions from component modules
export * from "./oscillator.ts";
export * from "./filter.ts";
export * from "./envelope.ts";
export * from "./vibrato.ts";
export * from "./portamento.ts";
export * from "./volume.ts";

// Import the SynthParams type
import { SynthParams } from "./core/types.ts";

// Import parameter descriptors from component modules
import {
  detuneParam,
  frequencyParam,
  oscillatorEnabledParam,
  waveformParam,
} from "./oscillator.ts";
import { filterCutoffParam, filterResonanceParam } from "./filter.ts";
import { attackParam, releaseParam } from "./envelope.ts";
import { vibratoRateParam, vibratoWidthParam } from "./vibrato.ts";
import { portamentoTimeParam } from "./portamento.ts";
import { volumeParam } from "./volume.ts";

/**
 * Default synthesizer parameters
 */
export const DEFAULT_SYNTH_PARAMS: SynthParams = {
  // Oscillator
  frequency: frequencyParam.defaultValue,
  waveform: waveformParam.defaultValue,
  oscillatorEnabled: oscillatorEnabledParam.defaultValue,
  detune: detuneParam.defaultValue,

  // Envelope
  attack: attackParam.defaultValue,
  release: releaseParam.defaultValue,

  // Filter
  filterCutoff: filterCutoffParam.defaultValue,
  filterResonance: filterResonanceParam.defaultValue,

  // Vibrato
  vibratoRate: vibratoRateParam.defaultValue,
  vibratoWidth: vibratoWidthParam.defaultValue,

  // Portamento
  portamentoTime: portamentoTimeParam.defaultValue,

  // Volume
  volume: volumeParam.defaultValue,
};

/**
 * Map of parameter names to their descriptors
 */
export const PARAM_DESCRIPTORS = {
  frequency: frequencyParam,
  waveform: waveformParam,
  oscillatorEnabled: oscillatorEnabledParam,
  detune: detuneParam,
  attack: attackParam,
  release: releaseParam,
  filterCutoff: filterCutoffParam,
  filterResonance: filterResonanceParam,
  vibratoRate: vibratoRateParam,
  vibratoWidth: vibratoWidthParam,
  portamentoTime: portamentoTimeParam,
  volume: volumeParam,
};

/**
 * Validates a partial set of parameters and returns a complete set with defaults
 */
export function validateSynthParams(
  partialParams: Partial<SynthParams>,
): SynthParams {
  const result = { ...DEFAULT_SYNTH_PARAMS };

  // Apply each provided parameter with validation
  for (const [key, value] of Object.entries(partialParams)) {
    const paramKey = key as keyof SynthParams;
    if (value !== undefined && PARAM_DESCRIPTORS[paramKey]) {
      const descriptor = PARAM_DESCRIPTORS[paramKey];
      // Type assertion is safe because we're using the correct descriptor for each parameter
      (result[paramKey] as unknown) = descriptor.validate(value);
    }
  }

  return result;
}
