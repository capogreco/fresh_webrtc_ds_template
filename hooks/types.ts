// hooks/types.ts
import { Signal } from "@preact/signals";
import type { IkedaSynthState } from "../types/instruments/ikeda_synth_types.ts";

/**
 * Logger function type used in hooks for consistent logging
 */
export type LoggerFn = (message: string, level?: "info" | "warn" | "error") => void;

/**
 * Interface defining the minimal requirements for the AudioEngine used in hook returns
 */
export interface AudioEngineControls {
  // Basic audio context information
  audioContextSignal: Signal<AudioContext | null>;
  audioContextStateSignal: Signal<"running" | "suspended" | "closed" | "interrupted" | null>;
  isGloballyMutedSignal: Signal<boolean>;
  
  // Instrument status
  activeInstrumentIdSignal: Signal<string | null>;
  isProgramRunningSignal: Signal<boolean>;
  isPlayingSignal: Signal<boolean>;
  
  // Audio visualization data
  fftData: Signal<Uint8Array | null>;
  
  // Volume check state
  isVolumeCheckActiveSignal: Signal<boolean>;
  isVolumeCheckCompletedSignal: Signal<boolean>;
  
  // Ikeda synth specific state
  ikedaSynthStateSignal: Signal<IkedaSynthState | null>;
}

/**
 * Interface for the return value of useAudioEngine hook
 */
export interface UseAudioEngineReturn extends AudioEngineControls {
  // Audio initialization
  initializeAudio: () => Promise<void>;
  resumeAudio: () => Promise<void>;
  suspendAudio: () => Promise<void>;
  
  // Volume check
  confirmVolumeSetAndPrepare: () => void;
  
  // Instrument activation
  activateInstrument: (instrumentId: string, initialParams?: Record<string, any>) => void;
  
  // Parameter updates
  updateSynthParam: (
    param: string,
    value: any,
    applyTiming?: "immediate" | "next_phasor_reset"
  ) => void;
  
  // Ikeda-specific parameter update with dot notation support
  updateIkedaParameter: (paramPath: string, value: any, applyTiming?: "immediate" | "next_phasor_reset") => void;
  
  // Program control
  playPhasor: () => void;
  stopPhasor: () => void;
  synchronisePhasor: () => void;
  applyQueuedParamsNow: () => void;
  
  // Tempo control
  setTempo: (cpm: number) => void;
  
  // Parameter portamento
  setParameterPortamento: (durationMs: number, curve?: string) => void;
  
  // Note control
  handleExternalNoteOn: (message: { pitch: number; velocity?: number; note_id?: string }) => void;
  handleExternalNoteOff: (message: { pitch?: number; note_id?: string }) => void;
  
  // Instrument commands
  executeInstrumentCommand: (name: string, args?: any) => void;
  
  // State management
  saveStateToBank: (bankIndex: number) => {
    success: boolean;
    instrumentId: string | null;
  };
  loadStateFromBank: (bankIndex: number) => {
    success: boolean;
    error?: string;
    instrumentId: string | null;
  };
  getCurrentResolvedState: () => {
    params: Record<string, any>;
    globalSettings: Record<string, any>;
    dynamicInternalState: Record<string, any> | null;
  };
}