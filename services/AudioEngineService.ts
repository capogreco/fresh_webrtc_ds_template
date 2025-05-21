import {
  DEFAULT_SYNTH_PARAMS,
  frequencyToNote,
  noteToFrequency,
  PARAM_DESCRIPTORS,
} from "../lib/synth/index.ts";
import {
  ControllerMode,
  KNOWN_CONTROLLER_MODES,
} from "../shared/controllerModes.ts";
// IKEDA MODE MVP REBUILD: Use IkedaModeMVPEngine for ALL modes
import { IkedaModeMVPEngine } from "../lib/synth/ikeda_mode/engine.ts";

// EXTREME MEASURE: Completely removed imports from default_mode
// to eliminate recursion bug in engine_COMPLEX_BACKUP.ts

/**
 * AudioEngineService errors
 */
export class AudioEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioEngineError";
  }
}

/**
 * Type definitions for synth parameters
 */
export interface SynthParams {
  frequency: number;
  waveform: OscillatorType;
  volume: number;
  detune: number;
  attack: number;
  release: number;
  filterCutoff: number;
  filterResonance: number;
  vibratoRate: number;
  vibratoWidth: number;
  portamentoTime: number;
}

/**
 * Audio parameter update options
 */
export interface AudioParamUpdateOptions<T> {
  // Required parameters
  paramName: string; // Parameter name for logging
  newValue: T; // New value to set

  // Optional parameters
  audioNode?: AudioParam | null; // Web Audio node parameter to update (if applicable)
  formatValue?: (value: T) => string; // Function to format value for display
  unit?: string; // Unit of measurement for logging
  extraUpdates?: ((value: T) => void) | null; // Additional updates to perform
  rampTime?: number; // Time in seconds for parameter ramping (0 for immediate)
  useExponentialRamp?: boolean; // Whether to use exponential ramping vs linear
}

/**
 * Default Mode parameter message structure
 */
interface DefaultModeParamMessage {
  type: "default_mode_param";
  param: string; // Can be in format "group.param" or just "param"
  value: unknown;
}

/**
 * Service for managing the Web Audio API components and audio synthesis
 */
export class AudioEngineService {
  // Audio context
  private audioContext: AudioContext | null = null;

  // Basic synth mode nodes
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private vibratoOsc: OscillatorNode | null = null;
  private vibratoGain: GainNode | null = null;

  // Pink noise for volume check
  private pinkNoiseNode: AudioWorkletNode | null = null;
  private pinkNoiseGain: GainNode | null = null;

  // Master output and analysis
  private masterVolumeGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  // Global reverb nodes
  private globalReverb: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private reverbDryGain: GainNode | null = null;

  // Audio state
  private isMuted: boolean = true;
  private isNoteActive: boolean = false;
  private workletLoaded: boolean = false;
  private pinkNoiseSetupDone: boolean = false;

  // Volume check state
  private isCurrentModeVolumeCheckPending: boolean = false;

  // Callback for engine state changes
  private onEngineStateChangeCallback?: (
    state: { isVolumeCheckPending: boolean },
  ) => void;

  // Parameters
  private params: SynthParams;
  private currentNote: string;

  // Mode management
  private activeMode: ControllerMode | null = null;
  // EXTREME MEASURE: Only use IkedaModeMVPEngine to avoid recursion bug
  private currentModeEngine: IkedaModeMVPEngine | null = null;

  // Main mixer input node for connecting all engines
  private mainMixerInput: GainNode | null = null;

  // Callback for logging
  private logCallback: (message: string) => void;
  private globalParamHandlers: Map<string, (value: unknown) => void>;

  constructor(
    logCallback: (message: string) => void = () => {},
    onEngineStateChangeCallback?: (
      state: { isVolumeCheckPending: boolean },
    ) => void,
    initialParams: Partial<SynthParams> = {},
  ) {
    this.logCallback = logCallback;
    this.onEngineStateChangeCallback = onEngineStateChangeCallback;
    this.params = {
      ...DEFAULT_SYNTH_PARAMS,
      ...initialParams,
    };
    this.currentNote = frequencyToNote(this.params.frequency);

    // Initialize global parameter handlers
    this.globalParamHandlers = new Map();
    this.globalParamHandlers.set("ikedaGlobalMasterVolume", this.setGlobalMasterVolume.bind(this));
    this.globalParamHandlers.set("defaultGlobalMasterVolume", this.setGlobalMasterVolume.bind(this));
    this.globalParamHandlers.set("global_volume", this.setGlobalMasterVolume.bind(this));
    this.globalParamHandlers.set("ikedaGlobalReverbAmount", this.setGlobalReverbAmount.bind(this));
    this.globalParamHandlers.set("defaultGlobalReverbAmount", this.setGlobalReverbAmount.bind(this));
  }

  /**
   * Initialize the audio context and set up the audio graph
   */
  public async initializeAudioContext(): Promise<void> {
    this.log("[INIT_AUDIO] initializeAudioContext started.");

    try {
      // Create audio context if it doesn't exist
      if (!this.audioContext) {
        this.log("[INIT_AUDIO] Creating AudioContext...");
        this.audioContext = new (globalThis.AudioContext ||
          (globalThis as unknown as Window).webkitAudioContext)();
        this.log(
          `[INIT_AUDIO] Audio context created. State: ${this.audioContext.state}`,
        );

        // Create the master output chain first
        this.masterVolumeGain = this.audioContext.createGain();
        this.masterVolumeGain.gain.value = this.params.volume;
        this.masterVolumeGain.connect(this.audioContext.destination);
        this.log(
          `// DEBUG-AUDIO: AES.initializeAudioContext: Created masterVolumeGain with value ${this.params.volume} and connected to destination`,
        );

        // Create analyzer for visualizations (connect to master volume)
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 2048;
        this.analyserNode.connect(this.masterVolumeGain);
        this.log(
          "// DEBUG-AUDIO: AES.initializeAudioContext: Created analyserNode and connected to masterVolumeGain",
        );

        // Create a main mixer input node for connecting different engines
        this.mainMixerInput = this.audioContext.createGain();
        this.mainMixerInput.gain.value = 1.0; // Unity gain for mixer
        this.mainMixerInput.connect(this.analyserNode);
        this.log(
          "// DEBUG-AUDIO: AES.initializeAudioContext: Created mainMixerInput with value 1.0 and connected to analyserNode",
        );

        // Log audio path
        this.log(
          "// DEBUG-AUDIO: AES.initializeAudioContext: Audio path: engine output -> mainMixerInput -> analyserNode -> masterVolumeGain -> destination",
        );

        // Initialize the standard synth mode graph
        this.initializeStandardSynthGraph();

        // Load pink noise worklet for volume check
        await this.loadPinkNoiseWorklet();

        // Ensure audio context is running
        await this.resumeAudioContext();

        this.log(
          `// DEBUG-AUDIO: AES.initializeAudioContext: AudioContext initialized and running. State: ${this.audioContext.state}`,
        );
      } else if (this.audioContext.state === "suspended") {
        // If context exists but is suspended, resume it
        await this.resumeAudioContext();
      }
    } catch (error) {
      this.log(
        `// DEBUG-AUDIO: AES.initializeAudioContext: ERROR initializing audio context: ${error}`,
      );
      throw new AudioEngineError(
        `Failed to initialize audio context: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Initialize the standard synth mode audio graph
   */
  private initializeStandardSynthGraph(): void {
    this.log("// DEBUG-AUDIO: AES.initializeStandardSynthGraph: ENTERED");

    if (!this.audioContext || !this.analyserNode || !this.masterVolumeGain) {
      this.log(
        "// DEBUG-AUDIO: AES.initializeStandardSynthGraph: Missing required nodes, cannot initialize",
      );
      return;
    }

    // Create the filter node
    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = this.params.filterCutoff;
    this.filterNode.Q.value = this.params.filterResonance;

    // Connect filter to analyzer
    this.filterNode.connect(this.analyserNode);
    this.log(
      "// DEBUG-AUDIO: AES.initializeStandardSynthGraph: Connected filterNode to analyserNode",
    );

    // Create gain node
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0; // Start with gain at 0
    this.gainNode.connect(this.filterNode);
    this.log(
      "// DEBUG-AUDIO: AES.initializeStandardSynthGraph: Connected gainNode to filterNode",
    );

    // Set up vibrato LFO
    this.setupVibrato();

    // Initialize global reverb
    this.initializeGlobalReverb();

    // Log the audio connection state
    this.log(
      `// DEBUG-AUDIO: AES Init: mainMixerInput connected to analyserNode? ${!!this
        .mainMixerInput}`,
    );
    this.log(
      `// DEBUG-AUDIO: AES Init: analyserNode connected to masterVolumeGain? ${
        !!this.analyserNode && !!this.masterVolumeGain
      }`,
    );
    this.log(
      `// DEBUG-AUDIO: AES Init: masterVolumeGain connected to destination? ${!!this
        .masterVolumeGain}`,
    );
    this.log(
      `// DEBUG-AUDIO: AES Init: Initial masterVolumeGain.gain.value: ${this.masterVolumeGain.gain.value}`,
    );
    this.log("// DEBUG-AUDIO: AES.initializeStandardSynthGraph: EXITED");
  }

  /**
   * Initialize global reverb for use with all modes
   */
  private async initializeGlobalReverb(): Promise<void> {
    console.log("// URGENT_DEBUG: AES.initializeGlobalReverb: ENTERED");
    this.log("// URGENT_DEBUG: AES.initializeGlobalReverb: ENTERED");

    if (!this.audioContext || !this.analyserNode) {
      this.log(
        "Cannot initialize global reverb: AudioContext or AnalyserNode not available",
      );
      return;
    }

    try {
      // Create reverb nodes
      this.globalReverb = this.audioContext.createConvolver();
      this.reverbWetGain = this.audioContext.createGain();
      this.reverbDryGain = this.audioContext.createGain();

      // Set initial gain values for 0% reverb (0 wet, 100% dry)
      // This ensures reverb is off by default until explicitly set by parameters.
      this.reverbWetGain.gain.value = 0.0; // Corresponds to sin(0 * Math.PI / 2) for 0 amount
      this.reverbDryGain.gain.value = 1.0; // Corresponds to cos(0 * Math.PI / 2) for 0 amount

      // Connect reverb to wet gain, then to analyzer
      this.globalReverb.connect(this.reverbWetGain);
      this.reverbWetGain.connect(this.analyserNode);

      // Connect dry gain directly to analyzer
      this.reverbDryGain.connect(this.analyserNode);

      // Try to load impulse response from file
      try {
        const response = await fetch("/R1NuclearReactorHall.m4a");
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(
          arrayBuffer,
        );

        this.globalReverb.buffer = audioBuffer;
        this.log(
          "Global reverb: Loaded impulse response from R1NuclearReactorHall.m4a",
        );
      } catch (error) {
        this.log(`Error loading impulse response file: ${error}`);

        // Create synthetic impulse response as fallback
        const sampleRate = this.audioContext.sampleRate;
        const decay = 2.0; // 2 second decay
        const numSamples = Math.ceil(sampleRate * decay);
        const impulseBuffer = this.audioContext.createBuffer(
          2,
          numSamples,
          sampleRate,
        );

        // Fill both channels with exponentially decaying noise
        for (let channel = 0; channel < 2; channel++) {
          const channelData = impulseBuffer.getChannelData(channel);
          for (let i = 0; i < numSamples; i++) {
            // Random noise with exponential decay
            channelData[i] = (Math.random() * 2 - 1) *
              Math.exp(-i / (sampleRate * decay / 6));
          }
        }

        this.globalReverb.buffer = impulseBuffer;
        this.log(
          "Global reverb: Created synthetic impulse response as fallback",
        );
      }

      this.log("Global reverb initialized successfully");
    } catch (error) {
      this.log(`Failed to initialize global reverb: ${error}`);
    }

    console.log("// URGENT_DEBUG: AES.initializeGlobalReverb: EXITED");
    this.log("// URGENT_DEBUG: AES.initializeGlobalReverb: EXITED");
  }

  /**
   * Resume the audio context if it's suspended
   */
  public async resumeAudioContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
        this.log(`Audio context resumed. State: ${this.audioContext.state}`);
      } catch (error) {
        throw new AudioEngineError(
          `Failed to resume audio context: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Set the current audio engine mode
   */
  public setMode(
    newMode: ControllerMode,
    initialParams?: Record<string, any>,
  ): void {
    this.log(
      `[DEBUG_MODE_CHANGE] AudioEngineService.setMode: newMode=${newMode}, previous activeMode=${this.activeMode}`,
    );

    if (this.activeMode === newMode && this.currentModeEngine) {
      this.log(
        `AudioEngineService: Already in mode: ${newMode}. Re-applying initial params if provided.`,
      );
      // Optionally re-initialize or update params if needed for the current engine
      if (this.currentModeEngine && initialParams) {
        // Apply any initial parameters to the existing engine
        for (const [paramId, value] of Object.entries(initialParams)) {
          this.updateParameter(paramId, value);
        }
      }
      return;
    }

    this.log(
      `AudioEngineService: Switching mode from ${this.activeMode} to ${newMode}.`,
    );

    // 1. Cleanup existing engine
    if (this.currentModeEngine) {
      this.currentModeEngine.cleanup(); // IkedaModeMVPEngine uses cleanup() instead of dispose()
      this.log(
        `AudioEngineService: Cleaned up previous engine for mode ${this.activeMode}.`,
      );
      this.currentModeEngine = null;
    }

    // 2. Instantiate and initialize new engine based on newMode
    this.activeMode = newMode;
    this.log(
      `[DEBUG_MODE_CHANGE] AudioEngineService.setMode: this.activeMode is now ${this.activeMode}`,
    );

    try {
      // EXTREME MEASURE: Always use IkedaModeMVPEngine for ALL modes
      // This avoids the recursion bug in the DefaultModeEngine
      if (!this.audioContext) {
        throw new Error("Audio context not initialized");
      }

      this.log(
        `// EXTREME_MEASURE: AES.setMode: Using IkedaModeMVPEngine for ALL modes.`,
      );
      this.log(`// EXTREME_MEASURE: AES.setMode: current mode is ${newMode}`);

      // === PRE-INSTANTIATION DEBUG LOG ===
      const audioContextState = this.audioContext ? this.audioContext.state : "null or undefined";
      this.log(`AES.setMode: PRE-IkedaModeMVPEngine instantiation. AudioContext state: ${audioContextState}. Attempting to pass logger.`);
      // Test the this.log function directly here to ensure it's working before being passed
      this.log("AES.setMode: Direct log test before engine instantiation SUCCESSFUL.");
      // === END PRE-INSTANTIATION DEBUG LOG ===

      // Create analyzer node destination for the engine if needed
      if (!this.analyserNode) {
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 2048;

        if (this.masterVolumeGain) {
          this.analyserNode.connect(this.masterVolumeGain);
        } else {
          this.analyserNode.connect(this.audioContext.destination);
        }
      }

      // CRITICAL: Always use IkedaModeMVPEngine regardless of mode
      this.currentModeEngine = new IkedaModeMVPEngine(
        this.audioContext,
        (logMessage: string) => {
          // === LOGGER PASSED TO IKEDA ENGINE - TEST CALL ===
          console.log(`AES: Logger for IkedaMVPEngine called with: ${logMessage}`);
          // === END LOGGER TEST CALL ===
          this.log(`IkedaMVPEngine(${newMode}): ${logMessage}`);
        },
        initialParams || {},
      );
      this.log(
        `AudioEngineService: IkedaModeMVPEngine INSTANTIATED for mode ${newMode}.`,
      );
      this.connectCurrentEngineOutput();
      this.isCurrentModeVolumeCheckPending = true; // Always start with volume check

      // Notify useAudioEngine about volume check state
      if (this.onEngineStateChangeCallback) {
        this.onEngineStateChangeCallback({ isVolumeCheckPending: true });
      }

      // Apply any initial parameters if provided
      if (initialParams) {
        for (const [paramId, value] of Object.entries(initialParams)) {
          this.updateParameter(paramId, value);
        }
      }
    } catch (error) {
      this.log(
        `AudioEngineService: Error initializing engine for mode ${newMode}: ${error}`,
      );
      console.error(`Error initializing engine for mode ${newMode}:`, error);

      // Revert to IKEDA mode on error
      this.log(
        `AudioEngineService: Error occurred, defaulting to IKEDA mode (MVP)`,
      );
      this.activeMode = KNOWN_CONTROLLER_MODES.IKEDA;

      // Try to initialize the IkedaModeMVPEngine
      try {
        if (this.audioContext) {
          this.currentModeEngine = new IkedaModeMVPEngine(
            this.audioContext,
            (logMessage: string) =>
              this.log(`IkedaMVPEngine(recovery): ${logMessage}`),
            {}, // Default params
          );
          this.log(
            `AudioEngineService: IkedaModeMVPEngine initialized after error recovery`,
          );
          this.connectCurrentEngineOutput();
          this.isCurrentModeVolumeCheckPending = true;
          if (this.onEngineStateChangeCallback) {
            this.onEngineStateChangeCallback({ isVolumeCheckPending: true });
          }
        } else {
          this.currentModeEngine = null;
        }
      } catch (engineError) {
        this.log(
          `AudioEngineService: Could not initialize IkedaModeMVPEngine during error recovery: ${engineError}`,
        );
        this.currentModeEngine = null;
      }
    }
  }

  /**
   * Set up the vibrato oscillator
   */
  private setupVibrato(): void {
    if (!this.audioContext) return;

    this.vibratoOsc = this.audioContext.createOscillator();
    this.vibratoOsc.type = "sine";
    this.vibratoOsc.frequency.value = this.params.vibratoRate;

    this.vibratoGain = this.audioContext.createGain();
    // Calculate vibrato amount based on semitone width
    const semitoneRatio = Math.pow(2, 1 / 12);
    const semitoneAmount = this.params.vibratoWidth / 100;
    const baseFreq = 440; // Reference frequency
    const vibratoAmount = baseFreq *
      (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);
    this.vibratoGain.gain.value = vibratoAmount;

    this.vibratoOsc.connect(this.vibratoGain);
    this.vibratoOsc.start();
  }

  /**
   * Load the pink noise processor worklet
   */
  private async loadPinkNoiseWorklet(): Promise<void> {
    if (!this.audioContext || this.workletLoaded) return;

    try {
      await this.audioContext.audioWorklet.addModule(
        "/ridge_rat_type2_pink_noise_processor.js",
      );
      this.workletLoaded = true;
      this.log("Pink noise worklet loaded successfully");
    } catch (error) {
      this.log(
        `Failed to load pink noise worklet: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Continue without pink noise functionality
    }
  }

  /**
   * Start the pink noise for volume check
   */
  public startPinkNoise(gain: number = 0.2): void {
    if (!this.audioContext || !this.workletLoaded) {
      throw new AudioEngineError("Audio context or worklet not initialized");
    }

    try {
      // Stop any existing pink noise
      this.stopPinkNoise();

      // Create and connect the new pink noise node
      this.pinkNoiseNode = new AudioWorkletNode(
        this.audioContext,
        "ridge-rat-type2-pink-noise-generator",
      );
      this.pinkNoiseGain = this.audioContext.createGain();
      this.pinkNoiseGain.gain.value = gain;

      this.pinkNoiseNode.connect(this.pinkNoiseGain);

      // Connect to analyzer and master volume
      if (this.analyserNode) {
        this.pinkNoiseGain.connect(this.analyserNode);
      } else if (this.masterVolumeGain) {
        this.pinkNoiseGain.connect(this.masterVolumeGain);
      } else {
        this.pinkNoiseGain.connect(this.audioContext.destination);
      }

      this.log("Pink noise started for volume check");
    } catch (error) {
      throw new AudioEngineError(
        `Failed to start pink noise: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Stop the pink noise
   */
  public stopPinkNoise(): void {
    if (this.pinkNoiseNode) {
      try {
        // Ramp down gain to avoid clicks
        if (this.pinkNoiseGain && this.audioContext) {
          const currentGain = this.pinkNoiseGain.gain.value;
          this.pinkNoiseGain.gain.setValueAtTime(
            currentGain,
            this.audioContext.currentTime,
          );
          this.pinkNoiseGain.gain.linearRampToValueAtTime(
            0.0001,
            this.audioContext.currentTime + 0.1,
          );
        }

        // Disconnect after a short delay
        setTimeout(() => {
          if (this.pinkNoiseNode) {
            this.pinkNoiseNode.disconnect();
            this.pinkNoiseNode = null;
          }
          if (this.pinkNoiseGain) {
            this.pinkNoiseGain.disconnect();
            this.pinkNoiseGain = null;
          }
        }, 150);

        this.log("Pink noise stopped");
      } catch (error) {
        this.log(
          `Error stopping pink noise: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Set pink noise as set up (completed initial volume check)
   */
  public setPinkNoiseSetupDone(done: boolean): void {
    this.pinkNoiseSetupDone = done;
  }

  /**
   * Check if pink noise setup is complete
   */
  public isPinkNoiseSetupDone(): boolean {
    return this.pinkNoiseSetupDone;
  }

  /**
   * Update a parameter value - routes to appropriate engine based on mode
   */
  public updateParameter(paramId: string, value: unknown): void {
    this.log(
      `AES.updateParameter: Received paramId='${paramId}', value='${
        String(value)
      }', activeMode='${this.activeMode}'`,
    );

    // Check global parameter handlers first
    const globalHandler = this.globalParamHandlers.get(paramId);
    if (globalHandler) {
      globalHandler(value);
      return;
    }

    // Forward recognized MVP params to IkedaModeMVPEngine (for all modes)
    if (this.currentModeEngine) {
      // List of params handled by IkedaModeMVPEngine for the MVP
      const ikedaMVPParams = [
        "ikedaGlobalOnOff",
        "defaultGlobalOnOff",
        "ikedaPinkNoiseLevel",
        "ikedaVolumeCheckLevel",
      ];

      // EXTREME MEASURE: Translate DEFAULT mode parameters to IKEDA mode parameters
      let effectiveParamId = paramId;
      if (paramId === "defaultGlobalOnOff") {
        effectiveParamId = "ikedaGlobalOnOff";
        this.log(
          `EXTREME_MEASURE: Translating defaultGlobalOnOff to ikedaGlobalOnOff`,
        );
      }

      if (
        ikedaMVPParams.includes(paramId) || paramId === "basic.active" ||
        paramId === "defaultActive"
      ) {
        // Ensure the parameter is in a format the engine can handle
        let finalParamId = effectiveParamId;
        if (paramId === "basic.active" || paramId === "defaultActive") {
          finalParamId = "ikedaGlobalOnOff";
          this.log(
            `EXTREME_MEASURE: Translating ${paramId} to ikedaGlobalOnOff`,
          );
        }

        this.log(
          `AES.updateParameter: Forwarding to IkedaModeMVPEngine: ID='${finalParamId}'`,
        );
        this.currentModeEngine.updateParam(finalParamId, value);
      } else {
        this.log(
          `AES.updateParameter: Param '${paramId}' not specifically handled by IkedaModeMVPEngine in current MVP scope.`,
        );
      }

      // Special handling for basic volume parameter (if not handled as global volume)
      if (paramId === "basic.volume" || paramId === "defaultMasterVolume") {
        if (this.masterVolumeGain && this.audioContext) {
          const volume = typeof value === "number"
            ? value
            : parseFloat(String(value));
          if (!isNaN(volume)) {
            this.masterVolumeGain.gain.setTargetAtTime(
              volume,
              this.audioContext.currentTime,
              0.01,
            );
            this.log(
              `AES: Set master volume to ${volume} via parameter ${paramId}`,
            );
          }
        }
      }

      // Handle global tempo if needed
      if (
        paramId === "basic.tempo" || paramId === "defaultTempo" ||
        paramId === "global_tempo"
      ) {
        this.log(`Setting global tempo to ${value} (ignored in Ikeda MVP)`);
      }
    } else if (!this.currentModeEngine) {
      this.log(
        `Cannot update parameter ${paramId}: No engine initialized for mode '${this.activeMode}'`,
      );

      // Attempt to initialize engine for current mode
      if (this.audioContext) {
        try {
          // EXTREME MEASURE: Always use IkedaModeMVPEngine
          this.log(
            `Attempting to initialize IkedaModeMVPEngine to handle parameter ${paramId}`,
          );
          this.currentModeEngine = new IkedaModeMVPEngine(
            this.audioContext,
            (message) => this.log(message),
          );
          this.connectCurrentEngineOutput();

          // Now try to forward the parameter
          this.updateParameter(paramId, value);
        } catch (error) {
          this.log(`Failed to initialize IkedaModeMVPEngine: ${error}`);
        }
      }
    }
  }

  private setGlobalMasterVolume(value: unknown): void {
    if (this.masterVolumeGain && this.audioContext) {
      const volume = typeof value === "number"
        ? value
        : parseFloat(String(value));
      if (!isNaN(volume)) {
        this.masterVolumeGain.gain.setTargetAtTime(
          volume,
          this.audioContext.currentTime,
          0.015, // Slightly slower for smoother transitions
        );
        this.log(`AES: Set master volume to ${volume}`);
      } else {
        this.log(`AES: Invalid value for master volume: ${String(value)}`);
      }
    } else {
      this.log("AES: Master volume gain node or audio context not available for setGlobalMasterVolume.");
    }
  }

  private setGlobalReverbAmount(value: unknown): void {
    this.log(
      `AES: Handling global reverb amount. Value: ${String(value)}`,
    );

    const reverbAmount = typeof value === "number"
      ? value
      : parseFloat(String(value));

    if (!isNaN(reverbAmount) && this.audioContext) {
      if (this.reverbWetGain && this.reverbDryGain) {
        this.log(
          `AES: Updating gain values for global reverb. reverbAmount: ${reverbAmount}`,
        );
        const wetGain = Math.sin(reverbAmount * Math.PI / 2);
        const dryGain = Math.cos(reverbAmount * Math.PI / 2);

        this.reverbWetGain.gain.setTargetAtTime(
          wetGain,
          this.audioContext.currentTime,
          0.05,
        );
        this.reverbDryGain.gain.setTargetAtTime(
          dryGain,
          this.audioContext.currentTime,
          0.05,
        );
        this.log(
          `AES: Set global reverb mix: wet=${wetGain.toFixed(2)}, dry=${dryGain.toFixed(2)}`,
        );
      } else {
        this.log("AES: Reverb wet/dry gain nodes not available for setGlobalReverbAmount.");
      }
    } else {
      this.log(
        `AES: Invalid value for reverb amount or audio context not available: ${String(value)}`,
      );
    }
  }

  /**
   * Handle oscillatorEnabled parameter
   */
  private handleOscillatorEnabled(enabled: boolean): void {
    if (enabled) {
      this.noteOn(this.params.frequency);
    } else {
      this.noteOff();
    }
  }

  /**
   * Play a note with the given frequency (with attack envelope)
   */
  public noteOn(frequency: number, forceTrigger: boolean = false): void {
    if (!this.audioContext || this.isMuted) {
      this.log(
        `Cannot play note - audio context ${
          !this.audioContext ? "not initialized" : "muted"
        }`,
      );
      return;
    }

    this.log(`Playing note at ${frequency}Hz`);

    // Update the frequency parameter
    this.setFrequency(frequency);

    // Setup a new oscillator if needed
    if (!this.oscillator || forceTrigger) {
      if (this.oscillator) {
        // If there's an existing oscillator, disconnect and stop it
        this.oscillator.disconnect();
        this.oscillator.stop();
      }

      // Create a new oscillator
      this.oscillator = this.audioContext.createOscillator();
      this.oscillator.type = this.params.waveform;
      this.oscillator.frequency.value = this.params.frequency;
      this.oscillator.detune.value = this.params.detune;

      // Connect oscillator to the gain node
      this.oscillator.connect(this.gainNode!);

      // If vibrato is enabled, connect the vibrato
      if (this.vibratoGain && this.params.vibratoWidth > 0) {
        this.vibratoGain.connect(this.oscillator.frequency);
      }

      // Start the oscillator
      this.oscillator.start();
    } else {
      // Just update the frequency if oscillator exists
      const portamentoTime = this.params.portamentoTime;
      if (portamentoTime > 0) {
        // Use exponential ramp for frequency changes (sounds more natural)
        this.oscillator.frequency.exponentialRampToValueAtTime(
          frequency,
          this.audioContext.currentTime + portamentoTime,
        );
      } else {
        this.oscillator.frequency.setValueAtTime(
          frequency,
          this.audioContext.currentTime,
        );
      }
    }

    // Apply envelope - always start with gain at 0
    if (this.gainNode) {
      const now = this.audioContext.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(0, now);

      // Apply attack - ramp up to target volume
      const attackTime = this.params.attack;
      if (attackTime > 0) {
        this.gainNode.gain.linearRampToValueAtTime(
          this.params.volume,
          now + attackTime,
        );
      } else {
        // Immediate attack
        this.gainNode.gain.setValueAtTime(this.params.volume, now);
      }
    }

    this.isNoteActive = true;
  }

  /**
   * Stop the currently playing note (with release envelope)
   */
  public noteOff(): void {
    if (!this.audioContext || !this.gainNode || !this.isNoteActive) {
      return;
    }

    this.log("Stopping note");

    const releaseTime = this.params.release;
    const now = this.audioContext.currentTime;
    const currentGain = this.gainNode.gain.value;

    // Apply release envelope - ramp to zero
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(currentGain, now);

    if (releaseTime > 0) {
      this.gainNode.gain.linearRampToValueAtTime(0.0001, now + releaseTime);
    } else {
      // Immediate release
      this.gainNode.gain.setValueAtTime(0, now);
    }

    // Clean up oscillator after release
    if (releaseTime > 0 && this.oscillator) {
      setTimeout(() => {
        if (this.oscillator) {
          this.oscillator.disconnect();
          this.oscillator.stop();
          this.oscillator = null;
        }
      }, releaseTime * 1000 + 50); // Add a small buffer to ensure envelope completes
    } else if (this.oscillator) {
      // Immediate cleanup for no release time
      this.oscillator.disconnect();
      this.oscillator.stop();
      this.oscillator = null;
    }

    this.isNoteActive = false;
  }

  /**
   * Update a generic audio parameter
   */
  public updateAudioParam<T extends unknown>({
    paramName,
    newValue,
    audioNode = null,
    formatValue = String,
    unit = "",
    extraUpdates = null,
    rampTime = 0,
    useExponentialRamp = false,
  }: AudioParamUpdateOptions<T>): T {
    // Update the audio node if provided and audioContext exists
    if (audioNode && this.audioContext) {
      const now = this.audioContext.currentTime;

      // If ramping is enabled
      if (rampTime > 0) {
        // Cancel any scheduled parameter changes
        audioNode.cancelScheduledValues(now);

        // Set current value at current time to start the ramp from
        const currentValue = audioNode.value;
        audioNode.setValueAtTime(currentValue, now);

        // Use exponential ramp for frequency (must be > 0) or linear ramp otherwise
        if (
          useExponentialRamp && currentValue > 0 && (newValue as number) > 0
        ) {
          // Exponential ramps sound more natural for frequency changes
          audioNode.exponentialRampToValueAtTime(
            newValue as number,
            now + rampTime,
          );
        } else {
          // Linear ramp for other parameters or if values are zero/negative
          audioNode.linearRampToValueAtTime(newValue as number, now + rampTime);
        }
      } else {
        // Immediate change without ramping
        audioNode.setValueAtTime(newValue as number, now);
      }
    }

    // Perform any extra updates
    if (extraUpdates) {
      extraUpdates(newValue);
    }

    // Log the change
    const formattedValue = formatValue(newValue);
    const unitString = unit ? ` ${unit}` : "";
    this.log(`${paramName} updated to ${formattedValue}${unitString}`);

    return newValue;
  }

  /**
   * Set the oscillator frequency
   */
  public setFrequency(frequency: number): void {
    // Validate the frequency
    const validFrequency = PARAM_DESCRIPTORS.frequency.validate(frequency);
    this.params.frequency = validFrequency;
    this.currentNote = frequencyToNote(validFrequency);

    // Update the oscillator if it exists
    if (this.oscillator && this.audioContext) {
      this.updateAudioParam({
        paramName: "Frequency",
        newValue: validFrequency,
        audioNode: this.oscillator.frequency,
        unit: "Hz",
        rampTime: this.params.portamentoTime,
        useExponentialRamp: true,
      });
    }
  }

  /**
   * Set the oscillator waveform
   */
  public setWaveform(waveform: OscillatorType): void {
    const validWaveform = PARAM_DESCRIPTORS.waveform.validate(waveform);
    this.params.waveform = validWaveform;

    // Update the oscillator if it exists
    if (this.oscillator) {
      this.oscillator.type = validWaveform;
      this.log(`Waveform changed to ${validWaveform}`);
    }
  }

  /**
   * Set the gain/volume
   */
  public setVolume(volume: number): void {
    const validVolume = PARAM_DESCRIPTORS.volume.validate(volume);
    this.params.volume = validVolume;

    // Update master volume
    if (this.masterVolumeGain && this.audioContext) {
      this.updateAudioParam({
        paramName: "Master Volume",
        newValue: validVolume,
        audioNode: this.masterVolumeGain.gain,
        rampTime: 0.05, // Small ramp to avoid clicks
      });
    }

    // Update the gain node if it exists and note is active
    if (this.gainNode && this.audioContext && this.isNoteActive) {
      this.updateAudioParam({
        paramName: "Note Volume",
        newValue: validVolume,
        audioNode: this.gainNode.gain,
        rampTime: 0.05, // Small ramp to avoid clicks
      });
    }
  }

  /**
   * Set the oscillator detune
   */
  public setDetune(cents: number): void {
    const validDetune = PARAM_DESCRIPTORS.detune.validate(cents);
    this.params.detune = validDetune;

    // Update the oscillator if it exists
    if (this.oscillator) {
      this.updateAudioParam({
        paramName: "Detune",
        newValue: validDetune,
        audioNode: this.oscillator.detune,
        unit: "cents",
        formatValue: (val) => val > 0 ? `+${val}` : String(val),
      });
    }
  }

  /**
   * Set the attack time
   */
  public setAttack(attackTime: number): void {
    const validAttack = PARAM_DESCRIPTORS.attack.validate(attackTime);
    this.params.attack = validAttack;

    this.log(`Attack time set to ${validAttack}s`);
  }

  /**
   * Set the release time
   */
  public setRelease(releaseTime: number): void {
    const validRelease = PARAM_DESCRIPTORS.release.validate(releaseTime);
    this.params.release = validRelease;

    this.log(`Release time set to ${validRelease}s`);
  }

  /**
   * Set the filter cutoff frequency
   */
  public setFilterCutoff(cutoff: number): void {
    const validCutoff = PARAM_DESCRIPTORS.filterCutoff.validate(cutoff);
    this.params.filterCutoff = validCutoff;

    // Update the filter if it exists
    if (this.filterNode) {
      this.updateAudioParam({
        paramName: "Filter Cutoff",
        newValue: validCutoff,
        audioNode: this.filterNode.frequency,
        unit: "Hz",
        rampTime: 0.05, // Small ramp for smooth changes
        useExponentialRamp: true,
      });
    }
  }

  /**
   * Set the filter resonance (Q)
   */
  public setFilterResonance(resonance: number): void {
    const validResonance = PARAM_DESCRIPTORS.filterResonance.validate(
      resonance,
    );
    this.params.filterResonance = validResonance;

    // Update the filter if it exists
    if (this.filterNode) {
      this.updateAudioParam({
        paramName: "Filter Resonance",
        newValue: validResonance,
        audioNode: this.filterNode.Q,
        rampTime: 0.05, // Small ramp for smooth changes
      });
    }
  }

  /**
   * Set the vibrato rate
   */
  public setVibratoRate(rate: number): void {
    const validRate = PARAM_DESCRIPTORS.vibratoRate.validate(rate);
    this.params.vibratoRate = validRate;

    // Update the vibrato oscillator if it exists
    if (this.vibratoOsc) {
      this.updateAudioParam({
        paramName: "Vibrato Rate",
        newValue: validRate,
        audioNode: this.vibratoOsc.frequency,
        unit: "Hz",
        rampTime: 0.05,
      });
    }
  }

  /**
   * Set the vibrato width
   */
  public setVibratoWidth(width: number): void {
    const validWidth = PARAM_DESCRIPTORS.vibratoWidth.validate(width);
    this.params.vibratoWidth = validWidth;

    // Calculate vibrato amount based on semitone width
    if (this.vibratoGain && this.audioContext) {
      const semitoneRatio = Math.pow(2, 1 / 12);
      const semitoneAmount = validWidth / 100;
      const baseFreq = 440; // Reference frequency
      const vibratoAmount = baseFreq *
        (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);

      this.updateAudioParam({
        paramName: "Vibrato Width",
        newValue: vibratoAmount,
        audioNode: this.vibratoGain.gain,
        unit: "cents",
        formatValue: () => String(validWidth),
        rampTime: 0.05,
      });

      // Connect/disconnect vibrato based on width
      if (this.oscillator) {
        try {
          if (validWidth > 0) {
            // Connect vibrato if width is greater than 0
            this.vibratoGain.connect(this.oscillator.frequency);
          } else {
            // Disconnect vibrato if width is 0
            this.vibratoGain.disconnect(this.oscillator.frequency);
          }
        } catch (error) {
          // Handle errors (usually happens when trying to connect already connected nodes)
          // or disconnect from disconnected nodes
          this.log(
            `Vibrato connection error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  /**
   * Set the portamento time
   */
  public setPortamentoTime(time: number): void {
    const validTime = PARAM_DESCRIPTORS.portamentoTime.validate(time);
    this.params.portamentoTime = validTime;

    this.log(`Portamento time set to ${validTime}s`);
  }

  /**
   * Play a note by name (e.g., "A4")
   */
  public playNoteByName(note: string): void {
    // Get the frequency for this note from our mapping
    const noteFrequency = noteToFrequency(note);

    // Update the note display
    this.currentNote = note;

    // Play the note at the calculated frequency
    this.noteOn(noteFrequency);

    this.log(`Playing note ${note} (${noteFrequency}Hz)`);
  }

  /**
   * Set mute state
   */
  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.log(`Audio ${muted ? "muted" : "unmuted"}`);

    // If unmuting and a note was active, restore it
    if (!muted && this.isNoteActive) {
      this.noteOn(this.params.frequency);
    }
  }

  /**
   * Get current mute state
   */
  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Is a note currently active?
   */
  public getIsNoteActive(): boolean {
    return this.isNoteActive;
  }

  /**
   * Get the current audio context state
   */
  public getAudioContextState(): string | null {
    return this.audioContext ? this.audioContext.state : null;
  }

  /**
   * Check if audio context exists
   */
  public hasAudioContext(): boolean {
    return !!this.audioContext;
  }

  /**
   * Get all current synth parameters
   */
  public getParams(): SynthParams {
    return { ...this.params };
  }

  /**
   * Get current note name
   */
  public getCurrentNote(): string {
    return this.currentNote;
  }

  /**
   * Get current controller mode
   */
  public getActiveMode(): ControllerMode | null {
    return this.activeMode;
  }

  /**
   * Get FFT data for visualizations
   */
  public getFFTData(): Uint8Array | null {
    if (!this.analyserNode) return null;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Get waveform data for visualizations
   */
  public getWaveformData(): Uint8Array | null {
    if (!this.analyserNode) return null;

    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(dataArray);
    return dataArray;
  }

  /**
   * Clean up resources
   */
  public close(): void {
    // Stop any active sound
    this.noteOff();
    this.stopPinkNoise();

    // Clean up default mode engine if active
    if (this.currentModeEngine) {
      this.currentModeEngine.dispose();
      this.currentModeEngine = null;
    }

    // Clean up audio nodes
    if (this.vibratoOsc) {
      this.vibratoOsc.stop();
      this.vibratoOsc.disconnect();
      this.vibratoOsc = null;
    }

    if (this.vibratoGain) {
      this.vibratoGain.disconnect();
      this.vibratoGain = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.filterNode) {
      this.filterNode.disconnect();
      this.filterNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.masterVolumeGain) {
      this.masterVolumeGain.disconnect();
      this.masterVolumeGain = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.log("Audio engine closed");
  }

  /**
   * Internal logging helper
   */
  private log(message: string): void {
    if (this.logCallback) {
      this.logCallback(message);
    }
  }

  /**
   * Connect the current engine's output to the main mixer
   */
  private connectCurrentEngineOutput(): void {
    this.log(
      `// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Called for activeMode='${this.activeMode}'.`,
    );

    if (
      !this.currentModeEngine ||
      typeof (this.currentModeEngine as any).getOutputNode !== "function"
    ) {
      this.log(
        "// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Current mode engine or its getOutputNode method IS MISSING.",
      );
      return;
    }

    try {
      const ikedaEngine = this.currentModeEngine as IkedaModeMVPEngine;
      const outputNode = ikedaEngine.getOutputNode();

      this.log(
        `// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Engine is type: ${this.currentModeEngine.constructor.name}`,
      );

      if (!outputNode) {
        this.log(
          "// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Engine output node is NULL or UNDEFINED.",
        );
        return;
      }

      this.log(
        `// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Got engineOutputNode. mainMixerInput: ${!!this
          .mainMixerInput}, analyserNode: ${!!this
          .analyserNode}, masterVolumeGain: ${!!this.masterVolumeGain}`,
      );

      // Connect to the global reverb wet/dry split if available
      if (this.globalReverb && this.reverbWetGain && this.reverbDryGain) {
        // Connect engine output to both the dry path and the reverb (wet) path
        outputNode.connect(this.reverbDryGain);
        outputNode.connect(this.globalReverb);
        this.log(
          "// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Successfully connected IkedaModeMVPEngine output to global reverb wet/dry paths",
        );
      } // Fallback to direct connection if reverb not available
      else if (this.mainMixerInput) {
        outputNode.connect(this.mainMixerInput);
        this.log(
          "// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Successfully connected IkedaModeMVPEngine output to main mixer (reverb not available)",
        );
      } // Last resort - connect directly to analyzer
      else if (this.analyserNode) {
        outputNode.connect(this.analyserNode);
        this.log(
          "// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Successfully connected IkedaModeMVPEngine output directly to analyzer (no reverb or mixer available)",
        );
      } else {
        this.log(
          "// DEBUG-AUDIO: AES.connectCurrentEngineOutput: WARNING - Could not connect engine output - no valid destination available!",
        );
      }

      // Print audio context state
      if (this.audioContext) {
        this.log(
          `// DEBUG-AUDIO: AES.connectCurrentEngineOutput: AudioContext state: ${this.audioContext.state}`,
        );
      }
    } catch (error) {
      this.log(
        `// DEBUG-AUDIO: AES.connectCurrentEngineOutput: Error connecting engine output: ${error}`,
      );
      console.error("Error connecting engine output in AES:", error);
    }
  }

  /**
   * Confirm volume check is complete and transition to full generative mode
   */
  public confirmVolumeCheckComplete(): void {
    // Verify the engine type for debugging
    if (this.currentModeEngine) {
      this.log(
        `// URGENT_DEBUG: confirmVolumeCheckComplete called, engine type: ${this.currentModeEngine.constructor.name}`,
      );
    }

    // EXTREME MEASURE: Always use IkedaModeMVPEngine for all modes
    if (this.currentModeEngine) {
      this.log(
        `AES: Volume check confirmed by UI. Activating full generative engine for ${this.activeMode} mode.`,
      );

      // Always using IkedaModeMVPEngine regardless of mode
      this.currentModeEngine.activateFullGenerativeMode();
      this.isCurrentModeVolumeCheckPending = false;

      // Notify useAudioEngine that volume check is done for UI updates
      if (this.onEngineStateChangeCallback) {
        this.onEngineStateChangeCallback({ isVolumeCheckPending: false });
      }
    } else {
      this.log(
        "AES: confirmVolumeCheckComplete called but no engine is available. Attempting to create one.",
      );

      // Try to create an engine if one doesn't exist
      if (this.audioContext) {
        try {
          this.log(`AES: Creating IkedaModeMVPEngine on demand.`);

          this.currentModeEngine = new IkedaModeMVPEngine(
            this.audioContext,
            (logMessage: string) =>
              this.log(`IkedaMVPEngine(late): ${logMessage}`),
            {}, // Default params
          );

          this.connectCurrentEngineOutput();
          this.currentModeEngine.activateFullGenerativeMode();
          this.isCurrentModeVolumeCheckPending = false;

          if (this.onEngineStateChangeCallback) {
            this.onEngineStateChangeCallback({ isVolumeCheckPending: false });
          }
        } catch (error) {
          this.log(`Error creating engine on demand: ${error}`);
        }
      }
    }
  }

  /**
   * Get current volume check pending state
   */
  public getIsVolumeCheckPending(): boolean {
    return this.isCurrentModeVolumeCheckPending;
  }
}
