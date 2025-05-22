// fresh_webrtc_ds_template/hooks/types.ts

import type { Signal } from "@preact/signals";

/**
 * Defines the controls and state signals expected from the AudioEngine.
 * This interface dictates how hooks like useDataChannelMessageHandler
 * interact with the audio processing core.
 */
export interface AudioEngineControls {
  // Instrument Activation & Parameter Handling
  activateInstrument: (instrumentId: string, initialParams?: Record<string, any>) => void;
  updateSynthParam: (paramId: string, value: any, applyTiming: "immediate" | "next_phasor_reset") => void;
  applyQueuedParamsNow: () => void; // Called after phasor sync to apply queued param changes

  // Transport and Timing Control
  playPhasor: () => void;
  stopPhasor: () => void;
  setTempo: (cpm: number) => void;
  synchronisePhasor: () => void;

  // Discrete Note Handling (behavior is instrument-dependent)
  handleExternalNoteOn: (data: { target_synth_id?: string; note_id?: string; pitch: number; velocity?: number }) => void;
  handleExternalNoteOff: (data: { target_synth_id?: string; note_id?: string; pitch?: number }) => void;

  // State Management (Local Banks on Synth Client)
  saveStateToBank: (bankIndex: number) => { success: boolean; instrumentId?: string };
  loadStateFromBank: (bankIndex: number) => { success: boolean; instrumentId?: string; error?: string };

  // Instrument-Specific Commands
  executeInstrumentCommand: (name: string, args?: any) => void;

  // Global Behavior Modifiers
  setParameterPortamento: (durationMs: number, curve?: string) => void;

  // State Signals (primarily for constructing current_resolved_state_report)
  activeInstrumentIdSignal: Signal<string | null>;
  isPlayingSignal: Signal<boolean>;
  isGloballyMutedSignal: Signal<boolean>;
  audioContextStateSignal: Signal<"running" | "suspended" | "closed" | "interrupted">;

  // Method to get current state for reporting
  getCurrentResolvedState: () => {
    params: Record<string, any>;
    globalSettings: Record<string, any>;
    dynamicInternalState?: Record<string, any>;
  };
}

/**
 * Type definition for the logging function passed into various hooks.
 */
export type LoggerFn = (text: string) => void;

// Add other hook-related shared types here in the future if needed.

/**
 * Extended interface for useAudioEngine return type that includes UI-specific methods
 * This extends AudioEngineControls with additional methods needed by UI components
 */
export interface UseAudioEngineReturn extends AudioEngineControls {
  // Methods not part of the core AudioEngineControls interface but needed by UI
  initializeAudio: () => Promise<void>;
}