import { Signal, useSignal } from "@preact/signals";
import { useEffect, useCallback, useRef } from "preact/hooks";
import type { AudioEngineControls, LoggerFn } from "./types.ts"; // Assuming types.ts is in the same directory

const DEFAULT_TEMPO_CPM = 60; // Will be used in later parts for phasor logic

/**
 * Defines the explicit return type for the useAudioEngine hook,
 * encompassing all methods and signals from AudioEngineControls plus
 * any methods specific to this hook's public API for UI interaction (e.g., initializeAudio).
 */
export type UseAudioEngineReturn = AudioEngineControls & {
  initializeAudio: () => Promise<void>;
  fftData: Signal<Uint8Array | null>; // For FFT visualization, used by Synth.tsx
  isVolumeCheckActiveSignal: Signal<boolean>; // To indicate if volume check phase is active
  confirmVolumeSetAndPrepare: () => void; // Method to call when user confirms volume
  isProgramRunningSignal: Signal<boolean>; // True if the main generative program/sequence is active
  startProgram: () => void; // Starts the main generative program/sequence
  stopProgram: () => void; // Stops/pauses the main generative program/sequence
  // Add other UI-specific methods or signals here if they are part of the hook\'s public API
  // but not part of the AudioEngineControls interface (which is for inter-hook communication).
};

/**
 * Manages the Web Audio API, active instrument, and core audio processing logic.
 * Part 1: Skeleton, AudioContext, Core State Signals, and Method Stubs.
 */
export default function useAudioEngine(addLog: LoggerFn): UseAudioEngineReturn {
  // Use the specific return type

  // Logging utility specific to this hook instance
  const log = useCallback(
    (message: string, level: "info" | "error" | "warn" = "info") => {
      const prefix = `[AudioEngine]`;
      addLog(`${prefix} ${message}`);
      if (level === "error") console.error(`${prefix} ${message}`);
      else if (level === "warn") console.warn(`${prefix} ${message}`);
      else console.log(`${prefix} ${message}`);
    },
    [addLog],
  );

  log("Hook useAudioEngine part 1 initializing (skeleton, stubs, context).");

  // === Core Audio Context State ===
  const audioContextSignal = useSignal<AudioContext | null>(null);
  const audioContextStateSignal =
    useSignal<AudioEngineControls["audioContextStateSignal"]["value"]>(
      "suspended",
    );
  const outputGainNodeSignal = useSignal<GainNode | null>(null);
  const isGloballyMutedSignal = useSignal<boolean>(false);

  // === Audio Node Refs for Ikeda Synth ===
  const pinkNoiseNodeRef = useRef<AudioWorkletNode | null>(null);
  const pinkNoiseGainNodeRef = useRef<GainNode | null>(null); // For LFO modulation of pink noise
  const lfoNodeRef = useRef<AudioWorkletNode | null>(null); // Unipolar LFO processor
  const analyserNodeRef = useRef<AnalyserNode | null>(null); // For FFT

  // === Debugging AudioContext Instances ===
  const audioContextInstanceCounter = useRef(0);
  const coreAudioNodesSetupComplete = useRef(false); // Flag to track if core nodes are set up for the current AC

  // === State for Volume Check ===
  const isVolumeCheckActiveSignal = useSignal<boolean>(true); // Start in volume check mode

  // === Visualization State (Placeholder) ===
  const fftData = useSignal<Uint8Array | null>(null); // FFT data for visualization

  // === Active Instrument & Program State ===
  const activeInstrumentIdSignal = useSignal<string | null>(null);
  const isProgramRunningSignal = useSignal<boolean>(false); // True if main generative program/sequence is active

  // === Tempo State ===
  const currentTempoSignal = useSignal<number>(DEFAULT_TEMPO_CPM);

  // Forward declare startProgram and confirmVolumeSetAndPrepare for co-dependent callbacks.
  const startProgramRef = useRef<() => void>(); // Will hold reference to startProgram
  const confirmVolumeSetAndPrepareRef = useRef<() => void>();

  // === AudioContext Management ===
  const initializeAudio = useCallback(async () => {
    if (
      audioContextSignal.value &&
      audioContextSignal.value.state === "running"
    ) {
      log("AudioContext already initialized and running.");
      return;
    }
    if (
      audioContextSignal.value &&
      audioContextSignal.value.state === "closed"
    ) {
      log("AudioContext was closed. Attempting to create a new one.", "warn");
      audioContextSignal.value = null;
    }
    if (!audioContextSignal.value) {
      try {
        audioContextInstanceCounter.current++;
        const contextId = `AC-${audioContextInstanceCounter.current}`;
        log(`Attempting to initialize new AudioContext (ID: ${contextId})...`);
        coreAudioNodesSetupComplete.current = false; // Reset flag for new AudioContext
        const newAudioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        (newAudioContext as any)._debug_id = contextId; // Store ID on the context for debugging
        audioContextSignal.value = newAudioContext;

        const masterGain = newAudioContext.createGain();
        // masterGain.connect(newAudioContext.destination); // Connection moved to after AnalyserNode
        outputGainNodeSignal.value = masterGain;
        masterGain.gain.setValueAtTime(
          isGloballyMutedSignal.value ? 0 : 1,
          newAudioContext.currentTime,
        );

        newAudioContext.onstatechange = () => {
          const newState =
            newAudioContext.state as AudioEngineControls["audioContextStateSignal"]["value"];
          const currentContextId =
            (newAudioContext as any)._debug_id || "unknown";
          log(
            `AudioContext (ID: ${currentContextId}) state changed to: ${newState}`,
          );
          audioContextStateSignal.value = newState;
          if (newState === "closed" || newState === "interrupted") {
            if (isProgramRunningSignal.value) {
              // Check the renamed signal
              log(
                `AudioContext (ID: ${currentContextId}) closed/interrupted, ensuring program state reflects stop.`,
                "warn",
              );
              isProgramRunningSignal.value = false; // Update the renamed signal
            }
          }
        };

        if (newAudioContext.state === "suspended") {
          log("AudioContext is suspended, attempting to resume...");
          await newAudioContext.resume();
        }
        audioContextStateSignal.value =
          newAudioContext.state as AudioEngineControls["audioContextStateSignal"]["value"];
        const finalContextId =
          (newAudioContext as any)._debug_id || "unknown_after_init";
        log(
          `AudioContext (ID: ${finalContextId}) initialized. Current state: ${newAudioContext.state}`,
        );

        if (newAudioContext.state === "running") {
          if (coreAudioNodesSetupComplete.current) {
            log(
              `AudioContext (ID: ${(newAudioContext as any)._debug_id || "current"}) is running, core nodes already set up. Skipping node re-creation.`,
            );
            return;
          }
          try {
            log("Loading AudioWorklet modules...");
            await Promise.all([
              newAudioContext.audioWorklet.addModule(
                "/ridge_rat_type2_pink_noise_processor.js",
              ),
              newAudioContext.audioWorklet.addModule(
                "/lfo_controller_processor.js",
              ),
            ]);
            log("AudioWorklet modules loaded.");

            pinkNoiseNodeRef.current = new AudioWorkletNode(
              newAudioContext,
              "ridge-rat-type2-pink-noise-generator",
            );
            
            lfoNodeRef.current = new AudioWorkletNode(
              newAudioContext,
              "unipolar-lfo-processor",
            );

            log("Audio nodes created.");

            // Create a gain node specifically for pink noise modulation
            pinkNoiseGainNodeRef.current = newAudioContext.createGain();
            // Initialize the gain value to 0.3 (will be controlled by LFO)
            pinkNoiseGainNodeRef.current.gain.value = 0.3;

            if (
              lfoNodeRef.current &&
              outputGainNodeSignal.value &&
              pinkNoiseNodeRef.current
            ) {
              // Set pink noise amplitude to a fixed value (1.0)
              const pinkNoiseAmplitudeParam =
                pinkNoiseNodeRef.current.parameters.get("amplitude");
              if (pinkNoiseAmplitudeParam) {
                pinkNoiseAmplitudeParam.setValueAtTime(
                  1.0,
                  newAudioContext.currentTime,
                );
              }

              // Connect pink noise to the dedicated gain node
              pinkNoiseNodeRef.current.connect(pinkNoiseGainNodeRef.current);

              // Connect the gain node to the master gain
              pinkNoiseGainNodeRef.current.connect(outputGainNodeSignal.value);

              // Connect LFO to control the pink noise gain node
              lfoNodeRef.current.connect(pinkNoiseGainNodeRef.current.gain); // LFO -> PinkNoiseGain.gain
              // log("AudioWorklet nodes connected: LFO -> PinkNoise -> OutputGain."); // Log combined below

              // Setup AnalyserNode for FFT
              analyserNodeRef.current = newAudioContext.createAnalyser();
              analyserNodeRef.current.fftSize = 256; // Adjust as needed

              // Connect audio processing chain: MasterGain -> Analyser -> Destination
              if (
                outputGainNodeSignal.value &&
                analyserNodeRef.current &&
                newAudioContext
              ) {
                outputGainNodeSignal.value.connect(analyserNodeRef.current); // MasterGain -> Analyser
                analyserNodeRef.current.connect(newAudioContext.destination); // Analyser -> Destination
                log(
                  "Audio path: PN -> PinkNoiseGain <- LFO, PinkNoiseGain -> MasterGain -> Analyser -> Destination.",
                );
              } else {
                log(
                  "Critical error: Failed to connect AnalyserNode in series. Audio output may be compromised.",
                  "error",
                );
                // Fallback connection if something is wrong, try to ensure audio still reaches destination
                if (outputGainNodeSignal.value && newAudioContext) {
                  log(
                    "Fallback: Connecting MasterGain directly to destination.",
                    "warn",
                  );
                  outputGainNodeSignal.value.connect(
                    newAudioContext.destination,
                  );
                }
              }

              const acTime = newAudioContext.currentTime;

              // Configure LFO for volume check
              const lfoParams = lfoNodeRef.current.parameters;
              lfoParams.get("rate")?.setValueAtTime(0.2, acTime); // Slow rate for volume check
              lfoParams.get("amplitudeFactor")?.setValueAtTime(0.5, acTime); // Initial volume for check
              lfoParams.get("offset")?.setValueAtTime(0.0, acTime);
              lfoNodeRef.current.port.postMessage({
                type: "set_frozen_state",
                frozen: true,
                phaseToFreezeAt: 0.5,
              });

              // Set gain node base value to 0 - LFO will add its output to this value
              pinkNoiseGainNodeRef.current.gain.setValueAtTime(0, acTime);

              log(
                "LFO set for volume check (frozen at 0.5). Pink noise should be audible.",
              );
              coreAudioNodesSetupComplete.current = true; // Mark core node setup as complete for this AC
              isVolumeCheckActiveSignal.value = true; // Volume check is active
              isProgramRunningSignal.value = false; // Explicitly ensure program is not marked as running
              activeInstrumentIdSignal.value = "ikeda_synth_v1"; // Default to Ikeda for volume check context
            } else {
              log(
                "Failed to connect AudioWorklet nodes or find parameters.",
                "error",
              );
            }
          } catch (workletError) {
            const errorMsg =
              workletError instanceof Error
                ? workletError.message
                : String(workletError);
            log(`Error setting up AudioWorklets: ${errorMsg}`, "error");
            console.error("AudioWorklet setup error:", workletError);
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        log(`Error initializing AudioContext: ${errorMsg}`, "error");
        audioContextStateSignal.value = "closed";
      }
    } else if (audioContextSignal.value.state === "suspended") {
      log(
        "AudioContext is suspended, attempting to resume existing context...",
      );
      try {
        await audioContextSignal.value.resume();
        log(
          `AudioContext resumed. Current state: ${audioContextSignal.value.state}`,
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        log(`Error resuming AudioContext: ${errorMsg}`, "error");
      }
    }
    // Autoplay for volume check is handled by the LFO configuration within the try/catch block above
  }, [
    log,
    audioContextSignal,
    outputGainNodeSignal,
    isGloballyMutedSignal,
    audioContextStateSignal,
    isProgramRunningSignal,
    isVolumeCheckActiveSignal,
    activeInstrumentIdSignal,
  ]); // Added activeInstrumentIdSignal

  // This function will be called when user confirms volume setting
  const confirmVolumeSetAndPrepare = useCallback(() => {
    if (lfoNodeRef.current && audioContextSignal.value?.state === "running") {
      log("Volume set. Pink noise layer will now perform a phase-driven roll-down.");
      isVolumeCheckActiveSignal.value = false;

      const lfoNode = lfoNodeRef.current;
      const acTime = audioContextSignal.value.currentTime;

      const rollDownRate = 0.5; // Defined rate for the volume check roll-down (e.g., 0.5 Hz)

      // Instead of ramping down amplitude, use run_until_and_freeze to naturally reach a silent phase
      log("Commanding LFO to run until phase 1.0 and then freeze");
      
      // Set LFO rate to a moderate value for roll-down effect
      const lfoParams = lfoNode.parameters.get("rate");
      if (lfoParams) {
        lfoParams.setValueAtTime(rollDownRate, acTime); // 0.5 Hz gives a 2-second cycle
      }
      
      // Keep the amplitude at its current value
      const lfoAmpFactorParam = lfoNode.parameters.get("amplitudeFactor");
      if (lfoAmpFactorParam) {
        log(`Maintaining LFO amplitudeFactor at current value: ${lfoAmpFactorParam.value.toFixed(4)}`);
      }
      
      // Command the LFO to run until it reaches phase 1.0 (silence for cosine) and then freeze
      // This creates a natural roll-down as the LFO completes its current cycle
      lfoNode.port.postMessage({
        type: "run_until_and_freeze",
        targetPhase: 1.0
      });
      
      log("LFO commanded to run until phase 1.0 and then freeze at silence point");

      // The main "program" isn't running yet. The roll-down is a one-shot effect.
      // Ensure isProgramRunningSignal is false.
      if (isProgramRunningSignal.value) {
        isProgramRunningSignal.value = false;
        log(
          "isProgramRunningSignal set to false; synth awaiting program start after roll-down command.",
        );
      }
    } else {
      log(
        "Cannot confirm volume set: LFO node or AudioContext not ready.",
        "warn",
      );
    }
  }, [
    log,
    audioContextSignal,
    lfoNodeRef,
    isVolumeCheckActiveSignal,
    isProgramRunningSignal,
  ]);

  // Assign to ref for co-dependent callbacks if needed
  // Assign to ref for co-dependent callbacks if needed
  useEffect(() => {
    confirmVolumeSetAndPrepareRef.current = confirmVolumeSetAndPrepare;
  }, [confirmVolumeSetAndPrepare]);

  // startProgram: Starts the main "program" or sequenced elements of the ikeda_synth
  const startProgram = useCallback(() => {
    if (isVolumeCheckActiveSignal.value) {
      log(
        "Cannot start program: Volume check phase is still active. Please confirm volume first.",
        "warn",
      );
      return;
    }
    if (
      !audioContextSignal.value ||
      audioContextSignal.value.state !== "running" ||
      !lfoNodeRef.current
    ) {
      log(
        "Cannot start program: Audio engine not ready or LFO node missing.",
        "warn",
      );
      if (isProgramRunningSignal.value) isProgramRunningSignal.value = false; // Ensure correct state
      return;
    }

    log("startProgram called: Activating ikeda_synth dynamic elements.");
    const lfoNode = lfoNodeRef.current;
    const acTime = audioContextSignal.value.currentTime;

    // TODO: Resolve actual ikeda_synth parameters (pink_noise_volume, pink_noise_lfo_rate_rule)
    // For now, using example placeholder values for continuous LFO operation.
    const ikedaLfoRate = 0.5; // Example: 0.5 Hz
    const ikedaPinkNoiseVolume = 0.7; // Example: 0.7 volume (amplitudeFactor for LFO)

    // LFO might be frozen at phase 1.0 (trough) after confirmVolumeSetAndPrepare's roll-down.
    // Unfreezing it will make it run from that phase with the new parameters.
    lfoNode.port.postMessage({ type: "set_frozen_state", frozen: false });
    
    // Set LFO parameters
    lfoNode.parameters.get("rate")?.setValueAtTime(ikedaLfoRate, acTime);
    lfoNode.parameters.get("amplitudeFactor")?.setValueAtTime(ikedaPinkNoiseVolume, acTime);
    
    // Set gain base value to 0 - LFO will add its output
    if (pinkNoiseGainNodeRef.current) {
      pinkNoiseGainNodeRef.current.gain.setValueAtTime(
        0, // Base value is 0, LFO will add to it
        acTime,
      );
    }

    isProgramRunningSignal.value = true;
    log(
      `ikeda_synth program started. Pink Noise LFO active: Rate: ${ikedaLfoRate}Hz, AmpFactor: ${ikedaPinkNoiseVolume}`,
    );

    // TODO: Activate other ikeda_synth layers (blips, clicks) here
    // based on their respective *_active parameters and the running master phasor.
  }, [
    log,
    audioContextSignal,
    lfoNodeRef,
    isProgramRunningSignal,
    isVolumeCheckActiveSignal,
  ]);

  // Assign to ref for co-dependent callbacks if needed
  useEffect(() => {
    startProgramRef.current = startProgram;
  }, [startProgram]);

  // stopProgram: Stops/pauses the main "program"
  const stopProgram = useCallback(() => {
    log("stopProgram called: Deactivating ikeda_synth dynamic elements.");
    if (
      pinkNoiseGainNodeRef.current &&
      audioContextSignal.value?.state === "running"
    ) {
      const acTime = audioContextSignal.value.currentTime;
      // To silence the pink noise layer, set the gain to 0
      pinkNoiseGainNodeRef.current.gain.setValueAtTime(0.0, acTime);
      log("Pink noise gain set to 0 for program stop.");
    }
    isProgramRunningSignal.value = false;

    // TODO: Deactivate/pause other ikeda_synth layers (blips, clicks).
  }, [log, audioContextSignal, pinkNoiseGainNodeRef, isProgramRunningSignal]);

  useEffect(() => {
    if (
      outputGainNodeSignal.value &&
      audioContextSignal.value?.state === "running"
    ) {
      outputGainNodeSignal.value.gain.setValueAtTime(
        isGloballyMutedSignal.value ? 0 : 1,
        audioContextSignal.value.currentTime,
      );
      log(
        `Global mute effect applied. isGloballyMuted: ${isGloballyMutedSignal.value}`,
      );
    } else if (outputGainNodeSignal.value) {
      outputGainNodeSignal.value.gain.value = isGloballyMutedSignal.value
        ? 0
        : 1;
      log(
        `Global mute set (context not running). isGloballyMuted: ${isGloballyMutedSignal.value}`,
      );
    }
  }, [
    isGloballyMutedSignal.value,
    outputGainNodeSignal.value,
    audioContextSignal.value?.state,
  ]);

  useEffect(() => {
    const acRef = audioContextSignal.value;
    const currentLfoNode = lfoNodeRef.current;
    const currentPinkNoiseNode = pinkNoiseNodeRef.current;
    const currentPinkNoiseGainNode = pinkNoiseGainNodeRef.current;
    const currentAnalyserNode = analyserNodeRef.current;

    return () => {
      const contextToCleanId = (acRef as any)?._debug_id || "unknown_or_null";
      log(
        `Running aggressive cleanup in useAudioEngine for AudioContext (ID: ${contextToCleanId})...`,
      );
      const cleanupTime = acRef?.currentTime ?? 0;

      // 1. Silence and disconnect LFO
      if (currentLfoNode) {
        log("Cleaning up LFO node...");
        try {
          // Set LFO amplitude to 0 first for immediate silencing
          const lfoAmpFactor = currentLfoNode.parameters.get('amplitudeFactor');
          if (lfoAmpFactor) {
            if (acRef && acRef.state === 'running') {
              lfoAmpFactor.cancelScheduledValues(cleanupTime);
              lfoAmpFactor.setValueAtTime(0.0, cleanupTime);
              log("LFO amplitudeFactor set to 0 for cleanup.");
            } else {
              lfoAmpFactor.value = 0.0; // Fallback if context not running/ready
              log("LFO amplitudeFactor set directly to 0 (fallback) for cleanup.");
            }
          }
          
          // Then freeze the LFO at phase 1.0 (silent for unipolar cosine)
          currentLfoNode.port.postMessage({
            type: "set_frozen_state",
            frozen: true,
            phaseToFreezeAt: 1.0,
          });
          log("Sent freeze command to LFO at phase 1.0 for cleanup.");
          
          // Finally disconnect the node
          currentLfoNode.disconnect();
          log("Disconnected LFO node.");
        } catch (e) {
          log(
            `Error during LFO node cleanup: ${e instanceof Error ? e.message : String(e)}`,
            "warn",
          );
        }
        lfoNodeRef.current = null;
      }

      // 2. Silence and disconnect PinkNoiseGainNode
      if (currentPinkNoiseGainNode) {
        log("Cleaning up Pink Noise Gain node...");
        try {
          // Set gain to 0 first for immediate silencing
          if (acRef && acRef.state === "running") {
            currentPinkNoiseGainNode.gain.cancelScheduledValues(cleanupTime);
            currentPinkNoiseGainNode.gain.setValueAtTime(0.0, cleanupTime);
            log("PinkNoiseGainNode gain set to 0 for cleanup.");
          } else {
            currentPinkNoiseGainNode.gain.value = 0.0; // Fallback
            log(
              "PinkNoiseGainNode gain set directly to 0 (fallback) for cleanup.",
            );
          }
          // Disconnect the node
          currentPinkNoiseGainNode.disconnect();
          log("Disconnected Pink Noise Gain node.");
        } catch (e) {
          log(
            `Error during Pink Noise Gain node cleanup: ${e instanceof Error ? e.message : String(e)}`,
            "warn",
          );
        }
        pinkNoiseGainNodeRef.current = null;
      }

      // 3. Silence and disconnect PinkNoiseNode
      if (currentPinkNoiseNode) {
        log("Cleaning up Pink Noise node...");
        try {
          const pnAmplitude = currentPinkNoiseNode.parameters.get("amplitude");
          if (pnAmplitude) {
            if (acRef && acRef.state === "running") {
              pnAmplitude.cancelScheduledValues(cleanupTime);
              pnAmplitude.setValueAtTime(0.0, cleanupTime);
              log("PinkNoiseNode amplitude set to 0 for cleanup.");
            } else {
              pnAmplitude.value = 0.0; // Fallback
              log(
                "PinkNoiseNode amplitude set directly to 0 (fallback) for cleanup.",
              );
            }
          }
          // Disconnect from Analyser first if it exists
          if (currentAnalyserNode) {
            try {
              currentPinkNoiseNode.disconnect(currentAnalyserNode);
              log("Disconnected PinkNoiseNode from AnalyserNode.");
            } catch (e) {
              /* Ignore if already disconnected or analyser was from different pink noise */
            }
          }
          currentPinkNoiseNode.disconnect(); // Disconnect from all other outputs (like masterGain)
          log("Disconnected Pink Noise node from other outputs.");
        } catch (e) {
          log(
            `Error during Pink Noise node cleanup: ${e instanceof Error ? e.message : String(e)}`,
            "warn",
          );
        }
        pinkNoiseNodeRef.current = null;
      }

      // 3. Nullify AnalyserNode ref (actual node object is GC'd if no other refs)
      if (currentAnalyserNode) {
        analyserNodeRef.current = null;
        log("Cleared AnalyserNode reference.");
      }

      // 4. Close AudioContext
      if (acRef && acRef.state !== "closed") {
        const closingId = (acRef as any)._debug_id || "unknown_on_close";
        log(
          `Closing AudioContext (ID: ${closingId}, state: ${acRef.state}) on unmount or audioContextSignal change.`,
        );
        acRef
          .close()
          .catch((e) =>
            log(
              `Error closing AudioContext (ID: ${closingId}): ${e instanceof Error ? e.message : String(e)}`,
              "error",
            ),
          );
        coreAudioNodesSetupComplete.current = false; // Reset flag as AC is being closed
      } else if (acRef) {
        const notClosingId =
          (acRef as any)._debug_id || "unknown_already_closed";
        log(
          `AudioContext (ID: ${notClosingId}, state: ${acRef.state}) not explicitly closed by this cleanup pass as it's already closed.`,
        );
        coreAudioNodesSetupComplete.current = false; // Reset flag if context was already closed
      } else {
        log(
          "Previous AudioContext was null, no explicit close needed by this cleanup pass for a specific instance.",
        );
        coreAudioNodesSetupComplete.current = false; // Reset flag if context was null
      }
    };
  }, [audioContextSignal.value, log]); // Added log to dependency array

  // Removed extra cleanup effect - relying only on the LFO processor fix

  // Effect for FFT Data Update
  useEffect(() => {
    let animationFrameId: number;
    const analyser = analyserNodeRef.current;
    const ac = audioContextSignal.value;

    if (analyser && ac && ac.state === "running") {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateFft = () => {
        if (
          analyserNodeRef.current &&
          audioContextSignal.value?.state === "running"
        ) {
          // Check again in case it stopped
          analyserNodeRef.current.getByteFrequencyData(dataArray);
          fftData.value = new Uint8Array(dataArray); // Create a new array to trigger signal update
          animationFrameId = requestAnimationFrame(updateFft);
        } else {
          fftData.value = null; // Clear FFT data if audio stops or analyser is gone
        }
      };
      animationFrameId = requestAnimationFrame(updateFft);
    } else {
      fftData.value = null; // Ensure FFT data is null if not running
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      fftData.value = null; // Clear FFT data on cleanup
      // log("FFT update loop stopped.");
    };
  }, [audioContextSignal.value?.state, analyserNodeRef.current]); // Re-run if context state or analyser changes

  // === STUB IMPLEMENTATIONS for AudioEngineControls methods ===

  // This function will be called when user confirms volume setting
  const activateInstrument = useCallback(
    (instrumentId: string, initialParams?: Record<string, any>) => {
      log(
        `STUB: activateInstrument: ${instrumentId}, initialParams: ${initialParams ? Object.keys(initialParams).join(", ") : "none"}`,
      );
      activeInstrumentIdSignal.value = instrumentId;
    },
    [log, activeInstrumentIdSignal],
  );

  const updateSynthParam = useCallback(
    (
      paramId: string,
      value: any,
      applyTiming: "immediate" | "next_phasor_reset",
    ) => {
      log(
        `STUB: updateSynthParam: ${paramId} = ${String(value).substring(0, 50)}, timing: ${applyTiming}`,
      );
    },
    [log],
  );

  const applyQueuedParamsNow = useCallback(() => {
    log(`STUB: applyQueuedParamsNow called.`);
  }, [log]);

  const setTempo = useCallback(
    (cpm: number) => {
      log(`STUB: setTempo: ${cpm} CPM`);
      currentTempoSignal.value = cpm;
    },
    [log, currentTempoSignal],
  );

  const synchronisePhasor = useCallback(() => {
    log(`STUB: synchronisePhasor called.`);
  }, [log]);

  const handleExternalNoteOn = useCallback(
    (data: {
      target_synth_id?: string;
      note_id?: string;
      pitch: number;
      velocity?: number;
    }) => {
      log(`STUB: handleExternalNoteOn: ${JSON.stringify(data)}`);
    },
    [log],
  );

  const handleExternalNoteOff = useCallback(
    (data: { target_synth_id?: string; note_id?: string; pitch?: number }) => {
      log(`STUB: handleExternalNoteOff: ${JSON.stringify(data)}`);
    },
    [log],
  );

  const saveStateToBank = useCallback(
    (bankIndex: number): ReturnType<AudioEngineControls["saveStateToBank"]> => {
      log(`STUB: saveStateToBank: index ${bankIndex}`);
      return {
        success: true,
        instrumentId: activeInstrumentIdSignal.value || "stub_instrument_id",
      };
    },
    [log, activeInstrumentIdSignal],
  );

  const loadStateFromBank = useCallback(
    (
      bankIndex: number,
    ): ReturnType<AudioEngineControls["loadStateFromBank"]> => {
      log(`STUB: loadStateFromBank: index ${bankIndex}`);
      return {
        success: true,
        instrumentId: activeInstrumentIdSignal.value || "stub_instrument_id",
      };
    },
    [log, activeInstrumentIdSignal],
  );

  const executeInstrumentCommand = useCallback(
    (name: string, args?: any) => {
      log(
        `STUB: executeInstrumentCommand: ${name}, args: ${JSON.stringify(args)}`,
      );
    },
    [log],
  );

  const setParameterPortamento = useCallback(
    (durationMs: number, curve?: string) => {
      log(`STUB: setParameterPortamento: ${durationMs}ms, curve: ${curve}`);
    },
    [log],
  );

  const getCurrentResolvedState = useCallback((): ReturnType<
    AudioEngineControls["getCurrentResolvedState"]
  > => {
    log(`STUB: getCurrentResolvedState called.`);
    return {
      params: { stub: "STUB_GetCurrentResolvedState_Params" },
      globalSettings: { stub: "STUB_GetCurrentResolvedState_Globals" },
      dynamicInternalState: { stub: "STUB_GetCurrentResolvedState_Dynamics" },
    };
  }, [log]);

  // === Return object for the hook ===
  return {
    // Methods directly from AudioEngineControls (implemented or stubbed)
    activateInstrument,
    updateSynthParam,
    applyQueuedParamsNow,
    // playPhasor, // Renamed to startProgram
    // stopPhasor, // Renamed to stopProgram
    setTempo,
    synchronisePhasor,
    handleExternalNoteOn,
    handleExternalNoteOff,
    saveStateToBank,
    loadStateFromBank,
    executeInstrumentCommand,
    setParameterPortamento,
    getCurrentResolvedState,

    // Signals directly from AudioEngineControls
    activeInstrumentIdSignal,
    isProgramRunningSignal, // Renamed
    isGloballyMutedSignal,
    audioContextStateSignal,
    fftData,
    isVolumeCheckActiveSignal, // Added

    // Methods for UI interaction
    confirmVolumeSetAndPrepare, // Added
    startProgram, // Renamed
    stopProgram, // Renamed

    // Method specifically for UI to initialize audio context
    initializeAudio,
  };
} // End of useAudioEngine hook
// Remove named export if it exists, default export is standard for hooks.
