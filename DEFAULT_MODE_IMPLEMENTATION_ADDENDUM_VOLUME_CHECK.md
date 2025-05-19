# Default Mode Implementation - Phase 2.A (Revised): Engine Integration with Integrated Volume Check

## 1. Objective

To implement and integrate the Default Mode audio engine (`DefaultModeEngine`)
into `AudioEngineService.ts`, incorporating a new "integrated volume check"
state as part of the Default Mode's lifecycle. This revised Phase 2.A supersedes
previous plans for these specific steps and assumes Phase 1 (Controller UI for
Default Mode global parameters) is complete.

**Reference:** This plan aligns with `CREATIVE_TEMPLATE_DESIGN_NOTES.md`
(Section 4.4) and builds upon Claude's existing Default Mode engine components
(`engine.ts`, `sin_parser.ts`, `sin_resolver.ts`, `euclidean.ts`, etc.).

## 2. Core Concept: Integrated Volume Check

Instead of a separate pink noise state managed by `useAudioEngine` before mode
activation, the volume check will be an initial sub-state _within_ the Default
Mode itself.

1. Controller selects "Default Mode" and sends initial parameters.
2. `AudioEngineService` instantiates `DefaultModeEngine`.
3. `DefaultModeEngine` starts in a "VolumeCheckPending" sub-state:
   - Outputs only continuous pink noise at a predefined level (e.g., from a new
     `defaultVolumeCheckLevel` parameter).
   - All other generative elements (blips, clicks, rhythmic noise) are held off.
4. Synth client UI (`WebRTC.tsx`) displays "Volume Adjustment" instructions and
   a "Done" button.
5. User clicks "Done."
6. `WebRTC.tsx` calls `audio.confirmVolumeCheckComplete()`.
7. `useAudioEngine` calls `audioEngineService.confirmVolumeCheckComplete()`.
8. `AudioEngineService` calls `defaultModeEngine.activateFullGenerativeMode()`.
9. `DefaultModeEngine` transitions out of "VolumeCheckPending":
   - Its main clock starts (if `defaultGlobalOnOff` is true).
   - All generative layers (noise, blips, clicks) become active, driven by their
     parameters.
   - The pink noise source's gain smoothly transitions from the fixed check
     level to being controlled by its dynamic envelope.

---

## Implementation Steps

### Step 2.A.1: Refine/Confirm Default Mode Engine (`engine.ts` - Claude's existing work)

**Objective:** Ensure Claude's `DefaultModeEngine` (and its utilities like
`SINResolver`, `Euclidean`, etc.) aligns with previous clarifications and can
support the new "VolumeCheckPending" sub-state.

1. **Envelopes (Re-confirm based on previous feedback):**
   - **Blips:** Must use a true rectangular envelope (e.g., `OscillatorNode` ->
     `GainNode` with `setValueAtTime`) driven by `defaultBlipDurationMsRule`.
   - **Noise:** Must support rectangular and sinusoidal envelope shapes for
     noise events, driven by `defaultNoiseEnvelopeShape` and
     `defaultNoiseEnvelopeDurationRule`.
   - Confirm `engine.ts` implements these, not relying solely on a generic ADSR
     for these specific Default Mode shapes.
2. **Click AudioWorklet:**
   - Confirm `CLICK_PROCESSOR_CODE` is embedded, loaded via Blob URL, and
     triggered by `postMessage`. Amplitude controlled by
     `defaultClickVolumeRule`.
3. **Noise Types:**
   - Confirm `defaultNoiseType` ("pink", "white", "mixed") is handled, with
     "mixed" randomly selecting pink/white per event. Other noise types (brown,
     blue, violet) are bonuses.
4. **Master Clock:**
   - Confirm swing/humanization default to `0` internally.
5. **Parameter Recognition:**
   - Confirm all `paramId`s from `shared/modes/default/params.ts` are recognized
     and mapped correctly to internal engine functionalities (using
     `SPECIAL_PARAM_MAPPINGS` in `param_utils.ts` if that's the chosen mechanism
     for any internal renaming).
6. **New: "VolumeCheckPending" Sub-state Logic in `DefaultModeEngine`:**
   - **Internal State:** Add `private isVolumeCheckPending: boolean = true;`
     (initialized to `true`).
   - **Pink Noise Source:** Ensure a pink noise source node is part of the
     engine's graph.
   - **Constructor / Initialization:**
     - When instantiated, if `isVolumeCheckPending` is true:
       - Route the pink noise source to output at a fixed level determined by
         the `defaultVolumeCheckLevel` parameter (see Step 2.A.2).
       - Keep its main master clock (for Euclidean rhythms, noise event
         scheduler) _inactive_ or ensure its triggers are ignored.
   - **New Method:** `public activateFullGenerativeMode(): void`
     - Sets `this.isVolumeCheckPending = false;`.
     - If `this.params.defaultGlobalOnOff` (or its mapped equivalent from the
       received parameters) is `true`, it calls `this.start()` (the existing
       method that starts the master clock and rhythmic elements).
     - Ensures the gain of the pink noise source transitions smoothly from
       `defaultVolumeCheckLevel` to being controlled by its own dynamic envelope
       logic (driven by `defaultNoiseRate...`, `defaultNoiseEnvelopeShape`,
       etc.). This might involve setting the initial state of the noise envelope
       LFO or gain automation.
   - **`start()` method:** Should now only start the full generative processes
     if `!this.isVolumeCheckPending`. If `isVolumeCheckPending` is true,
     `start()` might do nothing or only ensure the volume check pink noise is
     audible.
   - **`updateParam(paramId, value)`:** If `isVolumeCheckPending` is true, most
     parameter updates (especially rhythmic ones or `defaultGlobalOnOff`) should
     be stored but their full effect might be deferred until
     `activateFullGenerativeMode()` is called. The `defaultVolumeCheckLevel`
     parameter, however, should take effect immediately if changed during the
     volume check state.

### Step 2.A.2: Update `shared/modes/default/params.ts`

1. **Action:** Add a parameter for the volume check level.
   ```typescript
   // In DEFAULT_MODE_PARAMS array in shared/modes/default/params.ts
   {
     id: "defaultVolumeCheckLevel",
     label: "Volume Check Level",
     type: "number",
     min: 0.01,
     max: 0.5, // Keep it relatively low for safety
     step: 0.01,
     defaultValue: 0.15, 
     unit: "%", // Display as percentage, but value is 0-1
     description: "Fixed gain level for pink noise during initial volume check.",
   }
   ```
   - The `DefaultModeEngine` will use this value when `isVolumeCheckPending` is
     true.
   - This parameter should also be controllable from the `Controller.tsx` global
     UI for Default Mode, allowing the user to adjust the pink noise check level
     itself if desired, although it's primarily an initial setup level.

### Step 2.A.3: Update `AudioEngineService.ts`

1. **File:** `fresh_webrtc_ds_template/services/AudioEngineService.ts`
2. **Internal State for Volume Check Sub-state:**
   - `private isCurrentModeVolumeCheckPending: boolean = false;`
3. **`setMode(newMode: ControllerMode, ...)` Method:**
   - When `newMode === KNOWN_CONTROLLER_MODES.DEFAULT`:
     - After instantiating `DefaultModeEngine`, set
       `this.isCurrentModeVolumeCheckPending = true;`.
     - The `DefaultModeEngine` itself will start in its internal
       "VolumeCheckPending" state (its constructor should ensure this).
   - When switching _away_ from Default Mode (in the cleanup section of
     `setMode`), ensure `this.isCurrentModeVolumeCheckPending = false;`.
4. **New Method:** `public confirmVolumeCheckComplete(): void`
   ```typescript
   public confirmVolumeCheckComplete(): void {
     if (this.activeMode === KNOWN_CONTROLLER_MODES.DEFAULT && 
         this.currentModeEngine && 
         typeof (this.currentModeEngine as any).activateFullGenerativeMode === 'function') {
       this.addLog("AES: Volume check confirmed by UI. Activating full Default Mode generative engine.");
       (this.currentModeEngine as any).activateFullGenerativeMode(); // Type assertion might be needed if DefaultModeEngine type is not fully known here
       this.isCurrentModeVolumeCheckPending = false;
       
       // Notify useAudioEngine that volume check is done for UI updates
       if (this.onEngineStateChangeCallback) { // Assumes AudioEngineService can callback to useAudioEngine
            this.onEngineStateChangeCallback({ isVolumeCheckPending: false });
       }
     } else {
       this.addLog("AES: confirmVolumeCheckComplete called but not in correct mode/state or engine issue.");
     }
   }
   ```
5. **Expose Volume Check Status (Callback or Getter):**
   - To allow `useAudioEngine` to react to `isCurrentModeVolumeCheckPending`
     changes initiated by `confirmVolumeCheckComplete`, `AudioEngineService`
     needs a way to communicate this state back.
   - **Option 1 (Callback - Preferred for reactivity):**
     - `AudioEngineService` constructor accepts an
       `onEngineStateChangeCallback?: (state: { isVolumeCheckPending: boolean }) => void`.
     - Store this callback: `private onEngineStateChangeCallback;`
     - Call it from `setMode` (to set initial pending state) and
       `confirmVolumeCheckComplete`.
   - **Option 2 (Getter - `useAudioEngine` would poll or derive):**
     - `public getIsVolumeCheckPending(): boolean { return this.isCurrentModeVolumeCheckPending; }`

### Step 2.A.4: Update `useAudioEngine.ts`

1. **File:** `fresh_webrtc_ds_template/islands/hooks/useAudioEngine.ts`
2. **New Signal:**
   ```typescript
   const isVolumeCheckPending = useSignal<boolean>(false);
   ```
3. **Update from `AudioEngineService` (using Callback approach):**
   - Modify `AudioEngineService` constructor call within `initializeAudioEngine`
     in `useAudioEngine.ts`:
     ```typescript
     // In useAudioEngine.initializeAudioEngine
     audioEngineRef.current = new AudioEngineService(logger, (engineState) => {
       if (engineState.isVolumeCheckPending !== undefined) {
         isVolumeCheckPending.value = engineState.isVolumeCheckPending;
         addLog(
           `useAudioEngine: Volume check pending state updated to: ${engineState.isVolumeCheckPending}`,
         );
       }
     });
     ```
   - When `props.currentControllerModeSignal.value` changes to `DEFAULT` in its
     `useEffect` (and `audioEngineRef.current.setMode()` is called):
     `AudioEngineService.setMode` will call the `onEngineStateChangeCallback`
     setting `isVolumeCheckPending.value = true;`.
4. **New Method Exposed by Hook:**
   ```typescript
   const confirmVolumeCheckComplete = useCallback(() => {
     if (
       audioEngineRef.current &&
       activeControllerMode.value === KNOWN_CONTROLLER_MODES.DEFAULT
     ) {
       audioEngineRef.current.confirmVolumeCheckComplete();
       // isVolumeCheckPending.value will be updated by the callback from AudioEngineService
       addLog("useAudioEngine: User confirmed volume check.");
     }
   }, [activeControllerMode.value, addLog]); // activeControllerMode comes from currentControllerModeSignal prop
   ```
5. **Return Values:** Add `isVolumeCheckPending` and
   `confirmVolumeCheckComplete` to the object returned by `useAudioEngine`.
6. **Remove Old Pink Noise Related Signals/Methods:**
   - The signals `pinkNoiseActive` and `pinkNoiseSetupDone` in `useAudioEngine`
     should be removed.
   - The methods `startPinkNoise`, `stopPinkNoise`, and `handleVolumeCheckDone`
     in `useAudioEngine` should be removed as their functionality is now
     integrated into the Default Mode engine's lifecycle.

### Step 2.A.5: Update `WebRTC.tsx` UI Logic

1. **File:** `fresh_webrtc_ds_template/islands/WebRTC.tsx`
2. **State Management:**
   - The old `showAudioButton` signal might still be useful for the very first
     "Enable Audio" click.
   - The new `audio.isVolumeCheckPending` signal (from `useAudioEngine`) will
     now control the display of the volume check UI elements _after_ audio is
     initially enabled and if the mode is "default".
3. **JSX Structure (After initial "Enable Audio" button is clicked and
   `audio.audioContextReady.value` is true):**
   ```jsx
   {/* This outer condition checks if audio context is generally ready */}
   {
     audio.audioContextReady.value
       ? (
         // Now check for Default Mode's integrated volume check sub-state
         audio.activeControllerMode.value === KNOWN_CONTROLLER_MODES.DEFAULT &&
           audio.isVolumeCheckPending.value
           ? (
             <div
               class="volume-check-active-default-mode"
               style="padding: 20px; text-align: center;"
             >
               {/* FFT Analyzer should be part of Synth.tsx, which might be conditionally minimal here */}
               {/* Or a specific FFT display for pink noise if Synth.tsx isn't rendered yet */}
               <div
                 class="fft-analyzer-container"
                 style="margin: 10px auto; width: 502px;"
               >
                 <canvas
                   ref={canvasRef}
                   id="fftCanvas"
                   width="500"
                   height="100"
                 >
                 </canvas>{" "}
                 {/* Ensure canvasRef is still managed for FFT */}
               </div>
               <div class="pink-noise-setup-text">
                 <h2>Volume Adjustment (Default Mode)</h2>
                 <p>
                   Pink noise is playing. Please adjust your system volume to a
                   comfortable level.
                 </p>
                 <button
                   type="button"
                   onClick={audio.confirmVolumeCheckComplete}
                   class="audio-button"
                   style="padding: 10px 20px;"
                 >
                   Done Adjusting Volume
                 </button>
               </div>
             </div>
           )
           : (
             // Display Normal Active Synth UI (e.g., <Synth /> island or other mode-specific UI)
             <div class="active-synth-interface">
               {/* The Synth island now displays based on the active mode and its state */}
               <Synth audio={audio} />

               {/* Other UI elements like Connection Info, Logs, Message Area from original WebRTC.tsx */}
               {/* ... */}

               {/* DEV_MODE manual mode switcher UI */}
               {DEV_MODE && (
                 <div style="margin-top:20px; padding-top:10px; border-top:1px solid #ccc;">
                   {/* ... dev mode switcher ... */}
                 </div>
               )}
             </div>
           )
       )
       : (
         // UI for "Enable Audio" button (initial state before audioContext is ready)
         <div class="audio-enable">
           <h1>WebRTC Synth</h1>
           {/* ... controller connection info ... */}
           <button
             type="button"
             onClick={audio.initializeAudioContext}
             class="audio-button"
           >
             Enable Audio
           </button>
         </div>
       );
   }
   ```
   - **Note on FFT Canvas:** The `canvasRef` and FFT drawing logic were
     previously moved to `Synth.tsx`. If `Synth.tsx` is _also_ conditionally
     rendered based on `!audio.isVolumeCheckPending.value`, then a separate,
     simpler FFT display might be needed here just for the volume check noise,
     or `Synth.tsx` needs to be intelligent enough to render its FFT part even
     during volume check. For simplicity, the above JSX assumes `Synth.tsx`
     (which contains the FFT) is rendered in the `else` block, meaning a
     separate canvas might be needed here if FFT is desired _during_ volume
     check.
   - Alternatively, always render `Synth.tsx` when audio is ready, and
     `Synth.tsx` itself can show/hide elements based on
     `audio.isVolumeCheckPending.value`. This is likely cleaner.

### Step 2.A.6: Testing and Verification (Revised)

1. **Controller:** Ensure it's set to Default Mode and sending initial Default
   Mode parameters (including `defaultVolumeCheckLevel` and
   `defaultGlobalOnOff`).
2. **Synth Client:**
   - Click "Enable Audio".
   - **Verify:** UI shows "Volume Adjustment (Default Mode)" text, "Done"
     button. Pink noise (at `defaultVolumeCheckLevel`) should be audible. FFT
     should display this pink noise.
   - **Verify:** Logs from `AudioEngineService` and `DefaultModeEngine` show
     Default Mode initialized in its "VolumeCheckPending" sub-state.
   - Click "Done Adjusting Volume".
   - **Verify:** Volume check UI disappears. Main Default Mode UI elements
     (parameter readouts via `Synth.tsx`) appear.
   - **Verify:** `DefaultModeEngine` logs indicate
     `activateFullGenerativeMode()` was called.
   - **Verify (Crucial):** The pink noise sound transitions smoothly (its gain
     is now controlled by the Default Mode's noise envelope logic). The main
     generative audio (blips, clicks, rhythmic noise) starts playing if
     `defaultGlobalOnOff` was initially true or is toggled on by the controller.
   - Test all other Default Mode parameters as per the original Step 2.A.5
     testing plan.

---

This revised Phase 2.A provides a more elegant and integrated user experience
for the Default Mode's initialization.
