/**
 * Core type definitions for the synthesizer
 */

/**
 * Oscillator types supported by the Web Audio API
 */
export type OscillatorType = "sine" | "square" | "sawtooth" | "triangle";

/**
 * Complete synthesizer parameters interface
 */
export interface SynthParams {
  /** Whether the oscillator is enabled */
  oscillatorEnabled: boolean;

  /** Type of waveform to generate */
  waveform: OscillatorType;

  /** Frequency in Hz (20-20000Hz is human hearing range) */
  frequency: number;

  /** Volume level (0-1) */
  volume: number;

  /** Detune value in cents (-100 to 100, represents -1 to +1 semitones) */
  detune: number;

  /** Attack time in seconds (0-5) - time for sound to reach full volume */
  attack: number;

  /** Release time in seconds (0-10) - time for sound to fade after note off */
  release: number;

  /** Filter cutoff frequency in Hz (20-20000) */
  filterCutoff: number;

  /** Filter resonance (0-30) */
  filterResonance: number;

  /** Vibrato rate in Hz (0-20) */
  vibratoRate: number;

  /** Vibrato width in cents (0-100) */
  vibratoWidth: number;

  /** Portamento (glide) time in seconds (0-5) */
  portamentoTime: number;
}

/**
 * Audio state information
 */
export interface AudioState {
  /** Whether audio is muted */
  isMuted: boolean;

  /** Web Audio API context state (running, suspended, closed) */
  contextState: string;
}

/**
 * Message types for synthesizer communication
 */
export type SynthMessageType =
  | "synth_param" // Parameter update message
  | "audio_state" // Audio state update message
  | "ping" // Connection verification
  | "pong"; // Connection verification response

/**
 * Message for updating a synth parameter
 */
export interface SynthParamMessage {
  type: "synth_param";
  param: keyof SynthParams;
  value: string | number | boolean;
}

/**
 * Message for updating audio state
 */
export interface AudioStateMessage {
  type: "audio_state";
  isMuted: boolean;
  audioState: string;
}

/**
 * Union type of all possible synth messages
 */
export type SynthMessage =
  | SynthParamMessage
  | AudioStateMessage;
