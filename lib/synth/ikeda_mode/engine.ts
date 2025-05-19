import { type IkedaModeMVPEngineParams } from "./types.ts";
import { IKEDA_MVP_ENGINE_DEFAULTS } from "./defaults.ts";

export class IkedaModeMVPEngine {
  private audioContext: AudioContext;
  private logger: (message: string) => void;
  private engineOutputGain: GainNode;
  
  private pinkNoiseSource: AudioBufferSourceNode | null = null;
  private pinkNoiseGain: GainNode;
  private pinkNoiseBuffer: AudioBuffer | null = null;
  
  private params: IkedaModeMVPEngineParams;
  private isGenerativeAudioActive = false; 
  private isVolumeCheckPending = true;

  constructor(
    audioContext: AudioContext,
    logger: (message: string) => void,
    initialParams?: Partial<IkedaModeMVPEngineParams>,
  ) {
    this.audioContext = audioContext;
    this.logger = (message: string) => logger(`[IkedaMVPEngine] ${message}`);
    
    // Add a distinct log message to identify this constructor
    this.logger("CONSTRUCTOR CALLED: IkedaModeMVPEngine (Simplified MVP)");
    console.log("CONSTRUCTOR CALLED: IkedaModeMVPEngine (Simplified MVP)");
    
    this.params = { ...IKEDA_MVP_ENGINE_DEFAULTS, ...(initialParams || {}) };
    this.logger(`Initialized. Initial params: ${JSON.stringify(this.params)}`);

    this.engineOutputGain = this.audioContext.createGain();
    this.pinkNoiseGain = this.audioContext.createGain();
    // Initialize gain according to initial ikedaGlobalOnOff and isVolumeCheckPending state
    const initialGain = this.isVolumeCheckPending ? this.params.ikedaVolumeCheckLevel : 
                       (this.params.ikedaGlobalOnOff ? this.params.ikedaPinkNoiseLevel : 0);
    this.pinkNoiseGain.gain.setValueAtTime(initialGain, this.audioContext.currentTime);
    
    this._generatePinkNoiseBufferAndSetup();
  }

  private async _generatePinkNoiseBufferAndSetup() {
    this.logger("// DEBUG-AUDIO: _generatePinkNoiseBufferAndSetup ENTERED");
    this.logger(`// DEBUG-AUDIO: AudioContext state is ${this.audioContext.state}`);
    
    if (this.audioContext.state === 'closed') {
        this.logger("AudioContext closed, cannot create buffer.");
        return;
    }
    
    const duration = 3; 
    const sampleRate = this.audioContext.sampleRate;
    const frameCount = sampleRate * duration;
    this.logger(`// DEBUG-AUDIO: Creating pink noise buffer with ${frameCount} frames (${duration}s) at ${sampleRate}Hz`);
    
    this.pinkNoiseBuffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const channelData = this.pinkNoiseBuffer.getChannelData(0);
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0; // Voss-McCartney approximation
    for (let i = 0; i < frameCount; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520; b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.0168980;
        channelData[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        channelData[i] *= 0.11; 
        b6 = white * 0.115926;
    }
    this.logger("Pink noise buffer generated successfully.");

    // Create and connect the pink noise source
    this.logger("// DEBUG-AUDIO: Creating and connecting pink noise source");
    this.pinkNoiseSource = this.audioContext.createBufferSource();
    this.pinkNoiseSource.buffer = this.pinkNoiseBuffer;
    this.pinkNoiseSource.loop = true;
    
    // Log connection path
    this.logger("// DEBUG-AUDIO: Connecting pinkNoiseSource -> pinkNoiseGain -> engineOutputGain");
    this.pinkNoiseSource.connect(this.pinkNoiseGain);
    this.pinkNoiseGain.connect(this.engineOutputGain);
    this.logger("// DEBUG-AUDIO: Pink noise audio path established");
    
    // Try to start the pink noise source
    try {
      if (this.audioContext.state === 'running') {
        this.pinkNoiseSource.start();
        this.logger(`// DEBUG-AUDIO: PinkNoiseSource started. AudioContext state: ${this.audioContext.state}. PinkNoiseGain value: ${this.pinkNoiseGain.gain.value}`);
      } else {
        this.logger(`// DEBUG-AUDIO: AudioContext not running (state=${this.audioContext.state}), PinkNoiseSource not started yet.`);
        
        // Attempt to start if context resumes later
        const startOnResume = () => {
            this.logger(`// DEBUG-AUDIO: AudioContext state changed to: ${this.audioContext.state}`);
            if(this.audioContext.state === 'running' && this.pinkNoiseSource && !this.pinkNoiseSource.context) {
                try { 
                    this.pinkNoiseSource.start(); 
                    this.logger(`// DEBUG-AUDIO: PinkNoiseSource started on context resume. PinkNoiseGain value: ${this.pinkNoiseGain.gain.value}`); 
                } catch(e) {
                    this.logger(`// DEBUG-AUDIO: Error starting PinkNoiseSource on resume: ${e.message}`);
                }
            }
            this.audioContext.removeEventListener('statechange', startOnResume);
        };
        
        this.audioContext.addEventListener('statechange', startOnResume);
        this.logger("// DEBUG-AUDIO: Set up listener for AudioContext state changes");
      }
    } catch (e) { 
        this.logger(`// DEBUG-AUDIO: ERROR starting PinkNoiseSource: ${e.message}`); 
    }

    // Apply correct gain based on current mode
    this.logger(`// DEBUG-AUDIO: Calling _applyActiveStateAudio to set initial gain`);
    this._applyActiveStateAudio();
    this.logger("// DEBUG-AUDIO: _generatePinkNoiseBufferAndSetup EXITED");
  }

  public updateParam(paramId: string, value: any): void {
    this.logger(`updateParam: id='${paramId}', value='${value}'`);
    let changed = false;
    const numericValue = Number(value);
    const booleanValue = Boolean(value);

    switch (paramId) {
      case "ikedaGlobalOnOff":
        if (this.params.ikedaGlobalOnOff !== booleanValue) {
            this.params.ikedaGlobalOnOff = booleanValue;
            changed = true;
        }
        break;
      case "ikedaPinkNoiseLevel":
        if (this.params.ikedaPinkNoiseLevel !== numericValue) {
            this.params.ikedaPinkNoiseLevel = Math.max(0, Math.min(1, numericValue)); // Clamp
            changed = true;
        }
        break;
      case "ikedaVolumeCheckLevel":
         if (this.params.ikedaVolumeCheckLevel !== numericValue) {
            this.params.ikedaVolumeCheckLevel = Math.max(0.01, Math.min(0.5, numericValue)); // Clamp
            changed = true;
         }
         break;
      default:
        this.logger(`Warning: Unknown parameter ID '${paramId}' in IkedaModeMVPEngine.updateParam.`);
        return;
    }

    if (changed) {
        this._applyActiveStateAudio();
    }
  }
  
  private _applyActiveStateAudio(): void {
    this.logger(`// DEBUG-AUDIO: _applyActiveStateAudio: isVolumeCheckPending=${this.isVolumeCheckPending}, params.ikedaGlobalOnOff=${this.params.ikedaGlobalOnOff}`);
    
    if (!this.pinkNoiseGain || !this.audioContext) {
      this.logger("// DEBUG-AUDIO: _applyActiveStateAudio: Missing pinkNoiseGain or audioContext, cannot continue");
      return; // Guard against calls before full init
    }
    
    const currentTime = this.audioContext.currentTime;
    let targetGainValue = 0;
    
    if (this.isVolumeCheckPending) {
      targetGainValue = this.params.ikedaVolumeCheckLevel;
      this.logger(`// DEBUG-AUDIO: _applyActiveStateAudio: Volume check active. Setting pinkNoiseGain.gain to ${targetGainValue}`);
      this.pinkNoiseGain.gain.setTargetAtTime(targetGainValue, currentTime, 0.02);
      this.isGenerativeAudioActive = false; // Generative part is not active during volume check
    } else if (this.params.ikedaGlobalOnOff) {
      targetGainValue = this.params.ikedaPinkNoiseLevel;
      if (!this.isGenerativeAudioActive) {
        this.logger("// DEBUG-AUDIO: _applyActiveStateAudio: Starting generative audio (MVP: pink noise)");
      }
      this.logger(`// DEBUG-AUDIO: _applyActiveStateAudio: Setting pinkNoiseGain.gain to ${targetGainValue}`);
      this.pinkNoiseGain.gain.setTargetAtTime(targetGainValue, currentTime, 0.02);
      this.isGenerativeAudioActive = true;
    } else {
      targetGainValue = 0;
      if (this.isGenerativeAudioActive) {
        this.logger("// DEBUG-AUDIO: _applyActiveStateAudio: Stopping generative audio");
      }
      this.logger(`// DEBUG-AUDIO: _applyActiveStateAudio: Setting pinkNoiseGain.gain to ${targetGainValue}`);
      this.pinkNoiseGain.gain.setTargetAtTime(targetGainValue, currentTime, 0.02);
      this.isGenerativeAudioActive = false;
    }
    
    // Get the actual current gain value
    const currentGainValue = this.pinkNoiseGain.gain.value;
    this.logger(`// DEBUG-AUDIO: _applyActiveStateAudio: Current pinkNoiseGain.gain.value=${currentGainValue}, target=${targetGainValue}`);
  }

  public activateFullGenerativeMode(): void {
    this.logger("activateFullGenerativeMode() called.");
    if (!this.isVolumeCheckPending) {
        this.logger("activateFullGenerativeMode: Already active or not in volume check state.");
        return;
    }
    this.isVolumeCheckPending = false;
    this.logger(`Volume check complete. ikedaGlobalOnOff is ${this.params.ikedaGlobalOnOff}.`);
    this._applyActiveStateAudio(); 
  }

  public getOutputNode(): AudioNode {
    this.logger(`// DEBUG-AUDIO: getOutputNode called, returning engineOutputGain`);
    if (this.engineOutputGain) {
      // Log the connected nodes if possible
      try {
        this.logger(`// DEBUG-AUDIO: engineOutputGain exists and will be returned`);
      } catch (error) {
        this.logger(`// DEBUG-AUDIO: Error checking engineOutputGain connections: ${error}`);
      }
    } else {
      this.logger(`// DEBUG-AUDIO: WARNING - engineOutputGain is null or undefined!`);
    }
    return this.engineOutputGain;
  }

  public cleanup(): void {
    this.logger("cleanup() called.");
    if (this.pinkNoiseSource) {
      try { this.pinkNoiseSource.stop(); } catch(e) { /* ignore if already stopped or not started */ }
      this.pinkNoiseSource.disconnect();
      this.pinkNoiseSource = null;
    }
    if (this.pinkNoiseGain) this.pinkNoiseGain.disconnect();
    if (this.engineOutputGain) this.engineOutputGain.disconnect();
    this.logger("IkedaModeMVPEngine cleaned up.");
  }
}