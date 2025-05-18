import { computed, Signal, useSignal } from "@preact/signals";
import { useCallback, useEffect, useRef } from "preact/hooks";
import {
  AudioEngineService,
  type SynthParams,
} from "../../services/AudioEngineService.ts";
import { DEFAULT_SYNTH_PARAMS } from "../../lib/synth/index.ts";

/**
 * Custom hook for managing the AudioEngineService with reactive signals
 */
// Export the return type for components that use this hook
export type UseAudioEngineReturn = ReturnType<typeof useAudioEngine>;

export function useAudioEngine(
  addLog: (message: string) => void = () => {},
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

  // Pink noise state
  const pinkNoiseActive = useSignal(false);
  const pinkNoiseSetupDone = useSignal(false);

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

      // Create audio engine service
      audioEngineRef.current = new AudioEngineService(logger);

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

  // Start pink noise for volume check
  const startPinkNoise = useCallback(async (gain: number = 0.2) => {
    try {
      if (audioEngineRef.current && audioReady.value) {
        try {
          await audioEngineRef.current.startPinkNoise(gain);
          pinkNoiseActive.value = true;
          addLog("Pink noise started for volume check");
        } catch (error) {
          // If pink noise fails, proceed directly to volume check done
          addLog(
            `Error starting pink noise: ${
              error instanceof Error ? error.message : String(error)
            } - proceeding directly to main audio`,
          );
          console.error("Error starting pink noise:", error);

          // Skip pink noise and go directly to main audio
          handleVolumeCheckDone();
        }
      }
    } catch (error) {
      addLog(
        `Error in startPinkNoise: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      console.error("Error in startPinkNoise:", error);

      // Try to enable audio directly
      if (audioEngineRef.current) {
        audioEngineRef.current.setPinkNoiseSetupDone(true);
        audioEngineRef.current.setMuted(false);
        isMuted.value = false;
        pinkNoiseSetupDone.value = true;
        addLog("Audio enabled directly (skipping volume check).");
      }
    }
  }, []);

  // Stop pink noise
  const stopPinkNoise = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.stopPinkNoise();
      pinkNoiseActive.value = false;
      addLog("Pink noise stopped");
    }
  }, []);

  // Handle completing volume check
  const handleVolumeCheckDone = useCallback(() => {
    if (audioEngineRef.current) {
      stopPinkNoise();
      pinkNoiseSetupDone.value = true;
      audioEngineRef.current.setPinkNoiseSetupDone(true);
      audioEngineRef.current.setMuted(false);
      isMuted.value = false;
      addLog("Volume check done. Audio enabled.");

      // Restore note if it was active
      if (isNoteActive.value) {
        playNote(frequency.value);
      }
    }
  }, [frequency.value, isNoteActive.value]);

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

  // Update a synth parameter
  const updateSynthParam = useCallback(
    (param: keyof SynthParams, value: any) => {
      if (!audioEngineRef.current) return;

      switch (param) {
        case "frequency":
          audioEngineRef.current.setFrequency(value);
          frequency.value = value;
          currentNote.value = audioEngineRef.current.getCurrentNote();
          break;
        case "waveform":
          audioEngineRef.current.setWaveform(value);
          waveform.value = value;
          break;
        case "volume":
          audioEngineRef.current.setVolume(value);
          volume.value = value;
          break;
        case "detune":
          audioEngineRef.current.setDetune(value);
          detune.value = value;
          break;
        case "attack":
          audioEngineRef.current.setAttack(value);
          attack.value = value;
          break;
        case "release":
          audioEngineRef.current.setRelease(value);
          release.value = value;
          break;
        case "filterCutoff":
          audioEngineRef.current.setFilterCutoff(value);
          filterCutoff.value = value;
          break;
        case "filterResonance":
          audioEngineRef.current.setFilterResonance(value);
          filterResonance.value = value;
          break;
        case "vibratoRate":
          audioEngineRef.current.setVibratoRate(value);
          vibratoRate.value = value;
          break;
        case "vibratoWidth":
          audioEngineRef.current.setVibratoWidth(value);
          vibratoWidth.value = value;
          break;
        case "portamentoTime":
          audioEngineRef.current.setPortamentoTime(value);
          portamentoTime.value = value;
          break;
      }
    },
    [],
  );

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
    pinkNoiseActive,
    pinkNoiseSetupDone,
    fftData,
    waveformData,

    // Methods
    initializeAudioContext,
    startPinkNoise,
    stopPinkNoise,
    handleVolumeCheckDone,
    playNote,
    stopNote,
    playNoteByName,
    toggleMute,
    updateSynthParam,
  };
}
