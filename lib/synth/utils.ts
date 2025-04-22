import { SynthParams } from "./types.ts";
import { 
  MIN_FREQUENCY, 
  MAX_FREQUENCY,
  MIN_VOLUME,
  MAX_VOLUME,
  MIN_DETUNE,
  MAX_DETUNE,
  NOTE_FREQUENCIES,
  SEMITONE_RATIO,
  CONCERT_A4,
  MIN_ATTACK,
  MAX_ATTACK,
  MIN_RELEASE,
  MAX_RELEASE,
  MIN_FILTER_CUTOFF,
  MAX_FILTER_CUTOFF,
  MIN_FILTER_RESONANCE,
  MAX_FILTER_RESONANCE,
  MIN_VIBRATO_RATE,
  MAX_VIBRATO_RATE,
  MIN_VIBRATO_WIDTH,
  MAX_VIBRATO_WIDTH,
  MIN_PORTAMENTO_TIME,
  MAX_PORTAMENTO_TIME
} from "./constants.ts";
import { DEFAULT_SYNTH_PARAMS } from "./defaults.ts";

/**
 * Validate and clamp frequency to acceptable range
 */
export function validateFrequency(frequency: number): number {
  // Ensure frequency is a number
  if (typeof frequency !== 'number' || isNaN(frequency)) {
    console.warn(`Invalid frequency value: ${frequency}, using default`);
    return DEFAULT_SYNTH_PARAMS.frequency;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_FREQUENCY, Math.min(MAX_FREQUENCY, frequency));
}

/**
 * Validate and clamp volume to acceptable range
 */
export function validateVolume(volume: number): number {
  // Ensure volume is a number
  if (typeof volume !== 'number' || isNaN(volume)) {
    console.warn(`Invalid volume value: ${volume}, using default`);
    return DEFAULT_SYNTH_PARAMS.volume;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, volume));
}

/**
 * Validate and clamp detune to acceptable range
 */
export function validateDetune(detune: number): number {
  // Ensure detune is a number
  if (typeof detune !== 'number' || isNaN(detune)) {
    console.warn(`Invalid detune value: ${detune}, using default`);
    return DEFAULT_SYNTH_PARAMS.detune;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_DETUNE, Math.min(MAX_DETUNE, detune));
}

/**
 * Validate oscillator type
 */
export function validateWaveform(waveform: any): OscillatorType {
  // Valid oscillator types
  const validTypes = ["sine", "square", "sawtooth", "triangle"];
  
  // Check if valid
  if (typeof waveform === 'string' && validTypes.includes(waveform)) {
    return waveform as OscillatorType;
  }
  
  // Return default if invalid
  console.warn(`Invalid waveform: ${waveform}, using default`);
  return DEFAULT_SYNTH_PARAMS.waveform;
}

/**
 * Validate and clamp attack time
 */
export function validateAttack(attack: number): number {
  // Ensure attack is a number
  if (typeof attack !== 'number' || isNaN(attack)) {
    console.warn(`Invalid attack value: ${attack}, using default`);
    return DEFAULT_SYNTH_PARAMS.attack;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_ATTACK, Math.min(MAX_ATTACK, attack));
}

/**
 * Validate and clamp release time
 */
export function validateRelease(release: number): number {
  // Ensure release is a number
  if (typeof release !== 'number' || isNaN(release)) {
    console.warn(`Invalid release value: ${release}, using default`);
    return DEFAULT_SYNTH_PARAMS.release;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_RELEASE, Math.min(MAX_RELEASE, release));
}

/**
 * Validate and clamp filter cutoff
 */
export function validateFilterCutoff(cutoff: number): number {
  // Ensure cutoff is a number
  if (typeof cutoff !== 'number' || isNaN(cutoff)) {
    console.warn(`Invalid filter cutoff value: ${cutoff}, using default`);
    return DEFAULT_SYNTH_PARAMS.filterCutoff;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_FILTER_CUTOFF, Math.min(MAX_FILTER_CUTOFF, cutoff));
}

/**
 * Validate and clamp filter resonance
 */
export function validateFilterResonance(resonance: number): number {
  // Ensure resonance is a number
  if (typeof resonance !== 'number' || isNaN(resonance)) {
    console.warn(`Invalid filter resonance value: ${resonance}, using default`);
    return DEFAULT_SYNTH_PARAMS.filterResonance;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_FILTER_RESONANCE, Math.min(MAX_FILTER_RESONANCE, resonance));
}

/**
 * Validate and clamp vibrato rate
 */
export function validateVibratoRate(rate: number): number {
  // Ensure rate is a number
  if (typeof rate !== 'number' || isNaN(rate)) {
    console.warn(`Invalid vibrato rate value: ${rate}, using default`);
    return DEFAULT_SYNTH_PARAMS.vibratoRate;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_VIBRATO_RATE, Math.min(MAX_VIBRATO_RATE, rate));
}

/**
 * Validate and clamp vibrato width
 */
export function validateVibratoWidth(width: number): number {
  // Ensure width is a number
  if (typeof width !== 'number' || isNaN(width)) {
    console.warn(`Invalid vibrato width value: ${width}, using default`);
    return DEFAULT_SYNTH_PARAMS.vibratoWidth;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_VIBRATO_WIDTH, Math.min(MAX_VIBRATO_WIDTH, width));
}

/**
 * Validate and clamp portamento time
 */
export function validatePortamentoTime(time: number): number {
  // Ensure time is a number
  if (typeof time !== 'number' || isNaN(time)) {
    console.warn(`Invalid portamento time value: ${time}, using default`);
    return DEFAULT_SYNTH_PARAMS.portamentoTime;
  }
  
  // Clamp to acceptable range
  return Math.max(MIN_PORTAMENTO_TIME, Math.min(MAX_PORTAMENTO_TIME, time));
}

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
 * Apply and validate all synth parameters at once
 */
export function validateSynthParams(params: Partial<SynthParams>): SynthParams {
  // Start with defaults
  const validParams = { ...DEFAULT_SYNTH_PARAMS };
  
  // Apply and validate each parameter if provided
  if (params.frequency !== undefined) {
    validParams.frequency = validateFrequency(params.frequency);
  }
  
  if (params.volume !== undefined) {
    validParams.volume = validateVolume(params.volume);
  }
  
  if (params.detune !== undefined) {
    validParams.detune = validateDetune(params.detune);
  }
  
  if (params.waveform !== undefined) {
    validParams.waveform = validateWaveform(params.waveform);
  }
  
  if (params.oscillatorEnabled !== undefined) {
    validParams.oscillatorEnabled = Boolean(params.oscillatorEnabled);
  }
  
  // New parameters
  if (params.attack !== undefined) {
    validParams.attack = validateAttack(params.attack);
  }
  
  if (params.release !== undefined) {
    validParams.release = validateRelease(params.release);
  }
  
  if (params.filterCutoff !== undefined) {
    validParams.filterCutoff = validateFilterCutoff(params.filterCutoff);
  }
  
  if (params.filterResonance !== undefined) {
    validParams.filterResonance = validateFilterResonance(params.filterResonance);
  }
  
  if (params.vibratoRate !== undefined) {
    validParams.vibratoRate = validateVibratoRate(params.vibratoRate);
  }
  
  if (params.vibratoWidth !== undefined) {
    validParams.vibratoWidth = validateVibratoWidth(params.vibratoWidth);
  }
  
  if (params.portamentoTime !== undefined) {
    validParams.portamentoTime = validatePortamentoTime(params.portamentoTime);
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