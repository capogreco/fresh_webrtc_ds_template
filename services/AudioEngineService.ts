import {
  DEFAULT_SYNTH_PARAMS,
  frequencyToNote,
  noteToFrequency,
  PARAM_DESCRIPTORS,
} from "../lib/synth/index.ts";

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
 * Service for managing the Web Audio API components and audio synthesis
 */
export class AudioEngineService {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private vibratoOsc: OscillatorNode | null = null;
  private vibratoGain: GainNode | null = null;
  
  // Pink noise for volume check
  private pinkNoiseNode: AudioWorkletNode | null = null;
  private pinkNoiseGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  
  // Audio state
  private isMuted: boolean = true;
  private isNoteActive: boolean = false;
  private workletLoaded: boolean = false;
  private pinkNoiseSetupDone: boolean = false;

  // Parameters
  private params: SynthParams;
  private currentNote: string;

  // Callback for logging
  private logCallback: (message: string) => void;

  constructor(
    logCallback: (message: string) => void = () => {},
    initialParams: Partial<SynthParams> = {}
  ) {
    this.logCallback = logCallback;
    this.params = {
      ...DEFAULT_SYNTH_PARAMS,
      ...initialParams
    };
    this.currentNote = frequencyToNote(this.params.frequency);
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
        this.log(`[INIT_AUDIO] Audio context created. State: ${this.audioContext.state}`);

        // Create the main audio nodes
        this.filterNode = this.audioContext.createBiquadFilter();
        this.filterNode.type = "lowpass";
        this.filterNode.frequency.value = this.params.filterCutoff;
        this.filterNode.Q.value = this.params.filterResonance;
        this.filterNode.connect(this.audioContext.destination);

        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0; // Start with gain at 0
        this.gainNode.connect(this.filterNode);

        // Create analyzer for visualizations
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 2048;
        this.gainNode.connect(this.analyserNode);
        
        // Set up vibrato LFO
        this.setupVibrato();

        // Load pink noise worklet for volume check
        await this.loadPinkNoiseWorklet();

        // Ensure audio context is running
        await this.resumeAudioContext();
      } else if (this.audioContext.state === "suspended") {
        // If context exists but is suspended, resume it
        await this.resumeAudioContext();
      }
    } catch (error) {
      throw new AudioEngineError(`Failed to initialize audio context: ${error instanceof Error ? error.message : String(error)}`);
    }
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
        throw new AudioEngineError(`Failed to resume audio context: ${error instanceof Error ? error.message : String(error)}`);
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
    const vibratoAmount = baseFreq * (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);
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
      await this.audioContext.audioWorklet.addModule("/ridge_rat_type2_pink_noise_processor.js");
      this.workletLoaded = true;
      this.log("Pink noise worklet loaded successfully");
    } catch (error) {
      this.log(`Failed to load pink noise worklet: ${error instanceof Error ? error.message : String(error)}`);
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
      this.pinkNoiseNode = new AudioWorkletNode(this.audioContext, "ridge-rat-type2-pink-noise-processor");
      this.pinkNoiseGain = this.audioContext.createGain();
      this.pinkNoiseGain.gain.value = gain;

      this.pinkNoiseNode.connect(this.pinkNoiseGain);
      this.pinkNoiseGain.connect(this.audioContext.destination);
      
      // Also connect to analyzer for visualization
      if (this.analyserNode) {
        this.pinkNoiseGain.connect(this.analyserNode);
      }

      this.log("Pink noise started for volume check");
    } catch (error) {
      throw new AudioEngineError(`Failed to start pink noise: ${error instanceof Error ? error.message : String(error)}`);
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
          this.pinkNoiseGain.gain.setValueAtTime(currentGain, this.audioContext.currentTime);
          this.pinkNoiseGain.gain.linearRampToValueAtTime(0.0001, this.audioContext.currentTime + 0.1);
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
        this.log(`Error stopping pink noise: ${error instanceof Error ? error.message : String(error)}`);
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
   * Play a note with the given frequency (with attack envelope)
   */
  public noteOn(frequency: number, forceTrigger: boolean = false): void {
    if (!this.audioContext || this.isMuted) {
      this.log(`Cannot play note - audio context ${!this.audioContext ? 'not initialized' : 'muted'}`);
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
          this.audioContext.currentTime + portamentoTime
        );
      } else {
        this.oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
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
          now + attackTime
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
        if (useExponentialRamp && currentValue > 0 && (newValue as number) > 0) {
          // Exponential ramps sound more natural for frequency changes
          audioNode.exponentialRampToValueAtTime(newValue as number, now + rampTime);
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

    // Update the gain node if it exists and note is active
    if (this.gainNode && this.audioContext && this.isNoteActive) {
      this.updateAudioParam({
        paramName: "Volume",
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
    const validResonance = PARAM_DESCRIPTORS.filterResonance.validate(resonance);
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
      const vibratoAmount = baseFreq * (Math.pow(semitoneRatio, semitoneAmount / 2) - 1);

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
        if (validWidth > 0 && !this.oscillator.frequency.numberOfInputs) {
          this.vibratoGain.connect(this.oscillator.frequency);
        } else if (validWidth === 0 && this.oscillator.frequency.numberOfInputs) {
          this.vibratoGain.disconnect(this.oscillator.frequency);
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
    this.log(`Audio ${muted ? 'muted' : 'unmuted'}`);

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
}