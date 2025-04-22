/**
 * Oscillator parameters for the synthesizer
 * Contains parameters related to the primary tone generation: frequency, waveform, detune
 */

import {
  createBooleanParam,
  createEnumParam,
  createNumberParam,
} from "./core/params.ts";
import { OscillatorType } from "./core/types.ts";

// === Constants ===

/** Human hearing range - minimum frequency in Hz */
export const MIN_FREQUENCY = 20;

/** Human hearing range - maximum frequency in Hz */
export const MAX_FREQUENCY = 20000;

/** Concert pitch A4 in Hz */
export const CONCERT_A4 = 440;

/** Standard octave frequency ratio */
export const OCTAVE_RATIO = 2;

/** Semitone frequency ratio (12 equal temperament) */
export const SEMITONE_RATIO = Math.pow(OCTAVE_RATIO, 1 / 12);

/** Minimum detune in cents */
export const MIN_DETUNE = -100;

/** Maximum detune in cents */
export const MAX_DETUNE = 100;

/** Musical note frequency mapping (for conversion) */
export const NOTE_FREQUENCIES: Record<string, number> = {
  "A4": 440.00, // A4 (Concert A)
  "A#4": 466.16, // A#4/Bb4
  "B4": 493.88, // B4
  "C5": 523.25, // C5
  "C#5": 554.37, // C#5/Db5
  "D5": 587.33, // D5
  "D#5": 622.25, // D#5/Eb5
  "E5": 659.25, // E5
  "F5": 698.46, // F5
  "F#5": 739.99, // F#5/Gb5
  "G5": 783.99, // G5
  "G#5": 830.61, // G#5/Ab5
  "A5": 880.00, // A5
};

// === Parameter Descriptors ===

/** Frequency parameter descriptor */
export const frequencyParam = createNumberParam({
  name: "frequency",
  min: MIN_FREQUENCY,
  max: MAX_FREQUENCY,
  defaultValue: CONCERT_A4,
  format: (val) => `${val.toFixed(2)}Hz`,
});

/** Oscillator waveform parameter descriptor */
export const waveformParam = createEnumParam<OscillatorType>({
  name: "waveform",
  values: ["sine", "square", "sawtooth", "triangle"] as const,
  defaultValue: "sine",
  format: (val) => val.charAt(0).toUpperCase() + val.slice(1),
});

/** Oscillator enable/disable parameter descriptor */
export const oscillatorEnabledParam = createBooleanParam({
  name: "oscillatorEnabled",
  defaultValue: true,
  format: (val) => val ? "Enabled" : "Disabled",
});

/** Detune parameter descriptor */
export const detuneParam = createNumberParam({
  name: "detune",
  min: MIN_DETUNE,
  max: MAX_DETUNE,
  defaultValue: 0,
  format: (val) => val > 0 ? `+${val}¢` : `${val}¢`,
});

// === Helper Functions ===

/**
 * Convert a musical note name to frequency in Hz
 */
export function noteToFrequency(note: string): number {
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
 * Calculate frequency with applied detune
 */
export function getDetuned(frequency: number, detune: number): number {
  const ratio = Math.pow(SEMITONE_RATIO, detune / 100);
  return frequency * ratio;
}
