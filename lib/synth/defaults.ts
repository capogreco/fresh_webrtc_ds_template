import { SynthParams } from "./types.ts";
import {
  CONCERT_A4,
  MAX_FILTER_CUTOFF,
  MIN_ATTACK,
  MIN_FILTER_RESONANCE,
  MIN_PORTAMENTO_TIME,
  MIN_VIBRATO_RATE,
  MIN_VIBRATO_WIDTH,
} from "./constants.ts";

/**
 * Default synthesizer parameters
 */
export const DEFAULT_SYNTH_PARAMS: SynthParams = {
  /** Oscillator enabled by default */
  oscillatorEnabled: true,

  /** Default waveform is sine wave (most pure tone) */
  waveform: "sine",

  /** Default frequency is A4 (440Hz, concert pitch) */
  frequency: CONCERT_A4,

  /** Default volume is 10% to avoid being too loud */
  volume: 0.1,

  /** Default detune is 0 cents (no detuning) */
  detune: 0,

  /** Default attack time (immediate attack) */
  attack: MIN_ATTACK,

  /** Default release time (short release) */
  release: 0.1,

  /** Default filter cutoff (fully open) */
  filterCutoff: MAX_FILTER_CUTOFF * 0.8, // 80% of max for a slightly mellower tone

  /** Default filter resonance (no resonance) */
  filterResonance: MIN_FILTER_RESONANCE,

  /** Default vibrato rate (no vibrato) */
  vibratoRate: MIN_VIBRATO_RATE,

  /** Default vibrato width (no vibrato) */
  vibratoWidth: MIN_VIBRATO_WIDTH,

  /** Default portamento time (no glide) */
  portamentoTime: MIN_PORTAMENTO_TIME,
};
