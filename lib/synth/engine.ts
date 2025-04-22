/**
 * Web Audio synthesizer engine
 * Implements the audio processing for the synthesizer
 */

import { DEFAULT_SYNTH_PARAMS, SynthParams } from "./index.ts";

/**
 * Synthesizer engine that manages Web Audio nodes
 */
export class SynthEngine {
  // Audio context and nodes
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private envelopeGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private vibratoOsc: OscillatorNode | null = null;
  private vibratoGain: GainNode | null = null;

  // Current parameters
  private params: SynthParams = { ...DEFAULT_SYNTH_PARAMS };

  // Audio and note state
  private isMuted = true;
  private isInitialized = false;
  private noteState: "attack" | "sustain" | "release" | "off" = "off";
  private noteStartTime = 0;
  private scheduledReleaseTimeout: number | null = null;

  /**
   * Create a new SynthEngine instance
   */
  constructor() {
    // Nothing to do here - we'll initialize on demand
  }

  /**
   * Initialize the audio context and nodes
   * This must be called in response to a user gesture
   */
  initialize(): boolean {
    if (this.isInitialized) return true;

    try {
      // Create audio context
      this.audioContext =
        new (window.AudioContext || (window as any).webkitAudioContext)();

      // Create nodes (but don't connect them yet)
      this.setupAudioNodes();

      this.isInitialized = true;
      this.isMuted = false;

      return true;
    } catch (error) {
      console.error("Failed to initialize audio:", error);
      return false;
    }
  }

  /**
   * Create and configure audio nodes
   */
  private setupAudioNodes(): void {
    if (!this.audioContext) return;

    // Create the envelope gain node for amplitude control
    this.envelopeGain = this.audioContext.createGain();
    this.envelopeGain.gain.value = 0; // Start silent

    // Create filter node
    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = this.params.filterCutoff;
    this.filterNode.Q.value = this.params.filterResonance;

    // Create main gain node (for master volume)
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.params.volume;

    // Audio routing:
    // oscillator -> filter -> envelopeGain -> masterGain -> destination
    this.envelopeGain.connect(this.gainNode);
    this.filterNode.connect(this.envelopeGain);
    this.gainNode.connect(this.audioContext.destination);

    // Create vibrato components
    this.setupVibrato();

    // Create oscillator
    this.createOscillator();
  }

  /**
   * Set up vibrato oscillator and gain - always created regardless of initial params
   */
  private setupVibrato(): void {
    if (!this.audioContext) return;

    // Always create vibrato oscillator (LFO)
    this.vibratoOsc = this.audioContext.createOscillator();
    this.vibratoOsc.type = "sine";
    this.vibratoOsc.frequency.value = this.params.vibratoRate;

    // Always create vibrato gain
    this.vibratoGain = this.audioContext.createGain();

    // Calculate vibrato amount
    const vibratoAmount = this.calculateVibratoAmount(
      this.params.frequency,
      this.params.vibratoWidth,
    );

    // Set initial gain based on whether vibrato is enabled
    this.vibratoGain.gain.value =
      (this.params.vibratoRate > 0 && this.params.vibratoWidth > 0)
        ? vibratoAmount
        : 0;

    // Connect vibrato oscillator to gain
    this.vibratoOsc.connect(this.vibratoGain);

    // Start the vibrato oscillator
    this.vibratoOsc.start();
  }

  /**
   * Calculate the correct vibrato amount based on frequency and width in cents
   */
  private calculateVibratoAmount(
    frequency: number,
    widthInCents: number,
  ): number {
    // No vibrato if width is zero
    if (widthInCents === 0) return 0;

    // Convert cents to frequency ratio
    const centsRatio = Math.pow(2, widthInCents / 1200);

    // Calculate frequency deviation
    return frequency * (centsRatio - 1);
  }

  /**
   * Create and start the main oscillator
   */
  private createOscillator(): void {
    if (!this.audioContext || !this.filterNode) return;

    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = this.params.waveform;
    this.oscillator.frequency.value = this.params.frequency;
    this.oscillator.detune.value = this.params.detune;

    // Always connect vibrato (gain will be 0 if disabled)
    if (this.vibratoGain) {
      this.vibratoGain.connect(this.oscillator.frequency);
    }

    // Connect oscillator to filter
    this.oscillator.connect(this.filterNode);

    // Start the oscillator (it will run continuously)
    this.oscillator.start();
  }

  /**
   * Trigger a note-on event
   * @param frequency The note frequency in Hz
   */
  noteOn(frequency: number): void {
    if (!this.audioContext || !this.envelopeGain) return;

    const now = this.audioContext.currentTime;
    this.noteStartTime = now;

    // Clear any scheduled release timeout
    if (this.scheduledReleaseTimeout !== null) {
      clearTimeout(this.scheduledReleaseTimeout);
      this.scheduledReleaseTimeout = null;
    }

    // Update frequency (with portamento if enabled)
    this.updateParameter("frequency", frequency);

    // Set note state to attack
    this.noteState = "attack";

    // Apply attack envelope
    this.envelopeGain.gain.cancelScheduledValues(now);
    this.envelopeGain.gain.setValueAtTime(this.envelopeGain.gain.value, now);

    // Ramp up to full volume over attack time
    this.envelopeGain.gain.linearRampToValueAtTime(
      this.params.volume,
      now + this.params.attack,
    );

    // Schedule transition to sustain state
    setTimeout(() => {
      if (this.noteState === "attack") {
        this.noteState = "sustain";
      }
    }, this.params.attack * 1000);
  }

  /**
   * Trigger a note-off event
   */
  noteOff(): void {
    if (!this.audioContext || !this.envelopeGain || this.noteState === "off") {
      return;
    }

    const now = this.audioContext.currentTime;

    // Start release phase
    this.noteState = "release";

    // Apply release envelope
    this.envelopeGain.gain.cancelScheduledValues(now);
    this.envelopeGain.gain.setValueAtTime(this.envelopeGain.gain.value, now);

    // Ramp down to zero over release time
    this.envelopeGain.gain.linearRampToValueAtTime(
      0,
      now + this.params.release,
    );

    // Schedule transition to off state
    this.scheduledReleaseTimeout = setTimeout(() => {
      if (this.noteState === "release") {
        this.noteState = "off";
      }
    }, this.params.release * 1000) as unknown as number;
  }

  /**
   * Update a single parameter
   */
  updateParameter<K extends keyof SynthParams>(
    paramName: K,
    value: SynthParams[K],
  ): void {
    if (!this.isInitialized) return;

    // Store the validated value
    this.params[paramName] = value;

    // Apply the parameter to audio nodes
    switch (paramName) {
      case "oscillatorEnabled":
        this.applyOscillatorEnabled();
        break;

      case "frequency":
        this.applyFrequency();
        break;

      case "waveform":
        this.applyWaveform();
        break;

      case "volume":
        this.applyVolume();
        break;

      case "detune":
        this.applyDetune();
        break;

      case "filterCutoff":
      case "filterResonance":
        this.applyFilter();
        break;

      case "vibratoRate":
      case "vibratoWidth":
        this.applyVibrato();
        break;

      case "portamentoTime":
        // No action needed here - it's used in frequency changes
        break;

      case "attack":
      case "release":
        // These are used when notes are triggered
        break;
    }
  }

  /**
   * Apply oscillator enabled/disabled state
   */
  private applyOscillatorEnabled(): void {
    if (!this.audioContext) return;

    if (this.params.oscillatorEnabled) {
      // If oscillator doesn't exist, create it
      if (!this.oscillator) {
        this.createOscillator();
      }
      // Note: This doesn't trigger a note, it just ensures the oscillator exists
    } else {
      // Force note off if a note is playing
      if (this.noteState !== "off") {
        this.noteOff();
      }
    }
  }

  /**
   * Apply frequency change
   */
  private applyFrequency(): void {
    if (!this.oscillator || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    const currentFreq = this.oscillator.frequency.value;
    const newFreq = this.params.frequency;

    // Apply portamento if enabled
    if (this.params.portamentoTime > 0) {
      // Proper sequence for smooth automation:
      // 1. Cancel any scheduled automation first
      this.oscillator.frequency.cancelScheduledValues(now);

      // 2. Set current value at current time
      this.oscillator.frequency.setValueAtTime(currentFreq, now);

      // 3. Use exponential ramp for perceptually smooth pitch transition
      this.oscillator.frequency.exponentialRampToValueAtTime(
        newFreq,
        now + this.params.portamentoTime,
      );
    } else {
      // Instant frequency change
      this.oscillator.frequency.cancelScheduledValues(now);
      this.oscillator.frequency.setValueAtTime(newFreq, now);
    }

    // Update vibrato amount based on new frequency
    this.applyVibrato();
  }

  /**
   * Apply waveform change
   */
  private applyWaveform(): void {
    if (!this.oscillator) return;
    this.oscillator.type = this.params.waveform;
  }

  /**
   * Apply volume change
   */
  private applyVolume(): void {
    if (!this.gainNode || !this.audioContext) return;

    const now = this.audioContext.currentTime;

    // Update master volume
    this.gainNode.gain.setValueAtTime(this.params.volume, now);

    // If in sustain state, update envelope gain to match volume
    if (this.noteState === "sustain" && this.envelopeGain) {
      this.envelopeGain.gain.setValueAtTime(this.params.volume, now);
    }
  }

  /**
   * Apply detune change
   */
  private applyDetune(): void {
    if (!this.oscillator || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    this.oscillator.detune.setValueAtTime(this.params.detune, now);
  }

  /**
   * Apply filter changes
   */
  private applyFilter(): void {
    if (!this.filterNode || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    this.filterNode.frequency.setValueAtTime(this.params.filterCutoff, now);
    this.filterNode.Q.setValueAtTime(this.params.filterResonance, now);
  }

  /**
   * Apply vibrato changes
   */
  private applyVibrato(): void {
    if (
      !this.vibratoOsc || !this.vibratoGain || !this.audioContext ||
      !this.oscillator
    ) return;

    const now = this.audioContext.currentTime;

    // Update vibrato rate
    this.vibratoOsc.frequency.setValueAtTime(this.params.vibratoRate, now);

    // Calculate vibrato amount based on current frequency and width
    const baseFreq = this.oscillator.frequency.value;
    const vibratoAmount = this.calculateVibratoAmount(
      baseFreq,
      this.params.vibratoWidth,
    );

    // If both rate and width are > 0, set the amount
    if (this.params.vibratoRate > 0 && this.params.vibratoWidth > 0) {
      this.vibratoGain.gain.setValueAtTime(vibratoAmount, now);
    } else {
      // Otherwise, effectively disable vibrato by setting gain to 0
      this.vibratoGain.gain.setValueAtTime(0, now);
    }
  }

  /**
   * Get the current audio state
   */
  getAudioState(): { isMuted: boolean; state: string } {
    return {
      isMuted: this.isMuted,
      state: this.audioContext?.state || "suspended",
    };
  }

  /**
   * Resume the audio context if suspended
   */
  resumeAudio(): Promise<void> {
    if (!this.audioContext) return Promise.resolve();

    if (this.audioContext.state === "suspended") {
      return this.audioContext.resume();
    }

    return Promise.resolve();
  }

  /**
   * Suspend the audio context
   */
  suspendAudio(): Promise<void> {
    if (!this.audioContext) return Promise.resolve();

    if (this.audioContext.state === "running") {
      return this.audioContext.suspend();
    }

    return Promise.resolve();
  }

  /**
   * Clean up all audio resources
   */
  cleanup(): void {
    // Clear any scheduled timeouts
    if (this.scheduledReleaseTimeout !== null) {
      clearTimeout(this.scheduledReleaseTimeout);
      this.scheduledReleaseTimeout = null;
    }

    // Stop oscillator
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.oscillator = null;
    }

    // Stop vibrato oscillator
    if (this.vibratoOsc) {
      try {
        this.vibratoOsc.stop();
        this.vibratoOsc.disconnect();
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.vibratoOsc = null;
    }

    // Disconnect all nodes
    if (this.vibratoGain) {
      try {
        this.vibratoGain.disconnect();
      } catch (error) {
        // Ignore
      }
      this.vibratoGain = null;
    }

    if (this.filterNode) {
      try {
        this.filterNode.disconnect();
      } catch (error) {
        // Ignore
      }
      this.filterNode = null;
    }

    if (this.envelopeGain) {
      try {
        this.envelopeGain.disconnect();
      } catch (error) {
        // Ignore
      }
      this.envelopeGain = null;
    }

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch (error) {
        // Ignore
      }
      this.gainNode = null;
    }

    // Close audio context
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (error) {
        // Ignore
      }
      this.audioContext = null;
    }

    this.isInitialized = false;
    this.noteState = "off";
  }
}
