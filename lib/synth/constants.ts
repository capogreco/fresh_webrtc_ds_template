/**
 * Physical constants and ranges for the synthesizer
 */

// Oscillator Frequency
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

// Volume
/** Minimum volume (silent) */
export const MIN_VOLUME = 0;

/** Maximum volume (full) */
export const MAX_VOLUME = 1;

// Detune
/** Minimum detune in cents */
export const MIN_DETUNE = -100;

/** Maximum detune in cents */
export const MAX_DETUNE = 100;

// Envelope
/** Minimum attack time in seconds */
export const MIN_ATTACK = 0.001; // Very small but not zero to avoid clicks

/** Maximum attack time in seconds */
export const MAX_ATTACK = 5;

/** Minimum release time in seconds */
export const MIN_RELEASE = 0.001; // Very small but not zero to avoid clicks

/** Maximum release time in seconds */
export const MAX_RELEASE = 10;

// Filter
/** Minimum filter cutoff frequency in Hz */
export const MIN_FILTER_CUTOFF = 20;

/** Maximum filter cutoff frequency in Hz */
export const MAX_FILTER_CUTOFF = 20000;

/** Minimum filter resonance (Q) */
export const MIN_FILTER_RESONANCE = 0;

/** Maximum filter resonance (Q) */
export const MAX_FILTER_RESONANCE = 30;

// Vibrato
/** Minimum vibrato rate in Hz */
export const MIN_VIBRATO_RATE = 0;

/** Maximum vibrato rate in Hz */
export const MAX_VIBRATO_RATE = 20;

/** Minimum vibrato width in cents */
export const MIN_VIBRATO_WIDTH = 0;

/** Maximum vibrato width in cents */
export const MAX_VIBRATO_WIDTH = 100;

// Portamento
/** Minimum portamento time in seconds */
export const MIN_PORTAMENTO_TIME = 0;

/** Maximum portamento time in seconds */
export const MAX_PORTAMENTO_TIME = 5;

/** Standard WebAudio sample rate */
export const SAMPLE_RATE = 44100;

/** Musical note frequency mapping (for conversion)
 * This is used for translation between the music-based and physics-based models
 * but our primary interface is the physics-based frequency.
 */
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
