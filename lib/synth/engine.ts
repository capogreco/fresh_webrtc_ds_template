/**
 * Web Audio synthesizer engine
 * Implements the audio processing for the synthesizer
 */

import { SynthParams, DEFAULT_SYNTH_PARAMS } from "./index.ts";

/**
 * Synthesizer engine that manages Web Audio nodes
 */
export class SynthEngine {
  // Audio context and nodes
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private vibratoOsc: OscillatorNode | null = null;
  private vibratoGain: GainNode | null = null;

  // Current parameters
  private params: SynthParams = { ...DEFAULT_SYNTH_PARAMS };
  
  // Audio state
  private isMuted = true;
  private isInitialized = false;
  
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
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
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
    
    // Create filter node
    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = this.params.filterCutoff;
    this.filterNode.Q.value = this.params.filterResonance;
    
    // Create main gain node
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.params.volume;
    
    // Connect filter to gain and gain to destination
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);
    
    // Create vibrato components if needed
    this.setupVibrato();
    
    // Create oscillator if enabled
    if (this.params.oscillatorEnabled) {
      this.createOscillator();
    }
  }
  
  /**
   * Set up vibrato oscillator and gain
   */
  private setupVibrato(): void {
    if (!this.audioContext) return;
    
    // Create vibrato oscillator (LFO)
    this.vibratoOsc = this.audioContext.createOscillator();
    this.vibratoOsc.type = "sine";
    this.vibratoOsc.frequency.value = this.params.vibratoRate;
    
    // Create vibrato gain for depth control
    this.vibratoGain = this.audioContext.createGain();
    
    // Calculate vibrato amount
    const semitoneRatio = Math.pow(2, 1/12);
    const semitoneAmount = this.params.vibratoWidth / 100;
    const vibratoAmount = this.params.frequency * (Math.pow(semitoneRatio, semitoneAmount/2) - 1);
    
    // Set gain to 0 if vibrato is disabled
    this.vibratoGain.gain.value = (this.params.vibratoRate > 0 && this.params.vibratoWidth > 0) 
      ? vibratoAmount 
      : 0;
    
    // Connect vibrato oscillator to gain
    this.vibratoOsc.connect(this.vibratoGain);
    
    // Start the vibrato oscillator
    this.vibratoOsc.start();
  }
  
  /**
   * Create and start the main oscillator
   */
  private createOscillator(): void {
    if (!this.audioContext || !this.filterNode) return;
    
    // Create oscillator
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = this.params.waveform;
    this.oscillator.frequency.value = this.params.frequency;
    this.oscillator.detune.value = this.params.detune;
    
    // Connect vibrato to frequency if it exists
    if (this.vibratoGain && this.params.vibratoRate > 0 && this.params.vibratoWidth > 0) {
      this.vibratoGain.connect(this.oscillator.frequency);
    }
    
    // Connect oscillator to filter
    this.oscillator.connect(this.filterNode);
    
    // Start the oscillator
    this.oscillator.start();
  }
  
  /**
   * Stop and disconnect the main oscillator
   */
  private stopOscillator(): void {
    if (!this.oscillator) return;
    
    try {
      this.oscillator.stop();
      this.oscillator.disconnect();
      this.oscillator = null;
    } catch (error) {
      console.error("Error stopping oscillator:", error);
    }
  }
  
  /**
   * Update a single parameter
   */
  updateParameter<K extends keyof SynthParams>(
    paramName: K, 
    value: SynthParams[K]
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
        // These are used when oscillator is restarted
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
    } else {
      // If oscillator exists, stop it
      this.stopOscillator();
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
        now + this.params.portamentoTime
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
    this.gainNode.gain.setValueAtTime(this.params.volume, now);
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
    if (!this.vibratoOsc || !this.vibratoGain || !this.audioContext || !this.oscillator) return;
    
    const now = this.audioContext.currentTime;
    
    // Update vibrato rate
    this.vibratoOsc.frequency.setValueAtTime(this.params.vibratoRate, now);
    
    // Calculate vibrato amount based on current frequency and width
    const semitoneRatio = Math.pow(2, 1/12);
    const semitoneAmount = this.params.vibratoWidth / 100;
    const baseFreq = this.oscillator.frequency.value;
    const vibratoAmount = baseFreq * (Math.pow(semitoneRatio, semitoneAmount/2) - 1);
    
    // If both rate and width are > 0, connect and set amount
    if (this.params.vibratoRate > 0 && this.params.vibratoWidth > 0) {
      this.vibratoGain.gain.setValueAtTime(vibratoAmount, now);
      
      // Ensure connection
      try {
        this.vibratoGain.connect(this.oscillator.frequency);
      } catch (error) {
        // Ignore if already connected
      }
    } else {
      // Effectively disable vibrato by setting gain to 0
      this.vibratoGain.gain.setValueAtTime(0, now);
    }
  }
  
  /**
   * Get the current audio state
   */
  getAudioState(): { isMuted: boolean, state: string } {
    return {
      isMuted: this.isMuted,
      state: this.audioContext?.state || "suspended"
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
  }
}