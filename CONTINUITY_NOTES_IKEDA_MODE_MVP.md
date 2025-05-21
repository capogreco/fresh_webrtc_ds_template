# Continuity Notes: Ikeda Mode MVP - Project State

## Date: (Current Date - please fill in when session resumes)

## 1. Current Major Goal

- Successfully implement and test the **Ikeda Mode MVP (Minimum Viable
  Product)**.
- **MVP Audio Target:** Continuous pink noise output from the synth client,
  controllable via global on/off (`ikedaGlobalOnOff`), pink noise level
  (`ikedaPinkNoiseLevel`), and master volume (`ikedaGlobalMasterVolume`).
  Includes an integrated volume check using `ikedaVolumeCheckLevel` as a _fixed
  reference level_ (not a UI slider during the check).
- **MVP Engine:** A new, simplified `IkedaModeMVPEngine` (located in
  `lib/synth/ikeda_mode/engine.ts`) is the active engine for this mode. Older,
  more complex `DefaultModeEngine` code has been backed up (e.g., in
  `lib/synth/default_mode/engine_COMPLEX_BACKUP.ts`).
- **Parameter Definitions:** Specific MVP parameters for Ikeda Mode are defined
  in `shared/modes/ikeda/params.ts`.
- **Mode Definitions & Switching:** Mode constants are in
  `shared/controllerModes.ts` (with `IKEDA` mode defined).
  `shared/modes/index.ts` maps `KNOWN_CONTROLLER_MODES.IKEDA` to
  `IKEDA_MODE_MVP_PARAMS`. `Controller.tsx` is set to default to `IKEDA` mode
  for current development.

## 2. Last Known State / Last Problem Addressed

- **Issue:** UI starting values in `Controller.tsx` (derived from
  `shared/modes/ikeda/params.ts` defaults) were not reliably matching the synth
  engine's actual initial parameter values upon startup/connection. This could
  cause value jumps when controls were first moved.
- **Solution Provided to Claude (Implementation Pending/Just Completed):**
  1. `Controller.tsx` to **proactively broadcast the full set of initial default
     parameters** for Ikeda Mode (from `globalDefaultModeParamsState.value`,
     which is initialized from `IKEDA_MODE_MVP_PARAMS`) to all synth clients
     immediately after this state is initialized (e.g., when `currentMode`
     becomes `IKEDA`).
  2. `useClientManager.ts` to have robust logic to send this full initial state
     to **newly connecting clients** after their data channel opens (first
     sending current mode, then the full parameter set for that mode).
  3. `AudioEngineService.ts` and `IkedaModeMVPEngine` would then use these
     controller-sent values to override their internal defaults, ensuring
     synchronization. `IKEDA_MVP_ENGINE_DEFAULTS` act as internal fallbacks if
     messages are missed.

## 3. Current Overall Implementation Status (Assumed after Claude implements the initial state sync fix)

- **Phase 0 (Project Cleanup & Prep for Ikeda MVP):** Believed complete (backups
  made, `ikeda/params.ts` created, `controllerModes.ts` updated,
  `Controller.tsx` defaults to Ikeda).
- **Phase MVP-1 (Minimal `IkedaModeMVPEngine`):** Believed implemented (simple
  pink noise engine in `lib/synth/ikeda_mode/engine.ts`).
- **Phase MVP-2 (Refactor `AudioEngineService.ts` for MVP):** Believed
  implemented (AES instantiates `IkedaModeMVPEngine`, routes MVP params
  directly, handles integrated volume check flow).
- **Parameter Routing Issues ("Unknown parameter", `this.addLog` TypeError,
  Recursion):** Believed to be resolved after significant debugging and the MVP
  engine rebuild.
- **Integrated Volume Check:** Logic should be in place (`ikedaVolumeCheckLevel`
  as reference, `confirmVolumeCheckComplete` flow).

## 4. Next Immediate Steps When Resuming

1. **Confirm Outcome of Initial State Synchronization Fix:**
   - Ask Claude for the status of implementing the fix described in section 2
     above (proactive broadcasting of initial params from `Controller.tsx`).
   - **Critical Test:** Is the Ikeda Mode MVP now producing audible pink noise
     _as expected_ after the volume check?
   - Do the UI controls in `Controller.tsx` for `ikedaGlobalOnOff`,
     `ikedaPinkNoiseLevel`, and `ikedaGlobalMasterVolume` correctly reflect the
     synth's _actual starting state_ and then control the sound without initial
     value jumps?
   - Are there _any_ remaining "Unknown parameter" errors or other critical
     console errors on either controller or synth client?

2. **If Still No Audio / Parameter Issues:**
   - Re-engage diagnostic mode:
     - Verify `AudioEngineService.activeMode` is correctly set to `IKEDA`.
     - Trace `ikedaGlobalOnOff` from controller to
       `IkedaModeMVPEngine.startFullEngine() / stopFullEngine()`.
     - Verify gain staging from `IkedaModeMVPEngine.pinkNoiseGain` through
       `IkedaModeMVPEngine.engineOutputGain` through
       `AudioEngineService.mainMixerInput`,
       `AudioEngineService.masterVolumeGain` to `audioContext.destination`. Use
       detailed logging of gain values at each point.

3. **If MVP is Working Correctly (Audio + Basic Controls):**
   - Formally mark **Phase MVP-3 (Testing the MVP)** from
     `IKEDA_MODE_MVP_REBUILD_PLAN.md` as complete.
   - Update `IKEDA_MODE_MVP_REBUILD_PLAN.md` and
     `CREATIVE_TEMPLATE_DESIGN_NOTES.md` to reflect the stable MVP state.

## 5. Long-Term Vision (Post-MVP - For Future Threads)

- Implement `useMidiDeviceManager.ts` for dynamic mode switching based on
  connected MIDI devices.
- Incrementally add back generative features to `IkedaModeMVPEngine`:
  - Basic Blips Layer (oscillator, rectangular envelope, simple F0/duration
    control).
  - Euclidean Rhythms for Blips.
  - Harmonic Ratio System & SIN for Blip Pitch.
  - SIN for Blip Duration.
  - Clicks Layer (similar incremental build-up).
  - Noise Layer rhythmic envelopes and SIN-driven rate.
  - Global Reverb fine-tuning and control.
- Scaffold other modes (Synth, Drone, Grid).
- Implement the `AdvancedLFONode` AudioWorklet and integrate it.
- Develop Ikeda Mode specific visuals.

## Key Files for Ikeda Mode MVP Implementation:

- **Shared Config:**
  - `shared/controllerModes.ts`
  - `shared/modes/ikeda/params.ts`
  - `shared/modes/index.ts`
  - `shared/synthParams.ts` (for `SynthParamDescriptor` type)
- **Synth Engine (Ikeda MVP):**
  - `lib/synth/ikeda_mode/types.ts`
  - `lib/synth/ikeda_mode/defaults.ts`
  - `lib/synth/ikeda_mode/engine.ts` (the `IkedaModeMVPEngine` class)
- **Services & Hooks:**
  - `services/AudioEngineService.ts`
  - `islands/hooks/useAudioEngine.ts`
- **UI / Controller:**
  - `islands/Controller.tsx`
  - `components/controller/SynthControls.tsx`
  - `islands/WebRTC.tsx` (for integrated volume check UI)
