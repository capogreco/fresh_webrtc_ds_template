# Ikeda Mode - MVP Rebuild Plan

## 1. Objective

To implement a Minimum Viable Product (MVP) for the "Ikeda Mode." This MVP will
focus on establishing a stable, working foundation with minimal features:
continuous pink noise output from the synth client, controllable via global
on/off and level parameters, with an integrated volume check. This rebuild aims
to simplify the initial implementation, ensure core functionality by using
direct parameter ID matching (eliminating complex mapping utilities for MVP
parameters), and provide a solid base for incrementally adding more complex
generative features later.

**This plan involves creating a new, simplified engine for Ikeda Mode and
temporarily setting aside the previous complex `DefaultModeEngine`
implementation.**

**Reference:** This plan aligns with the artistic intent described in
`CREATIVE_TEMPLATE_DESIGN_NOTES.md` for a minimalist, Ikeda-inspired mode and
supersedes previous implementation attempts for the `DefaultModeEngine` for this
MVP stage.

## 2. Renaming and Conventions Used in this Plan

- The mode is "Ikeda Mode."
- Parameter IDs are prefixed with `ikeda` (e.g., `ikedaGlobalOnOff`).
- Mode-specific shared files will reside in `shared/modes/ikeda/`.
- The new simplified synth engine class will be `IkedaModeMVPEngine`.
- The `ControllerMode` enum value will be `IKEDA` (e.g.,
  `KNOWN_CONTROLLER_MODES.IKEDA`).

---

## Phase 0: Preparation & Project Cleanup for Ikeda Mode MVP

**Objective:** Prepare the project for a clean implementation of the Ikeda Mode
MVP by backing up existing complex engine code and setting up simplified,
directly named parameter definitions.

1. **Backup Existing Complex `default_mode` Engine Files:**
   - **Action:** In the `fresh_webrtc_ds_template/lib/synth/default_mode/`
     directory (or wherever Claude's current complex Default Mode engine and its
     utilities reside):
     - Rename `engine.ts` to `engine_COMPLEX_BACKUP.ts`.
     - Rename `defaults.ts` to `defaults_COMPLEX_BACKUP.ts`.
     - Rename `types.ts` to `types_COMPLEX_BACKUP.ts`.
     - Rename `sin_parser.ts` to `sin_parser_BACKUP.ts`.
     - Rename `sin_resolver.ts` to `sin_resolver_BACKUP.ts`.
     - Rename `euclidean.ts` to `euclidean_BACKUP.ts`.
     - Rename `param_utils.ts` to `param_utils_BACKUP.ts` (this utility will
       **not** be used for MVP parameter routing).
   - **Rationale:** Preserves existing complex logic for potential future
     reference or reintegration of specific features but removes it from the
     active build path for the MVP.

2. **Update/Create `shared/controllerModes.ts`:**
   - **Action:** Ensure/Modify
     `fresh_webrtc_ds_template/shared/controllerModes.ts`.
   - Define the `IKEDA` mode.
     ```typescript
     export const KNOWN_CONTROLLER_MODES = {
       // DEFAULT: "default", // Consider if this is still needed or if IKEDA is the new primary
       IKEDA: "ikeda", // New Ikeda Mode
       SYNTH_MODE: "synthMode",
       DRONE_MODE: "droneMode",
       GRID_MODE: "gridMode",
     } as const;

     export type ControllerMode =
       typeof KNOWN_CONTROLLER_MODES[keyof typeof KNOWN_CONTROLLER_MODES];

     // Ensure MIDI_DEVICE_TO_MODE_MAPPING is empty or doesn't conflict for now
     export const MIDI_DEVICE_TO_MODE_MAPPING: readonly any[] = []; // Keep empty for MVP focus
     ```

3. **Create Simplified `shared/modes/ikeda/params.ts` for MVP:**
   - **Action:** Create new directory
     `fresh_webrtc_ds_template/shared/modes/ikeda/`.
   - Create new file `fresh_webrtc_ds_template/shared/modes/ikeda/params.ts`.
   - **Content (Ensure `id` fields are EXACTLY as written):**
     ```typescript
     import { type SynthParamDescriptor } from "../../synthParams.ts"; // Path to global SynthParamDescriptor type

     export const IKEDA_MODE_MVP_PARAMS: readonly SynthParamDescriptor[] = [
       {
         id: "ikedaGlobalOnOff", // Renamed from defaultGlobalOnOff
         label: "Ikeda Mode Active",
         type: "boolean",
         defaultValue: false,
         description: "Master play/stop for Ikeda Mode.",
       },
       {
         id: "ikedaGlobalMasterVolume", // Renamed
         label: "Master Volume (Ikeda)", // This will be handled by AudioEngineService's global gain
         type: "number",
         min: 0,
         max: 1,
         step: 0.01,
         defaultValue: 0.5,
         unit: "%",
         description:
           "Overall volume for Ikeda Mode (controlled by AudioEngineService master gain).",
       },
       {
         id: "ikedaPinkNoiseLevel", // Renamed
         label: "Pink Noise Level",
         type: "number",
         min: 0,
         max: 1,
         step: 0.01,
         defaultValue: 0.0, // Start silent, controlled by ikedaGlobalOnOff
         unit: "%",
         description: "Level of the continuous pink noise in Ikeda Mode.",
       },
       {
         id: "ikedaVolumeCheckLevel",
         label: "Volume Check Level",
         type: "number",
         min: 0.01,
         max: 0.5,
         step: 0.01,
         defaultValue: 0.15,
         unit: "%",
         description: "Fixed gain for pink noise during initial volume check.",
       },
     ];
     ```

4. **Update `shared/modes/index.ts`:**
   - **Action:** Modify `fresh_webrtc_ds_template/shared/modes/index.ts`.
   - Import `IKEDA_MODE_MVP_PARAMS` and map `KNOWN_CONTROLLER_MODES.IKEDA` to
     it.
     ```typescript
     import {
       ControllerMode,
       KNOWN_CONTROLLER_MODES,
     } from "../controllerModes.ts";
     import { type SynthParamDescriptor } from "../synthParams.ts"; // Path to global descriptor type
     import { IKEDA_MODE_MVP_PARAMS } from "./ikeda/params.ts";
     // Import SYNTH_PARAMS if it's used for SYNTH_MODE or as a fallback
     import { SYNTH_PARAMS } from "../synthParams.ts";

     export const MODE_PARAMS_MAP: Record<
       ControllerMode,
       readonly SynthParamDescriptor[]
     > = {
       [KNOWN_CONTROLLER_MODES.IKEDA]: IKEDA_MODE_MVP_PARAMS,
       [KNOWN_CONTROLLER_MODES.SYNTH_MODE]: SYNTH_PARAMS, // Example: other modes use standard params
       [KNOWN_CONTROLLER_MODES.DRONE_MODE]: [], // Placeholder
       [KNOWN_CONTROLLER_MODES.GRID_MODE]: [], // Placeholder
       // Ensure there's a fallback for KNOWN_CONTROLLER_MODES.DEFAULT if it still exists and is used
       [KNOWN_CONTROLLER_MODES.DEFAULT]: IKEDA_MODE_MVP_PARAMS, // Or [] if DEFAULT is deprecated/renamed
     };
     ```

5. **`Controller.tsx` to Default to Ikeda Mode for Testing:**
   - **Action:** In `fresh_webrtc_ds_template/islands/Controller.tsx`, ensure
     the `currentMode` signal is initialized to `KNOWN_CONTROLLER_MODES.IKEDA`.
     ```typescript
     // In Controller.tsx
     const currentMode = useSignal<ControllerMode>(
       KNOWN_CONTROLLER_MODES.IKEDA,
     );
     ```

---

## Phase MVP-1: Implement Minimal `IkedaModeMVPEngine`

**Objective:** Create a new, simple `IkedaModeMVPEngine` that only produces
continuous pink noise, controllable by `ikedaGlobalOnOff` and
`ikedaPinkNoiseLevel`, and includes the integrated volume check logic.

1. **Create `lib/synth/ikeda_mode/types.ts` (MVP Version):**
   - **Action:** Create this new file:
     `fresh_webrtc_ds_template/lib/synth/ikeda_mode/types.ts`
   - **Content:**
     ```typescript
     export interface IkedaModeMVPEngineParams {
       ikedaGlobalOnOff: boolean;
       ikedaPinkNoiseLevel: number;
       ikedaVolumeCheckLevel: number;
       // Note: ikedaGlobalMasterVolume is handled by AudioEngineService
     }
     ```

2. **Create `lib/synth/ikeda_mode/defaults.ts` (MVP Version):**
   - **Action:** Create this new file:
     `fresh_webrtc_ds_template/lib/synth/ikeda_mode/defaults.ts`
   - **Content:**
     ```typescript
     import { IkedaModeMVPEngineParams } from "./types.ts";

     export const IKEDA_MVP_ENGINE_DEFAULTS: IkedaModeMVPEngineParams = {
       ikedaGlobalOnOff: false,
       ikedaPinkNoiseLevel: 0.0,
       ikedaVolumeCheckLevel: 0.15,
     };
     ```

3. **Create `lib/synth/ikeda_mode/engine.ts` (MVP `IkedaModeMVPEngine`):**
   - **Action:** Create this new file:
     `fresh_webrtc_ds_template/lib/synth/ikeda_mode/engine.ts`
   - **Content (ensure exact `paramId` matching, no complex utilities):**
     ```typescript
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
         this.logger = (message: string) =>
           logger(`[IkedaMVPEngine] ${message}`);

         this.params = {
           ...IKEDA_MVP_ENGINE_DEFAULTS,
           ...(initialParams || {}),
         };
         this.logger(
           `Initialized. Initial params: ${JSON.stringify(this.params)}`,
         );

         this.engineOutputGain = this.audioContext.createGain();
         this.pinkNoiseGain = this.audioContext.createGain();
         // Initialize gain according to initial ikedaGlobalOnOff and isVolumeCheckPending state
         const initialGain = this.isVolumeCheckPending
           ? this.params.ikedaVolumeCheckLevel
           : (this.params.ikedaGlobalOnOff
             ? this.params.ikedaPinkNoiseLevel
             : 0);
         this.pinkNoiseGain.gain.setValueAtTime(
           initialGain,
           this.audioContext.currentTime,
         );

         this._generatePinkNoiseBufferAndSetup();
       }

       private async _generatePinkNoiseBufferAndSetup() {
         if (this.audioContext.state === "closed") {
           this.logger("AudioContext closed, cannot create buffer.");
           return;
         }
         const duration = 3;
         const sampleRate = this.audioContext.sampleRate;
         const frameCount = sampleRate * duration;
         this.pinkNoiseBuffer = this.audioContext.createBuffer(
           1,
           frameCount,
           sampleRate,
         );
         const channelData = this.pinkNoiseBuffer.getChannelData(0);
         let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // Voss-McCartney approximation
         for (let i = 0; i < frameCount; i++) {
           const white = Math.random() * 2 - 1;
           b0 = 0.99886 * b0 + white * 0.0555179;
           b1 = 0.99332 * b1 + white * 0.0750759;
           b2 = 0.96900 * b2 + white * 0.1538520;
           b3 = 0.86650 * b3 + white * 0.3104856;
           b4 = 0.55000 * b4 + white * 0.5329522;
           b5 = -0.7616 * b5 - white * 0.0168980;
           channelData[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
           channelData[i] *= 0.11;
           b6 = white * 0.115926;
         }
         this.logger("Pink noise buffer generated.");

         this.pinkNoiseSource = this.audioContext.createBufferSource();
         this.pinkNoiseSource.buffer = this.pinkNoiseBuffer;
         this.pinkNoiseSource.loop = true;
         this.pinkNoiseSource.connect(this.pinkNoiseGain).connect(
           this.engineOutputGain,
         );

         try {
           if (this.audioContext.state === "running") {
             this.pinkNoiseSource.start();
             this.logger("PinkNoiseSource started and connected.");
           } else {
             this.logger(
               "AudioContext not running, PinkNoiseSource not started yet. Will attempt start on resume.",
             );
             // Attempt to start if context resumes later - this is tricky, might be better to start only when context is running
             const startOnResume = () => {
               if (
                 this.audioContext.state === "running" &&
                 this.pinkNoiseSource && !this.pinkNoiseSource.context
               ) { // Check if already started
                 try {
                   this.pinkNoiseSource.start();
                   this.logger("PinkNoiseSource started on context resume.");
                 } catch (e) {
                   this.logger(
                     `Error starting PinkNoiseSource on resume: ${e.message}`,
                   );
                 }
               }
               this.audioContext.removeEventListener(
                 "statechange",
                 startOnResume,
               );
             };
             this.audioContext.addEventListener("statechange", startOnResume);
           }
         } catch (e) {
           this.logger(`Error starting PinkNoiseSource: ${e.message}`);
         }

         // Call _applyActiveStateAudio to set initial gain correctly based on states
         this._applyActiveStateAudio();
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
               this.params.ikedaPinkNoiseLevel = Math.max(
                 0,
                 Math.min(1, numericValue),
               ); // Clamp
               changed = true;
             }
             break;
           case "ikedaVolumeCheckLevel":
             if (this.params.ikedaVolumeCheckLevel !== numericValue) {
               this.params.ikedaVolumeCheckLevel = Math.max(
                 0.01,
                 Math.min(0.5, numericValue),
               ); // Clamp
               changed = true;
             }
             break;
           default:
             this.logger(
               `Warning: Unknown parameter ID '${paramId}' in IkedaModeMVPEngine.updateParam.`,
             );
             return;
         }

         if (changed) {
           this._applyActiveStateAudio();
         }
       }

       private _applyActiveStateAudio(): void {
         if (!this.pinkNoiseGain || !this.audioContext) return; // Guard against calls before full init
         const targetGain = this.audioContext.currentTime;

         if (this.isVolumeCheckPending) {
           this.pinkNoiseGain.gain.setTargetAtTime(
             this.params.ikedaVolumeCheckLevel,
             targetGain,
             0.02,
           );
           this.logger(
             `Volume check active. Pink noise at VCL: ${this.params.ikedaVolumeCheckLevel}`,
           );
           this.isGenerativeAudioActive = false; // Generative part is not active during volume check
         } else if (this.params.ikedaGlobalOnOff) {
           if (!this.isGenerativeAudioActive) {
             this.logger(
               "Starting generative audio (MVP: pink noise at target level).",
             );
           }
           this.pinkNoiseGain.gain.setTargetAtTime(
             this.params.ikedaPinkNoiseLevel,
             targetGain,
             0.02,
           );
           this.isGenerativeAudioActive = true;
           this.logger(
             `Generative audio active. Pink noise level: ${this.params.ikedaPinkNoiseLevel}`,
           );
         } else {
           if (this.isGenerativeAudioActive) {
             this.logger("Stopping generative audio (MVP: pink noise to 0).");
           }
           this.pinkNoiseGain.gain.setTargetAtTime(0, targetGain, 0.02);
           this.isGenerativeAudioActive = false;
           this.logger("Generative audio stopped. Pink noise gain to 0.");
         }
       }

       public activateFullGenerativeMode(): void {
         this.logger("activateFullGenerativeMode() called.");
         if (!this.isVolumeCheckPending) {
           this.logger(
             "activateFullGenerativeMode: Already active or not in volume check state.",
           );
           return;
         }
         this.isVolumeCheckPending = false;
         this.logger(
           `Volume check complete. ikedaGlobalOnOff is ${this.params.ikedaGlobalOnOff}.`,
         );
         this._applyActiveStateAudio();
       }

       public getOutputNode(): AudioNode {
         return this.engineOutputGain;
       }

       public cleanup(): void {
         this.logger("cleanup() called.");
         if (this.pinkNoiseSource) {
           try {
             this.pinkNoiseSource.stop();
           } catch (e) { /* ignore if already stopped or not started */ }
           this.pinkNoiseSource.disconnect();
           this.pinkNoiseSource = null;
         }
         if (this.pinkNoiseGain) this.pinkNoiseGain.disconnect();
         if (this.engineOutputGain) this.engineOutputGain.disconnect();
         this.logger("IkedaModeMVPEngine cleaned up.");
       }
     }
     ```

4. **Create `lib/synth/ikeda_mode/index.ts`:**
   - **Action:** Create this file to export from the `ikeda_mode` directory.
   - **Content:**
     ```typescript
     // fresh_webrtc_ds_template/lib/synth/ikeda_mode/index.ts
     export * from "./types.ts";
     export * from "./defaults.ts";
     export * from "./engine.ts";
     ```

---

## Phase MVP-2: Refactor `AudioEngineService.ts` for MVP `IkedaModeMVPEngine`

**Objective:** Modify `AudioEngineService.ts` to correctly instantiate, manage,
and route parameters to the new MVP `IkedaModeMVPEngine`, ensuring direct
parameter ID matching for MVP parameters and removing reliance on complex
mapping utilities for these MVP params.

1. **File:** `fresh_webrtc_ds_template/services/AudioEngineService.ts`
2. **Imports:**
   - Import `IkedaModeMVPEngine` from `../lib/synth/ikeda_mode/engine.ts`.
   - Import `KNOWN_CONTROLLER_MODES` from `../shared/controllerModes.ts`.
   - Remove imports for `param_utils_BACKUP.ts` or any special mapping utilities
     if they were previously used for Default Mode.
3. **Type for `currentModeEngine`:**
   - Update:
     `private currentModeEngine: IkedaModeMVPEngine | /* OtherEngineType | */ null = null;`
4. **`setMode(newMode: ControllerMode, initialParams?: Record<string, any>)`
   Method:**
   - In the `switch (newMode)` block, for `case KNOWN_CONTROLLER_MODES.IKEDA:`:
     ```typescript
     case KNOWN_CONTROLLER_MODES.IKEDA:
       try {
         this.currentModeEngine = new IkedaModeMVPEngine(
           this.audioContext,
           (logMessage: string) => this.addLog(logMessage), // Pass existing logger
           initialParams || {} 
         );
         this.addLog(`AudioEngineService: IkedaModeMVPEngine initialized.`);
         this.connectCurrentEngineOutput(); 
         this.isCurrentModeVolumeCheckPending = true; // AES tracks this sub-state
         if (this.onEngineStateChangeCallback) { // Notify useAudioEngine
           this.onEngineStateChangeCallback({ isVolumeCheckPending: true });
         }
       } catch (error) {
         this.addLog(`AudioEngineService: Error initializing IkedaModeMVPEngine: ${error}`);
         console.error("Error initializing IkedaModeMVPEngine:", error);
         this.activeMode = null;
       }
       break;
     ```
5. **`updateParameter(paramId: string, value: any)` Method:**
   - **Crucial Change: Direct Parameter ID Handling for Ikeda MVP.**
     ```typescript
     public updateParameter(paramId: string, value: any): void {
       this.addLog(`AES.updateParameter: Received paramId='${paramId}', value='${String(value)}', activeMode='${this.activeMode}'`);

       // Handle global parameters managed by AudioEngineService directly
       if (paramId === "ikedaGlobalMasterVolume") {
         const volumeValue = Math.max(0, Math.min(1, Number(value)));
         this.masterVolumeGain.gain.setTargetAtTime(volumeValue, this.audioContext.currentTime, 0.015);
         this.addLog(`AES: Set master volume to ${volumeValue}`);
         return; 
       }
       // Add similar direct handling for "ikedaGlobalReverbAmount" if reverb is part of AES graph

       // If in Ikeda Mode, forward recognized MVP params to IkedaModeMVPEngine
       if (this.activeMode === KNOWN_CONTROLLER_MODES.IKEDA && this.currentModeEngine) {
         // List of params handled by IkedaModeMVPEngine for the MVP
         const ikedaMVPParams = ["ikedaGlobalOnOff", "ikedaPinkNoiseLevel", "ikedaVolumeCheckLevel"];
         if (ikedaMVPParams.includes(paramId)) {
           this.addLog(`AES.updateParameter: Forwarding to IkedaModeMVPEngine: ID='${paramId}'`);
           (this.currentModeEngine as IkedaModeMVPEngine).updateParam(paramId, value);
         } else {
           this.addLog(`AES.updateParameter: Param '${paramId}' not specifically handled by IkedaModeMVPEngine in current MVP scope for mode '${this.activeMode}'.`);
         }
       } else if (this.currentModeEngine && typeof (this.currentModeEngine as any).updateParam === 'function') {
         // Fallback for other modes or if currentModeEngine has a generic updateParam
         this.addLog(`AES.updateParameter: Forwarding '${paramId}' to generic engine for mode '${this.activeMode}'.`);
         (this.currentModeEngine as any).updateParam(paramId, value);
       } else {
          this.addLog(`AES.updateParameter: Param '${paramId}' not handled. No engine or activeMode='${this.activeMode}'.`);
       }
     }
     ```
6. **`confirmVolumeCheckComplete()` Method:**
   - Ensure this method correctly calls
     `(this.currentModeEngine as IkedaModeMVPEngine).activateFullGenerativeMode();`
     when `this.activeMode === KNOWN_CONTROLLER_MODES.IKEDA`.
   - It should set `this.isCurrentModeVolumeCheckPending = false;` and call
     `this.onEngineStateChangeCallback({ isVolumeCheckPending: false });`.
7. **`connectCurrentEngineOutput()`:**
   - Verify it connects
     `(this.currentModeEngine as IkedaModeMVPEngine).getOutputNode()` to
     `this.mainMixerInput`.

---

## Phase MVP-3: Verify `useAudioEngine.ts` & `WebRTC.tsx` and Test MVP

**Objective:** Ensure the UI layer correctly interacts with the refactored
`AudioEngineService` and the new MVP Ikeda Mode, then test the basic
functionality.

1. **File:** `fresh_webrtc_ds_template/islands/hooks/useAudioEngine.ts`
   - **Verify:** (Mostly should be aligned from previous "Integrated Volume
     Check" plan)
     - Accepts `currentControllerModeSignal`.
     - Calls `audioEngineService.setMode(KNOWN_CONTROLLER_MODES.IKEDA)` when
       mode changes to Ikeda.
     - Calls `audioEngineService.confirmVolumeCheckComplete()`.
     - `updateSynthParam(paramId, value)` forwards to
       `audioEngineService.updateParameter(paramId, value)`.
     - Manages `isVolumeCheckPending` signal based on callbacks from
       `AudioEngineService`.
     - Old standalone pink noise logic (`startPinkNoise`, `stopPinkNoise`, etc.)
       is removed.

2. **File:** `fresh_webrtc_ds_template/islands/WebRTC.tsx`
   - **Verify:** (Mostly should be aligned)
     - Correctly passes `currentControllerMode` (set to IKEDA) to
       `useAudioEngine`.
     - UI logic for "Enable Audio" -> "Volume Adjustment (Ikeda Mode)" ->
       "Active Synth Interface" is driven by `audio.audioContextReady` and
       `audio.isVolumeCheckPending`.
     - "Done Adjusting Volume" button calls
       `audio.confirmVolumeCheckComplete()`.

3. **Controller UI (`Controller.tsx`):**
   - **Verify:** When Ikeda Mode is active, it loads and displays UI controls
     for `ikedaGlobalOnOff`, `ikedaGlobalMasterVolume`, `ikedaPinkNoiseLevel`,
     and `ikedaVolumeCheckLevel` based on `shared/modes/ikeda/params.ts`.
   - Ensure it sends these exact `paramId`s.

4. **Testing the MVP (Detailed Test Sequence):**
   - **Start Application:** Controller defaults to/is set to "IKEDA" mode. Synth
     client connects.
   - **Synth Client - Enable Audio:** Click "Enable Audio".
     - **Expected:** Pink noise starts at `ikedaVolumeCheckLevel`. UI shows
       "Volume Adjustment (Ikeda Mode)" and "Done" button. FFT shows pink noise.
     - **Check Logs:** `AudioEngineService` logs `setMode('ikeda')`.
       `IkedaModeMVPEngine` logs initialization and
       `Volume check pending. Pink noise level set to...`. `useAudioEngine` logs
       `isVolumeCheckPending` becoming `true`.
   - **Controller - Adjust `ikedaVolumeCheckLevel` (if UI exposed for it):**
     - **Expected:** Loudness of the volume check pink noise changes.
   - **Synth Client - Done Adjusting Volume:** Click "Done Adjusting Volume".
     - **Expected:** Volume check UI disappears. Pink noise should now be silent
       if `ikedaGlobalOnOff` is initially `false` (default), or at
       `ikedaPinkNoiseLevel` if `ikedaGlobalOnOff` was initially `true`.
     - **Check Logs:** `AudioEngineService.confirmVolumeCheckComplete()` called.
       `IkedaModeMVPEngine.activateFullGenerativeMode()` called.
       `useAudioEngine` logs `isVolumeCheckPending` becoming `false`.
       `IkedaModeMVPEngine` logs its transition.
   - **Controller - Toggle `ikedaGlobalOnOff` to `true`:**
     - **Expected:** `IkedaModeMVPEngine._applyActiveStateAudio()` (or
       equivalent) is called. Pink noise becomes audible at the level set by
       `ikedaPinkNoiseLevel`.
     - **Check Logs:**
       `AudioEngineService.updateParameter("ikedaGlobalOnOff", true)` called.
       `IkedaModeMVPEngine.updateParam("ikedaGlobalOnOff", true)` called.
       `IkedaModeMVPEngine` logs "Starting generative audio...".
   - **Controller - Adjust `ikedaPinkNoiseLevel`:**
     - **Expected:** Loudness of pink noise changes.
   - **Controller - Adjust `ikedaGlobalMasterVolume`:**
     - **Expected:** Overall loudness changes (controlled by
       `AudioEngineService.masterVolumeGain`).
   - **Controller - Toggle `ikedaGlobalOnOff` to `false`:**
     - **Expected:** Pink noise fades to silent.
     - **Check Logs:** Relevant `_applyActiveStateAudio()` or gain setting logs
       indicating stoppage.
   - **Controller - Toggle `ikedaGlobalOnOff` back to `true`:**
     - **Expected:** Pink noise resumes at its set `ikedaPinkNoiseLevel`.
   - **Throughout:** Monitor for "Unknown parameter" errors (there should be
     none for these MVP params) or any other console errors.

---

This MVP rebuild plan is designed to be explicit and create a stable foundation.
Once this is working, incrementally adding back the advanced features (Euclidean
rhythms, SIN-driven layers for blips and clicks, etc.) into the
`IkedaModeMVPEngine` will be much more manageable. Each new feature will get its
own parameters added back to `shared/modes/ikeda/params.ts` and corresponding
logic in the engine.
