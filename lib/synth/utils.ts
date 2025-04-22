import { OscillatorType, SynthParams } from "./types.ts";
import {
  CONCERT_A4,
  MAX_ATTACK,
  MAX_DETUNE,
  MAX_FILTER_CUTOFF,
  MAX_FILTER_RESONANCE,
  MAX_FREQUENCY,
  MAX_PORTAMENTO_TIME,
  MAX_RELEASE,
  MAX_VIBRATO_RATE,
  MAX_VIBRATO_WIDTH,
  MAX_VOLUME,
  MIN_ATTACK,
  MIN_DETUNE,
  MIN_FILTER_CUTOFF,
  MIN_FILTER_RESONANCE,
  MIN_FREQUENCY,
  MIN_PORTAMENTO_TIME,
  MIN_RELEASE,
  MIN_VIBRATO_RATE,
  MIN_VIBRATO_WIDTH,
  MIN_VOLUME,
  NOTE_FREQUENCIES,
  SEMITONE_RATIO,
} from "./constants.ts";
import { DEFAULT_SYNTH_PARAMS } from "./defaults.ts";

/**
 * Parameter validation configuration
 */
interface RangeValidationConfig {
  paramName: string;
  min: number;
  max: number;
  defaultValue: number;
}

/**
 * Generic number validator function type
 */
type NumberValidator = (value: number | unknown) => number;

/**
 * Generic validator for numerical parameters with range constraints
 */
function validateRange(
  value: number | unknown,
  config: RangeValidationConfig,
): number {
  // Ensure value is a number
  if (typeof value !== "number" || isNaN(value)) {
    console.warn(`Invalid ${config.paramName} value: ${value}, using default`);
    return config.defaultValue;
  }

  // Clamp to acceptable range
  return Math.max(config.min, Math.min(config.max, value));
}

/**
 * Validate and clamp frequency to acceptable range
 */
export const validateFrequency: NumberValidator = (frequency) => {
  return validateRange(frequency, {
    paramName: "frequency",
    min: MIN_FREQUENCY,
    max: MAX_FREQUENCY,
    defaultValue: DEFAULT_SYNTH_PARAMS.frequency,
  });
};

/**
 * Validate and clamp volume to acceptable range
 */
export const validateVolume: NumberValidator = (volume) => {
  return validateRange(volume, {
    paramName: "volume",
    min: MIN_VOLUME,
    max: MAX_VOLUME,
    defaultValue: DEFAULT_SYNTH_PARAMS.volume,
  });
};

/**
 * Validate and clamp detune to acceptable range
 */
export const validateDetune: NumberValidator = (detune) => {
  return validateRange(detune, {
    paramName: "detune",
    min: MIN_DETUNE,
    max: MAX_DETUNE,
    defaultValue: DEFAULT_SYNTH_PARAMS.detune,
  });
};

/**
 * Validate oscillator type
 */
export function validateWaveform(waveform: string | unknown): OscillatorType {
  // Valid oscillator types
  const validTypes = ["sine", "square", "sawtooth", "triangle"];

  // Check if valid
  if (typeof waveform === "string" && validTypes.includes(waveform)) {
    return waveform as OscillatorType;
  }

  // Return default if invalid
  console.warn(`Invalid waveform: ${waveform}, using default`);
  return DEFAULT_SYNTH_PARAMS.waveform;
}

/**
 * Validate and clamp attack time
 */
export const validateAttack: NumberValidator = (attack) => {
  return validateRange(attack, {
    paramName: "attack",
    min: MIN_ATTACK,
    max: MAX_ATTACK,
    defaultValue: DEFAULT_SYNTH_PARAMS.attack,
  });
};

/**
 * Validate and clamp release time
 */
export const validateRelease: NumberValidator = (release) => {
  return validateRange(release, {
    paramName: "release",
    min: MIN_RELEASE,
    max: MAX_RELEASE,
    defaultValue: DEFAULT_SYNTH_PARAMS.release,
  });
};

/**
 * Validate and clamp filter cutoff
 */
export const validateFilterCutoff: NumberValidator = (cutoff) => {
  return validateRange(cutoff, {
    paramName: "filter cutoff",
    min: MIN_FILTER_CUTOFF,
    max: MAX_FILTER_CUTOFF,
    defaultValue: DEFAULT_SYNTH_PARAMS.filterCutoff,
  });
};

/**
 * Validate and clamp filter resonance
 */
export const validateFilterResonance: NumberValidator = (resonance) => {
  return validateRange(resonance, {
    paramName: "filter resonance",
    min: MIN_FILTER_RESONANCE,
    max: MAX_FILTER_RESONANCE,
    defaultValue: DEFAULT_SYNTH_PARAMS.filterResonance,
  });
};

/**
 * Validate and clamp vibrato rate
 */
export const validateVibratoRate: NumberValidator = (rate) => {
  return validateRange(rate, {
    paramName: "vibrato rate",
    min: MIN_VIBRATO_RATE,
    max: MAX_VIBRATO_RATE,
    defaultValue: DEFAULT_SYNTH_PARAMS.vibratoRate,
  });
};

/**
 * Validate and clamp vibrato width
 */
export const validateVibratoWidth: NumberValidator = (width) => {
  return validateRange(width, {
    paramName: "vibrato width",
    min: MIN_VIBRATO_WIDTH,
    max: MAX_VIBRATO_WIDTH,
    defaultValue: DEFAULT_SYNTH_PARAMS.vibratoWidth,
  });
};

/**
 * Validate and clamp portamento time
 */
export const validatePortamentoTime: NumberValidator = (time) => {
  return validateRange(time, {
    paramName: "portamento time",
    min: MIN_PORTAMENTO_TIME,
    max: MAX_PORTAMENTO_TIME,
    defaultValue: DEFAULT_SYNTH_PARAMS.portamentoTime,
  });
};

/**
 * Convert a musical note name to frequency in Hz
 */
export function noteToFrequency(note: string): number {
  // Check if note exists in our mapping
  if (note in NOTE_FREQUENCIES) {
    return NOTE_FREQUENCIES[note];
  }

  console.warn(`Unknown note: ${note}, using A4`);
  return CONCERT_A4;
}

/**
 * Find the closest note name for a given frequency
 */
export function frequencyToNote(frequency: number): string {
  // Find the note with the closest frequency
  let closestNote = "A4";
  let minDifference = Infinity;

  for (const [note, noteFreq] of Object.entries(NOTE_FREQUENCIES)) {
    const difference = Math.abs(frequency - noteFreq);
    if (difference < minDifference) {
      minDifference = difference;
      closestNote = note;
    }
  }

  return closestNote;
}

/**
 * Type for the validator map functions
 */
type ValidatorFn = (value: unknown) => unknown;

/**
 * Map of parameter keys to their validation functions
 */
const validatorMap: Record<keyof SynthParams, ValidatorFn> = {
  frequency: validateFrequency,
  volume: validateVolume,
  detune: validateDetune,
  waveform: validateWaveform,
  oscillatorEnabled: (value: unknown) => Boolean(value),
  attack: validateAttack,
  release: validateRelease,
  filterCutoff: validateFilterCutoff,
  filterResonance: validateFilterResonance,
  vibratoRate: validateVibratoRate,
  vibratoWidth: validateVibratoWidth,
  portamentoTime: validatePortamentoTime,
};

/**
 * Apply and validate all synth parameters at once
 */
export function validateSynthParams(params: Partial<SynthParams>): SynthParams {
  // Start with defaults
  const validParams = { ...DEFAULT_SYNTH_PARAMS };

  // Apply and validate each parameter if provided
  for (const [key, value] of Object.entries(params)) {
    const paramKey = key as keyof SynthParams;
    if (value !== undefined && validatorMap[paramKey]) {
      const validValue = validatorMap[paramKey](value);
      // This type assertion is safe because we're using the appropriate validators
      // mapped to their respective parameter types
      (validParams[paramKey] as unknown) = validValue;
    }
  }

  return validParams;
}

/**
 * Calculate frequency with applied detune
 */
export function getDetuned(frequency: number, detune: number): number {
  // Convert cents to ratio (100 cents = 1 semitone)
  const ratio = Math.pow(SEMITONE_RATIO, detune / 100);
  return frequency * ratio;
}
