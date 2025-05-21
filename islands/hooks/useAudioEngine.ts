import { computed, Signal, useSignal } from "@preact/signals";
import { useCallback, useEffect, useRef } from "preact/hooks";
import {
  AudioEngineService,
  type SynthParams,
} from "../../services/AudioEngineService.ts";
import { DEFAULT_SYNTH_PARAMS } from "../../lib/synth/index.ts";
import {
  ControllerMode,
  KNOWN_CONTROLLER_MODES,
} from "../../shared/controllerModes.ts";

/**
 * Custom hook for managing the AudioEngineService with reactive signals
 */
// Export the return type for components that use this hook
export type UseAudioEngineReturn = ReturnType<typeof useAudioEngine>;

export function useAudioEngine(
  addLog: (message: string) => void = () => {},
  currentControllerMode?: Signal<ControllerMode>,
) {
  // Create signals for audio parameters
  const frequency = useSignal(DEFAULT_SYNTH_PARAMS.frequency);
  const waveform = useSignal<OscillatorType>(DEFAULT_SYNTH_PARAMS.waveform);
  const volume = useSignal(DEFAULT_SYNTH_PARAMS.volume);
  const detune = useSignal(DEFAULT_SYNTH_PARAMS.detune);
  const attack = useSignal(DEFAULT_SYNTH_PARAMS.attack);
  const release = useSignal(DEFAULT_SYNTH_PARAMS.release);
  const filterCutoff = useSignal(DEFAULT_SYNTH_PARAMS.filterCutoff);
  const filterResonance = useSignal(DEFAULT_SYNTH_PARAMS.filterResonance);
  const vibratoRate = useSignal(DEFAULT_SYNTH_PARAMS.vibratoRate);
  const vibratoWidth = useSignal(DEFAULT_SYNTH_PARAMS.vibratoWidth);
  const portamentoTime = useSignal(DEFAULT_SYNTH_PARAMS.portamentoTime);

  // Current note display (derived from frequency)
  const currentNote = useSignal("");

  // Audio state
  const isMuted = useSignal(true);
  const isNoteActive = useSignal(false);
  const audioContextState = useSignal<string | null>(null);
  const audioReady = useSignal(false);

  // Volume check state
  const isVolumeCheckPending = useSignal(false);

  // Controller mode state - default to IKEDA mode if none provided
  const activeControllerMode = useSignal<ControllerMode>(
    KNOWN_CONTROLLER_MODES.IKEDA,
  );

  // FFT data for visualizations
  const fftData = useSignal<Uint8Array | null>(null);
  const waveformData = useSignal<Uint8Array | null>(null);

  // AudioEngineService reference
  const audioEngineRef = useRef<AudioEngineService | null>(null);

  // Animation frame reference
  const animationFrameRef = useRef<number | null>(null);

  // Computed value to check if audio is fully ready
  const audioContextReady = computed(() =>
    audioReady.value && (audioContextState.value === "running")
  );

  // Initialize the audio engine with a custom logger
  const initializeAudioEngine = useCallback(() => {
    if (!audioEngineRef.current) {
      const logger = (message: string) => {
        addLog(message);
        console.log(`[AUDIO_ENGINE] ${message}`);
      };

      // Create audio engine service with engine state change callback
      audioEngineRef.current = new AudioEngineService(
        logger,
        (engineState) => {
          if (engineState.isVolumeCheckPending !== undefined) {
            isVolumeCheckPending.value = engineState.isVolumeCheckPending;
            addLog(
              `useAudioEngine: Volume check pending state updated to: ${engineState.isVolumeCheckPending}`,
            );
          }
        },
      );

      // Update signals from initial service state
      const params = audioEngineRef.current.getParams();
      frequency.value = params.frequency;
      waveform.value = params.waveform;
      volume.value = params.volume;
      detune.value = params.detune;
      attack.value = params.attack;
      release.value = params.release;
      filterCutoff.value = params.filterCutoff;
      filterResonance.value = params.filterResonance;
      vibratoRate.value = params.vibratoRate;
      vibratoWidth.value = params.vibratoWidth;
      portamentoTime.value = params.portamentoTime;
      currentNote.value = audioEngineRef.current.getCurrentNote();
    }
  }, [addLog]);

  // Initialize the audio context
  const initializeAudioContext = useCallback(async () => {
    try {
      initializeAudioEngine();

      if (audioEngineRef.current) {
        await audioEngineRef.current.initializeAudioContext();

        // Update state signals
        audioContextState.value = audioEngineRef.current.getAudioContextState();
        audioReady.value = true;
        addLog(`Audio context initialized and ${audioContextState.value}`);

        // Start updating FFT data for visualizations
        startVisualizationUpdates();
      }
    } catch (error) {
      addLog(
        `Error initializing audio context: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      console.error("Error initializing audio context:", error);
    }
  }, []);

  // Start the continuous updates for visualizations
  const startVisualizationUpdates = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const updateVisualizations = () => {
      if (audioEngineRef.current && audioReady.value) {
        fftData.value = audioEngineRef.current.getFFTData();
        waveformData.value = audioEngineRef.current.getWaveformData();
      }

      animationFrameRef.current = requestAnimationFrame(updateVisualizations);
    };

    animationFrameRef.current = requestAnimationFrame(updateVisualizations);
  }, []);

  /**
   * Confirm volume check is complete and transition to full generative mode
   */
  const confirmVolumeCheckComplete = useCallback(() => {
    if (audioEngineRef.current) {
      // This will work for both DEFAULT and IKEDA modes
      audioEngineRef.current.confirmVolumeCheckComplete();
      addLog(
        `useAudioEngine: User confirmed volume check for ${activeControllerMode.value} mode.`,
      );
    }
  }, [activeControllerMode.value, addLog]);

  // Play a note
  const playNote = useCallback((noteFrequency: number) => {
    if (audioEngineRef.current) {
      audioEngineRef.current.noteOn(noteFrequency);
      isNoteActive.value = true;
      frequency.value = noteFrequency;
      currentNote.value = audioEngineRef.current.getCurrentNote();
    }
  }, []);

  // Stop the current note
  const stopNote = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.noteOff();
      isNoteActive.value = false;
    }
  }, []);

  // Play a note by name (e.g., "A4")
  const playNoteByName = useCallback((noteName: string) => {
    if (audioEngineRef.current) {
      audioEngineRef.current.playNoteByName(noteName);
      isNoteActive.value = true;
      frequency.value = audioEngineRef.current.getParams().frequency;
      currentNote.value = noteName;
    }
  }, []);

  // Toggle mute state
  const toggleMute = useCallback(() => {
    if (audioEngineRef.current) {
      const newMuteState = !isMuted.value;
      audioEngineRef.current.setMuted(newMuteState);
      isMuted.value = newMuteState;
      addLog(`Audio ${newMuteState ? "muted" : "unmuted"}`);
    }
  }, [isMuted.value]);

  // Update a synth parameter - generalized to handle any parameter
  const updateSynthParam = useCallback(
    (paramId: string, value: any) => {
      if (!audioEngineRef.current) {
        addLog("Audio engine not initialized, cannot update param: " + paramId);
        return;
      }

      // Directly forward to AudioEngineService
      audioEngineRef.current.updateParameter(paramId, value);
    },
    [addLog],
  );

  // Watch for controller mode changes from parent component
  useEffect(() => {
    if (currentControllerMode) {
      // Update our local signal when the parent's signal changes
      const updateControllerMode = () => {
        addLog(
          `[DEBUG_MODE_CHANGE] useAudioEngine.useEffect[modeChanged]: currentControllerMode=${currentControllerMode.value}, activeControllerMode=${activeControllerMode.value}`,
        );

        if (currentControllerMode.value !== activeControllerMode.value) {
          activeControllerMode.value = currentControllerMode.value;

          // If audio engine is ready, set the mode in the service
          if (audioEngineRef.current && audioContextReady.value) {
            addLog(
              `[DEBUG_MODE_CHANGE] useAudioEngine.useEffect[modeChanged]: Setting AudioEngineService mode to ${activeControllerMode.value}`,
            );
            audioEngineRef.current.setMode(activeControllerMode.value);
          } else {
            addLog(
              `[DEBUG_MODE_CHANGE] useAudioEngine.useEffect[modeChanged]: Cannot set mode yet. audioEngineRef.current=${!!audioEngineRef
                .current}, audioContextReady=${audioContextReady.value}`,
            );
          }
        }
      };

      // Initialize with current value
      updateControllerMode();

      // Set up the effect dependency to track changes
      const unsubscribe = currentControllerMode.subscribe(updateControllerMode);

      return () => {
        unsubscribe();
      };
    }
  }, [currentControllerMode]);

  // Set mode in AudioEngineService when it becomes ready
  useEffect(() => {
    if (audioEngineRef.current && audioContextReady.value) {
      addLog(
        `Setting initial audio engine mode: ${activeControllerMode.value}`,
      );
      audioEngineRef.current.setMode(activeControllerMode.value);
    }
  }, [audioContextReady.value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (audioEngineRef.current) {
        audioEngineRef.current.close();
        audioEngineRef.current = null;
      }
    };
  }, []);

  // Update audio context state when it changes
  useEffect(() => {
    const checkAudioContextState = () => {
      if (audioEngineRef.current) {
        const newState = audioEngineRef.current.getAudioContextState();
        if (newState !== audioContextState.value) {
          audioContextState.value = newState;
        }
      }
    };

    const intervalId = setInterval(checkAudioContextState, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Method to get current controller mode
  const getControllerMode = useCallback(() => {
    if (audioEngineRef.current) {
      return audioEngineRef.current.getActiveMode() ||
        activeControllerMode.value;
    }
    return activeControllerMode.value;
  }, [activeControllerMode.value]);

  // Method to set controller mode and initialize parameters
  const setControllerMode = useCallback(
    (mode: ControllerMode, initialParams?: Record<string, unknown>) => {
      // Update our local signal
      addLog(
        `[DEBUG_MODE_CHANGE] useAudioEngine.setControllerMode: Setting mode to ${mode}, current mode: ${activeControllerMode.value}`,
      );
      activeControllerMode.value = mode;

      // If audio engine exists, set the mode on the engine
      if (audioEngineRef.current) {
        addLog(
          `[DEBUG_MODE_CHANGE] useAudioEngine.setControllerMode: Setting audio engine mode to ${mode}`,
        );
        audioEngineRef.current.setMode(mode, initialParams);
      } else {
        addLog(
          `[DEBUG_MODE_CHANGE] useAudioEngine.setControllerMode: Audio engine not initialized, cannot set mode: ${mode}`,
        );
      }
    },
    [addLog, activeControllerMode.value],
  );

  return {
    // Parameter signals
    frequency,
    waveform,
    volume,
    detune,
    attack,
    release,
    filterCutoff,
    filterResonance,
    vibratoRate,
    vibratoWidth,
    portamentoTime,
    currentNote,

    // State signals
    isMuted,
    isNoteActive,
    audioContextState,
    audioReady,
    audioContextReady,
    isVolumeCheckPending, // Added for integrated volume check
    fftData,
    waveformData,
    activeControllerMode,

    // Methods
    initializeAudioContext,
    confirmVolumeCheckComplete, // Use this instead of the old pink noise methods
    playNote,
    stopNote,
    playNoteByName,
    toggleMute,
    updateSynthParam,
    getControllerMode,
    setControllerMode,
  };
}
