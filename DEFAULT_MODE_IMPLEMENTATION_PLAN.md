````markdown
# Default Mode Implementation Plan

## 1. Objective

To implement the "Default Mode" for the WebRTC Creative Template, inspired by
Ryoji Ikeda. This mode will feature a minimalist aesthetic with generative audio
based on pink noise, sine blips, and clicks, controlled by Euclidean rhythms and
a "Harmonic Ratio System" using "Stochastic Integer Notation" (SIN) for
parameter definition.

This plan outlines the steps for shared definitions, controller client
modifications, and synth client engine implementation.

**Reference:** This plan builds upon `CREATIVE_TEMPLATE_DESIGN_NOTES.md`,
particularly section "4.4. Default Mode Design Details".

## 2. Overall Phasing

- **Phase 1:** Shared Definitions & Controller UI Foundation for Default Mode.
- **Phase 2:** Synth Client - Default Mode Engine Core Logic.
- **Phase 3 (Future):** Visuals and advanced input (e.g., keyboard).

---

## Phase 1: Shared Definitions & Controller UI Foundation

### Step 1.1: Define Default Mode Parameters (`shared/modes/default/params.ts`)

1. **Action:** Create a new file:
   `fresh_webrtc_ds_template/shared/modes/default/params.ts`.
2. **Action:** Populate this file with parameter descriptors specific to the
   Default Mode. Import `SynthParamDescriptor` from `../../synthParams.ts` (the
   global one) or redefine it if mode-specific variations are needed. For now,
   assume we can reuse or slightly extend the global `SynthParamDescriptor`.
   - Reference: Section "4.4.3. Control Parameters & UI" in
     `CREATIVE_TEMPLATE_DESIGN_NOTES.md`.
   - Ensure parameters using Stochastic Integer Notation (SIN) have
     `type: 'string'` and their `description` clearly indicates the SIN format
     (e.g., "SIN: 1 / 2 / 4 or 3-7").
   - Ensure parameters for selecting resolution modes have `type: 'enum'` and
     `enumValues: ["static", "random", "shuffle", "ascend", "descend"]`.

   **Example Structure for `shared/modes/default/params.ts`:**
   ```typescript
   import { type SynthParamDescriptor } from "../../synthParams.ts"; // Adjust path if SynthParamDescriptor is moved/redefined

   export const DEFAULT_MODE_PARAMS: readonly SynthParamDescriptor[] = [
     // --- Global Parameters ---
     {
       id: "defaultGlobalOnOff", // Prefix with mode to avoid clashes if ever merged
       label: "Master On/Off",
       type: "boolean",
       defaultValue: true,
       description: "Master play/stop for Default Mode rhythmic elements.",
     },
     {
       id: "defaultGlobalCPM",
       label: "CPM (Tempo)",
       type: "number",
       min: 10,
       max: 300,
       step: 1,
       defaultValue: 120,
       unit: "CPM",
       description: "Cycles Per Minute – main tempo/clock.",
     },
     {
       id: "defaultGlobalReverbAmount",
       label: "Reverb Mix",
       type: "number",
       min: 0,
       max: 1,
       step: 0.01,
       defaultValue: 0.25,
       unit: "%",
       description: "Wet/Dry mix for the global reverb.",
     },
     {
       id: "defaultGlobalMasterVolume",
       label: "Master Volume",
       type: "number",
       min: 0,
       max: 1,
       step: 0.01,
       defaultValue: 0.75,
       unit: "%",
       description: "Final output volume.",
     },

     // --- Noise Layer Parameters ---
     {
       id: "defaultNoiseType",
       label: "Noise Type",
       type: "enum",
       enumValues: ["pink", "white", "mixed"] as const,
       defaultValue: "pink",
       description: "Type of noise source.",
     },
     {
       id: "defaultNoiseRateNumeratorRule",
       label: "Noise Rate Num.",
       type: "string", // SIN
       defaultValue: "1",
       description:
         "SIN for Numerator of Harmonic Ratio for noise event rate (vs CPM). E.g., '1', '1/2/3', '1-4'.",
     },
     {
       id: "defaultNoiseRateDenominatorRule",
       label: "Noise Rate Denom.",
       type: "string", // SIN
       defaultValue: "4",
       description:
         "SIN for Denominator of Harmonic Ratio for noise event rate. E.g., '4', '2/4/8', '2-8'.",
     },
     {
       id: "defaultNoiseRateResolutionMode",
       label: "Noise Rate Mode",
       type: "enum",
       enumValues: [
         "static",
         "random",
         "shuffle",
         "ascend",
         "descend",
       ] as const,
       defaultValue: "static",
       description: "How SIN rules for noise rate are resolved by synth.",
     },
     {
       id: "defaultNoiseEnvelopeShape",
       label: "Noise Env Shape",
       type: "enum",
       enumValues: ["sine", "halfSineRise", "rectangular"] as const,
       defaultValue: "sine",
       description: "Amplitude envelope for noise events.",
     },
     {
       id: "defaultNoiseEnvelopeDurationRule",
       label: "Noise Env Dur.",
       type: "string", // SIN
       defaultValue: "0.5",
       description:
         "SIN for noise envelope duration in seconds. E.g., '0.5 / 1.0', '0.2-1.2'.",
     },
     {
       id: "defaultNoiseEnvelopeDurationResolutionMode",
       label: "Noise Env Dur. Mode",
       type: "enum",
       enumValues: [
         "static",
         "random",
         "shuffle",
         "ascend",
         "descend",
       ] as const,
       defaultValue: "static",
     },
     // ... other noise parameters like diversity if desired ...

     // --- Blips Layer Parameters ---
     // Pitch (Harmonic Ratio System)
     {
       id: "defaultBlipF0",
       label: "Blip f0",
       type: "number",
       min: 20,
       max: 2000,
       step: 1,
       defaultValue: 220,
       unit: "Hz",
       description: "Fundamental frequency for blip pitch.",
     },
     {
       id: "defaultBlipPitchNumeratorRule",
       label: "Blip Pitch Num.",
       type: "string", // SIN
       defaultValue: "1",
       description: "SIN for pitch ratio numerator.",
     },
     {
       id: "defaultBlipPitchDenominatorRule",
       label: "Blip Pitch Denom.",
       type: "string", // SIN
       defaultValue: "1",
       description: "SIN for pitch ratio denominator.",
     },
     {
       id: "defaultBlipPitchResolutionMode",
       label: "Blip Pitch Mode",
       type: "enum",
       enumValues: [
         "static",
         "random",
         "shuffle",
         "ascend",
         "descend",
       ] as const,
       defaultValue: "random",
     },
     // Duration
     {
       id: "defaultBlipDurationMsRule",
       label: "Blip Dur. (ms)",
       type: "string", // SIN
       defaultValue: "50",
       description:
         "SIN for blip duration in milliseconds. E.g., '20 / 50', '10-100'.",
     },
     {
       id: "defaultBlipDurationResolutionMode",
       label: "Blip Dur. Mode",
       type: "enum",
       enumValues: [
         "static",
         "random",
         "shuffle",
         "ascend",
         "descend",
       ] as const,
       defaultValue: "static",
     },
     // Rhythm (Euclidean)
     {
       id: "defaultBlipsEuclideanStepsRule",
       label: "Blip Steps",
       type: "string", // SIN
       defaultValue: "16",
       description: "SIN for total steps in Blip Euclidean pattern.",
     },
     {
       id: "defaultBlipsEuclideanPulsesRule",
       label: "Blip Pulses",
       type: "string", // SIN
       defaultValue: "4",
       description: "SIN for active pulses in Blip Euclidean pattern.",
     },
     {
       id: "defaultBlipsEuclideanOffsetRule",
       label: "Blip Offset",
       type: "string", // SIN
       defaultValue: "0",
       description: "SIN for rotation offset of Blip Euclidean pattern.",
     },
     {
       id: "defaultBlipsEuclideanResolutionMode",
       label: "Blip Euclidean Mode",
       type: "enum",
       enumValues: [
         "static",
         "random",
         "shuffle",
         "ascend",
         "descend",
       ] as const,
       defaultValue: "static",
       description:
         "How Blip Euclidean pattern rules are re-evaluated by synth.",
     },
     // ... other blip parameters like diversity ...

     // --- Clicks Layer Parameters ---
     // (Similar structure: Volume SIN/Mode, Euclidean SIN/Mode, Diversity SIN/Mode)
     // ...
   ];
   ```

### Step 1.2: Update `Controller.tsx` for Mode-Specific Parameters

1. **Action:** Modify `Controller.tsx`.
2. **Import:**
   ```typescript
   import { DEFAULT_MODE_PARAMS } from "../../shared/modes/default/params.ts";
   import {
     type ControllerMode,
     KNOWN_CONTROLLER_MODES,
   } from "../../shared/controllerModes.ts"; // Assuming this exists
   // Import useMidiDeviceManager (once created and integrated)
   // const { currentMode } = useMidiDeviceManager(addLog);
   ```
3. **Determine Active Parameter Set:**
   - Inside the `Controller` component, get the `currentMode.value` (from
     `useMidiDeviceManager` once integrated. For now, can be hardcoded to
     `KNOWN_CONTROLLER_MODES.DEFAULT` for testing).
   - Based on `currentMode.value`, select the appropriate parameter descriptor
     array:
     ```typescript
     const activeSynthParams = computed(() => {
       // const mode = currentMode.value; // From useMidiDeviceManager
       const mode = KNOWN_CONTROLLER_MODES.DEFAULT; // Placeholder for now
       if (mode === KNOWN_CONTROLLER_MODES.DEFAULT) {
         return DEFAULT_MODE_PARAMS;
       }
       // Later, add cases for SYNTH_MODE, DRONE_MODE, GRID_MODE to load their specific params
       // For now, other modes could fall back to global SYNTH_PARAMS or an empty array
       return []; // Or global SYNTH_PARAMS from shared/synthParams.ts
     });
     ```
4. **Pass to `ClientList.tsx` / `SynthControls.tsx`:**
   - The `ClientList` component (or wherever `SynthControls` is rendered per
     client) needs to receive this `activeSynthParams.value` array.
   - Modify `ClientListProps` (in `ClientList.tsx`) to accept
     `paramDescriptors: readonly SynthParamDescriptor[]`.
   - `Controller.tsx` passes `activeSynthParams.value` to `ClientList`.
   - `ClientList.tsx` then passes these `paramDescriptors` to each
     `SynthControls` instance.

### Step 1.3: Update `SynthControls.tsx`

1. **Action:** Modify
   `fresh_webrtc_ds_template/components/controller/SynthControls.tsx`.
2. **Props:** Update `SynthControlsProps` to receive `paramDescriptors`:
   ```typescript
   interface SynthControlsProps {
     clientId: string;
     params: Record<string, any>; // Current values for this client
     paramDescriptors: readonly SynthParamDescriptor[]; // NEW: Definitions for controls
     onParamChange: (paramId: string, value: unknown) => void;
   }
   ```
3. **Dynamic Rendering Loop:**
   - The main loop for generating controls should now iterate over
     `props.paramDescriptors` instead of the global `SYNTH_PARAMS`.
   - The logic for rendering `number`, `enum`, `boolean` types based on
     `descriptor.type` remains similar.
   - **New:** For `descriptor.type === 'string'` (intended for SIN inputs):
     - Render an `<input type="text">`.
     - `value={String(currentValue)}`
     - `onInput={(e) => onParamChange(descriptor.id, e.currentTarget.value)}`
       (send the raw string).
   - The filter `descriptor.id !== 'oscillatorEnabled'` in the map loop might
     need adjustment if Default Mode doesn't use `oscillatorEnabled` but uses
     `defaultGlobalOnOff`. Ensure the "Note On/Off" section is contextually
     relevant or hidden/replaced for Default Mode. _For Default Mode, we might
     hide the generic Note On/Off button and rely on `defaultGlobalOnOff`_.

### Step 1.4: Message Passing (Controller to Synth)

1. **Action:** Review `useClientManager.ts` method `updateClientSynthParam` (or
   equivalent).
2. **Ensure:** It correctly sends the `paramId` (e.g.,
   `"defaultBlipPitchNumeratorRule"`) and the `value` (which will be the raw SIN
   string, e.g., `"1 / 2 / 4"`, or the selected enum string for resolution
   modes, or a number/boolean for direct params) to the synth client using the
   existing `{ type: "synth_param", param: string, value: any }` message
   structure. No changes should be strictly needed here if `value: any` is
   already handled.

---

## Phase 2: Synth Client - Default Mode Engine

_(This phase will be implemented after Phase 1 is functional and tested.
Instructions for Claude will be very detailed for each sub-step.)_

Step 2.1: `AudioEngineService.ts` (or a new dedicated
`DefaultModeAudioEngine.ts` module it uses) - Implementation Details

This step involves building the core audio generation logic for the Default Mode
within the synth client's `AudioEngineService`. If `AudioEngineService` is
becoming too complex, consider creating a new class/module
`DefaultModeAudioEngine.ts` that `AudioEngineService` instantiates and delegates
to when the mode is "default".

**1. Browser Compatibility & Performance Considerations:** * **Target
Browsers:** Modern versions of Chrome, Firefox, Safari, Edge (supporting WebRTC,
Web Audio API, AudioWorklet). * **Performance:** Prioritize smooth, glitch-free
audio from the audio thread. Main thread operations for parameter updates and
logic should be efficient. The Default Mode's complexity should run well on
average user hardware.

**2. Web Audio API Implementation Strategy:** * **General:** Use standard Web
Audio API nodes where efficient and sufficient. Use AudioWorklets for custom DSP
or precise sample-level control. * **Noise Source (Pink/White):** * **Initial
Implementation:** Use `AudioBufferSourceNode` with pre-generated looped noise
buffers (1-5 seconds). * Include a utility function
`generateNoiseBuffer(audioContext: AudioContext, type: 'pink' | 'white', durationSeconds: number): AudioBuffer`.
For pink noise, use a standard algorithm like Voss-McCartney or filtered white
noise. * **Noise Envelope (Sinusoidal):** Standard `GainNode` modulated by an
`OscillatorNode` (LFO 'sine' type) or by shaping `AudioParam` automation curves
(e.g., `setValueCurveAtTime`). * **Sine Blips Oscillator:** Standard
`OscillatorNode` (type 'sine'). * **Blip Envelope (Rectangular):** Standard
`GainNode` controlled with `setValueAtTime()` for sharp on/off. * **Clicks:**
Implement as an `AudioWorkletNode`. See **Sub-step 2.1.8**. * **Global Reverb:**
Start with `ConvolverNode` and a few provided public domain Impulse Responses
(IRs). * **Mixing & Master Volume:** Standard `GainNode`s.

**3. Stochastic Integer Notation (SIN) Parser Utility:** * **Action:** Implement
a utility function within `AudioEngineService` (or a shared helper):
`parseSINString(rule: string): number[]` * **Functionality:** * Input: SIN
string (e.g., `"N"`, `"N / M / P"`, `"N-M"`). * Output: An array of numbers. *
Handles: * `"N"` -> `[N_parsed]` (e.g., `"5"` -> `[5]`) * `"N / M / P"` ->
`[N_parsed, M_parsed, P_parsed]` (trims spaces, splits by `/`, `parseFloat` each
part). * `"N-M"` -> `[N_int, N_int+1, ..., M_int]` (parses N, M as integers,
generates integer range). * (Optional: if float ranges like `"1.0-5.0"` by a
step are needed, extend parsing. For now, integer ranges for `N-M` are primary).

- Error Handling: Should gracefully handle malformed strings or non-numeric
  parts (e.g., return `[defaultValue]` or an empty array and log a warning).

**4. `SINResolver` Helper Class/Object:** * **Action:** Implement a helper class
or factory function to create `SINResolver` instances. Each instance manages one
SIN-controlled parameter set. * **Constructor/Update Method Input:**
`(ruleString: string, resolutionMode: ControllerModeResolution)` where
`ControllerModeResolution` is
`"static" | "random" | "shuffle" | "ascend" | "descend"`. * **Internal State:**

- `parsedValues: number[]` (from `parseSINString(ruleString)`). *
  `currentMode: ControllerModeResolution`. * `currentIndex: number` (for
  shuffle, ascend, descend). * `shuffledValues: number[]` (for shuffle mode,
  re-shuffled when rule/mode changes). * `staticValue: number | null` (for
  static mode). * **`getValue(): number` Method:** * `static`: If `staticValue`
  is null (or rule/mode changed), picks one value from `parsedValues` (e.g.,
  first or random), stores it. Returns `staticValue`. * `random`: Returns a
  random element from `parsedValues`. * `shuffle`: Returns
  `shuffledValues[currentIndex]`. Increments `currentIndex` (loops around
  `shuffledValues.length`). * `ascend`: Returns `parsedValues[currentIndex]`
  (ensure `parsedValues` is sorted ascending after parsing). Increments
  `currentIndex` (loops). * `descend`: Returns
  `parsedValues[parsedValues.length - 1 - currentIndex]` (if `parsedValues`
  sorted ascending). Increments `currentIndex` (loops). * **Re-initialization:**
  When `ruleString` or `resolutionMode` is updated for a `SINResolver` instance,
  it must re-parse, re-sort/re-shuffle internal arrays, reset `currentIndex`,
  and clear `staticValue`.

**5. Euclidean Algorithm Utility:** * **Action:** Implement
`generateEuclideanPattern(steps: number, pulses: number, offset: number = 0): boolean[]`.

- **Algorithm:** Use Bjorklund's algorithm or an equivalent to distribute
  `pulses` as evenly as possible in `steps`. Apply `offset` for rotation. *
  **Output:** Array of booleans, length `steps`.

**6. State Management for Default Mode Parameters & Rules:** * **Action:** When
`AudioEngineService` is set to "Default Mode" (e.g., via `setMode('default')`
called by `useAudioEngine`): * Initialize internal state variables to store all
received SIN rules, resolution modes, and direct parameter values from
`shared/modes/default/params.ts` (e.g., `this.defaultGlobalCPM`, `this.blipF0`,
etc.). * For each parameter set controlled by SIN (e.g., Blip Pitch Numerator,
Blip Duration, Blip Euclidean Steps), create and store an instance of
`SINResolver`. * Store current Euclidean patterns for Blips and Clicks
(`this.blipPattern: boolean[]`, `this.clickPattern: boolean[]`) and their
current step indices.

**7. Parameter Update Handler for Default Mode:** * **Action:** When
`AudioEngineService` receives a `synth_param` message (forwarded by
`useAudioEngine`) and is in Default Mode: * Identify the target parameter by its
`paramId` (e.g., `defaultBlipPitchNumeratorRule`,
`defaultBlipPitchResolutionMode`, `defaultGlobalCPM`). * If `paramId` is a SIN
rule string: Update the rule in the corresponding `SINResolver` instance
(triggering its re-initialization). * If `paramId` is a resolution mode: Update
the mode in the corresponding `SINResolver` (triggering its re-initialization).

- If `paramId` is a direct value (e.g., `defaultGlobalCPM`, `defaultBlipF0`):
  Update the internal state variable directly. * If `paramId` relates to
  Euclidean pattern generation (e.g., `defaultBlipsEuclideanStepsRule`,
  `defaultBlipsEuclideanResolutionMode`), update the relevant `SINResolver` or
  the mode. This will trigger a new pattern generation at the appropriate time
  (see Triggering Logic).

**8. Audio Graph Construction for Default Mode:** * **Action:** Implement logic
(e.g., in a `setupDefaultModeGraph()` method) to create and connect audio nodes
as per "Section 4.4.4. Synth Client Audio Graph" in
`CREATIVE_TEMPLATE_DESIGN_NOTES.md`. * Sources: Pink/White Noise
(`AudioBufferSourceNode` with generated buffers), Sine Oscillator for Blips
(`OscillatorNode`), Click Worklet Node. * Envelopes: `GainNode`s for Blips
(rectangular), Noise (sinusoidal/configurable). * Mixer: `GainNode`s for summing
dry signals. * Effects: `ConvolverNode` for reverb. * Output: `GainNode`s for
dry/wet mix, master volume, connected to `audioContext.destination`. * Store
references to key controllable nodes (e.g., blip oscillator, envelope gains,
reverb wet gain, master volume gain).

**9. Master Clock & Triggering Logic:** * **Action:** Implement a master clock
(e.g., using `requestAnimationFrame` or a precise `setInterval`/`setTimeout`
loop driven by `defaultGlobalCPM`). * **Noise Layer Triggering:** * On each
master clock tick (or derived sub-tick), determine if a noise event should occur
based on the Harmonic Ratio System relative to CPM: * Get current `num` and
`den` for noise rate from their `SINResolver`s. * Calculate event interval:
`(60 / cpm) * (den / num)`. Schedule next event. * On noise event: * Get
`duration` from its `SINResolver`. * Get `envelopeShape` from its parameter. *
Trigger the noise source's gain envelope (e.g., modulate gain with an LFO for
sinusoidal, or use `setValueAtTime` for rectangular if that shape is chosen). *
**Blips Layer Triggering:** * Euclidean Pattern Management: * When the current
`blipPattern` completes its cycle (its step index returns to 0): * If the
`defaultBlipsEuclideanResolutionMode` dictates a change: * Get new `steps`,
`pulses`, `offset` by calling `getValue()` on their respective `SINResolver`s. *
Generate a new `blipPattern` using `generateEuclideanPattern()`. * Reset
`blipStepIndex`. * On each master clock tick relevant to the blip layer's
rhythm: * If `blipPattern[blipStepIndex]` is true: * Resolve Blip Pitch: Get
`f0`, `num` (from Numerator `SINResolver`), `den` (from Denominator
`SINResolver`). Calculate `targetFreq = f0 * num / den`. * Resolve Blip
Duration: Get `durationMs` from its `SINResolver`. * Set blip `OscillatorNode`
frequency to `targetFreq`. * Trigger rectangular envelope on blip `GainNode` for
`durationMs`. * Increment `blipStepIndex`. * **Clicks Layer Triggering:**
Similar to Blips Layer, using its own Euclidean parameters, SIN resolvers, and
resolution mode. When triggered, get `clickVolume` (from its `SINResolver`) and
trigger the Click AudioWorklet.

**10. Click AudioWorklet (`public/audio-worklets/ClickProcessor.js` and
corresponding Node):** * **Action:** Create `ClickProcessor.js`. *
**`ClickProcessor.js` (`AudioWorkletProcessor`):** * Define a parameter for
`trigger` (e.g., an `AudioParam` that when it receives a value > 0, it outputs a
click). Or, use message passing to trigger. For simplicity, an `AudioParam`
trigger is often easier. * `process()` method: When triggered, output a very
short audio impulse (e.g., a few samples of a square wave, or a single non-zero
sample followed by zeros). * **`AudioEngineService.ts`:** * Load the worklet
module:
`audioContext.audioWorklet.addModule('audio-worklets/ClickProcessor.js')`. *
Create an instance:
`const clickNode = new AudioWorkletNode(audioContext, 'click-processor');` * To
trigger:
`clickNode.parameters.get('trigger').setValueAtTime(1, audioContext.currentTime);`
(and perhaps reset to 0 shortly after).

### Step 2.A.1: Verify & Align Default Mode Engine Features (Post-Claude's Initial Build)

**Objective:** Based on Claude's feedback on the initial engine build
(`engine.ts` and related utilities), provide targeted guidance to ensure its
features align precisely with the Default Mode's design specifications,
particularly for envelopes, reverb, clicks, noise types, and clock features.

**Reference Claude's Feedback Summary:** (Dated around user message timestamp
for "Claude has read step 2.A.1")

1. **Envelopes:**
   - **Claude's Current State:**
     - Blips: Uses direct manipulation on a `GainNode` within `triggerClick`
       method; states "worklet creates a rectangular shape." This seems to
       conflate blips (sine tones) with clicks (impulses/worklet).
     - Noise: `triggerNoise` uses `linearRampToValueAtTime` for a quick fade-in.
   - **Action (Guidance for Claude):**
     - "Thank you for the update. There might be a slight misunderstanding
       regarding blips and clicks, and the noise envelope:
       - **For Blips (Sine Tones):**
         - Blips should be generated by a standard `OscillatorNode` (type
           'sine').
         - The output of this oscillator must pass through its own dedicated
           `GainNode`.
         - This `GainNode` should be used to apply a **true rectangular
           envelope**: instant attack to full amplitude, sustain at full
           amplitude for the duration specified by the resolved
           `defaultBlipDurationMsRule`, then instant release to zero. Use
           `gain.setValueAtTime(1.0, now); gain.setValueAtTime(0.0, now + resolvedDurationSeconds);`.
         - The `triggerClick` method and the Click AudioWorklet are for the
           separate "Clicks Layer", not for sine blips.
       - **For Noise Events:**
         - The current `linearRampToValueAtTime` for noise fade-in is not the
           intended shape.
         - Please modify the noise event envelope logic:
           - If `defaultNoiseEnvelopeShape` is `'rectangular'`, use
             `setValueAtTime` on the noise's `GainNode` for an instant on/off
             based on the resolved `defaultNoiseEnvelopeDurationRule`.
           - If `defaultNoiseEnvelopeShape` is `'sine'` or `'halfSineRise'`,
             implement a sinusoidal amplitude modulation. This can be done by
             modulating the noise's `GainNode` with an LFO (another
             `OscillatorNode` precisely timed and phased) or by using
             `setValueCurveAtTime()` with a sine-shaped array over the resolved
             `defaultNoiseEnvelopeDurationRule`.
       - **Parameter Mapping:** Ensure `defaultBlipDurationMsRule` controls the
         sine blip's rectangular envelope duration. `defaultNoiseEnvelopeShape`
         and `defaultNoiseEnvelopeDurationRule` control the noise event
         envelopes.
       - The general "ADSR envelope control" you mentioned is appreciated for
         future flexibility but should not be the primary mechanism for the
         specific Default Mode blip and noise envelopes unless it can perfectly
         replicate the described rectangular and sinusoidal shapes via its
         parameters."

2. **Reverb Implementation:**
   - **Claude's Current State:** `ConvolverNode` based; "dynamic impulse
     response" refers to programmatic generation of IR based on decay time
     parameters.
   - **Action (Guidance for Claude):**
     - "This approach for reverb (programmatically generated IR for a
       `ConvolverNode`) is excellent and acceptable for the Default Mode. Ensure
       the `defaultGlobalReverbAmount` parameter correctly controls the wet/dry
       mix for this effect. No changes needed here if it functions as a standard
       convolver with a generated IR."

3. **Click AudioWorklet:**
   - **Claude's Current State:** Embedded in `engine.ts` as
     `CLICK_PROCESSOR_CODE`, loaded via Blob URL, triggered by
     `postMessage({ type: 'trigger', time })`.
   - **Action (Guidance for Claude):**
     - "This implementation for the Click AudioWorklet is perfectly fine. Thank
       you. Ensure the `defaultClickVolumeRule` (once resolved from its SIN
       string) controls the amplitude of the generated clicks, perhaps by
       sending a volume parameter along with the 'trigger' message or by having
       a settable volume parameter within the worklet."

4. **Noise Generation Types:**
   - **Claude's Current State:** Includes white, pink, brown, blue, violet.
     `defaultNoiseType` parameter from controller will determine selection.
     "mixed" type not yet implemented.
   - **Action (Guidance for Claude):**
     - "The variety of noise types is a great addition.
       - For the `defaultNoiseType` parameter from
         `shared/modes/default/params.ts` (which has
         `enumValues: ["pink", "white", "mixed"]`):
         - Ensure "pink" selects pink noise.
         - Ensure "white" selects white noise.
         - For `"mixed"`, please implement it by **randomly selecting between
           'pink' and 'white' noise each time a noise event is triggered** by
           its scheduler.
       - The other noise types (brown, blue, violet) can remain available in the
         engine. If we want to control them later, we can expand the
         `defaultNoiseType` enum or add another parameter."

5. **Master Clock - Swing and Humanization:**
   - **Claude's Current State:** Implemented, can be disabled by setting their
     respective parameters (e.g., `params.timing.swing`,
     `params.timing.humanize`) to 0. Humanization defaults to 0.05 (5%).
   - **Action (Guidance for Claude):**
     - "Excellent. For the Default Mode's initial state, we want maximum
       precision. Please ensure that the _internal default values_ within your
       `engine.ts` (or its `defaults.ts`) for any swing and humanization
       parameters are explicitly set to `0`. This way, the mode starts with
       perfect timing unless a user later changes these parameters (once they
       are exposed in `shared/modes/default/params.ts`)."

**General Confirmation for Claude:**

- "Please confirm that all parameter IDs defined in
  `shared/modes/default/params.ts` (e.g., `defaultGlobalCPM`, `defaultBlipF0`,
  `defaultBlipPitchNumeratorRule`, `defaultNoiseRateResolutionMode`, etc.) are
  recognized by your `engine.ts` and are correctly mapped to control the
  corresponding functionalities and `SINResolver` instances."
- "The organization of the engine into a `DefaultModeEngine` class within
  `engine.ts`, using utilities from `sin_parser.ts`, `sin_resolver.ts`, and
  `euclidean.ts`, sounds like a very good structure."

Once these clarifications are addressed and any necessary adjustments are made
by Claude to the `engine.ts` and its components, the engine should be ready for
integration as per Steps 2.A.2 onwards.

Step 2.A.2: Prepare `AudioEngineService.ts` for Mode Switching

**Objective:** Modify `AudioEngineService.ts` to manage different audio engines
based on the controller's current mode. It needs to be able to initialize,
switch between, and clean up resources for these different engines.

1. **File:** `fresh_webrtc_ds_template/services/AudioEngineService.ts`
2. **Imports:**
   - Import `ControllerMode` and `KNOWN_CONTROLLER_MODES` from
     `../shared/controllerModes.ts`.
   - Import the `DefaultModeEngine` class (or equivalent constructor/main
     object) that Claude created (presumably in
     `../synth/modes/default/engine/engine.ts` or similar).
   - `// import { type DefaultModeEngine } from "../synth/modes/default/engine/engine.ts";`
   - `// import { type DefaultModeParams } from "../shared/modes/default/params.ts";`
     (if needed for typing initial params)
3. **Add Internal State Variables:**
   - `private activeMode: ControllerMode | null = null;`
   - `private currentModeEngine: DefaultModeEngine | /* OtherEngineType | */ null = null;`
     - _(Define `DefaultModeEngine` type/interface based on what Claude's engine
       class provides, e.g., methods like `updateParam(id, val)`,
       `getOutputNode()`, `cleanup()`)_.
   - `private previousEngineOutputNode: AudioNode | null = null;` (To help with
     clean disconnections)
   - `private mainMixerInput: GainNode;` // Entry point for all engine outputs
     before global effects
   - `private globalReverb: ConvolverNode | null = null;` // Or your reverb
     implementation
   - `private reverbWetGain: GainNode | null = null;`
   - `private reverbDryGain: GainNode | null = null;`
   - `private masterVolumeGain: GainNode;`
   - `private analyserNode: AnalyserNode;`
4. **Initialize Core Audio Graph in Constructor (or an `init` method):**
   - Create `this.audioContext` if not already.
   - Create `this.mainMixerInput = this.audioContext.createGain();`
   - Create `this.masterVolumeGain = this.audioContext.createGain();`
   - Create `this.analyserNode = this.audioContext.createAnalyser();`
   - Setup reverb:
     - `this.globalReverb = this.audioContext.createConvolver();` (Load default
       IR or prepare for generated IR)
     - `this.reverbWetGain = this.audioContext.createGain();`
     - `this.reverbDryGain = this.audioContext.createGain();`
     - `this.mainMixerInput.connect(this.reverbDryGain);`
     - `this.mainMixerInput.connect(this.globalReverb);`
     - `this.globalReverb.connect(this.reverbWetGain);`
     - `this.reverbDryGain.connect(this.masterVolumeGain);`
     - `this.reverbWetGain.connect(this.masterVolumeGain);`
   - Connect analyser and master volume:
     - `this.masterVolumeGain.connect(this.analyserNode);`
     - `this.analyserNode.connect(this.audioContext.destination);`
   - Set initial `defaultGlobalMasterVolume` and `defaultGlobalReverbAmount`
     (e.g., from `DEFAULT_MODE_PARAMS` if service is mode-aware at init, or use
     hardcoded defaults).
5. **Implement
   `setMode(newMode: ControllerMode, initialParams?: Record<string, any>): void`
   Method:**
   - This public method will be called by `useAudioEngine` when the controller
     signals a mode change.
   - **Logic:**
     ```typescript
     public setMode(newMode: ControllerMode, initialParams?: Record<string, any>): void {
       if (this.activeMode === newMode && this.currentModeEngine) {
         this.addLog(`AudioEngineService: Already in mode: ${newMode}. Applying initial params if provided.`);
         if (this.currentModeEngine && typeof (this.currentModeEngine as any).applyFullParams === 'function' && initialParams) {
            (this.currentModeEngine as any).applyFullParams(initialParams);
         }
         return;
       }

       this.addLog(`AudioEngineService: Switching mode from ${this.activeMode} to ${newMode}.`);

       // 1. Cleanup existing engine & disconnect its output
       if (this.currentModeEngine) {
         if (typeof (this.currentModeEngine as any).getOutputNode === 'function') {
           const oldEngineOutput = (this.currentModeEngine as any).getOutputNode() as AudioNode | null;
           if (oldEngineOutput) {
             try {
               oldEngineOutput.disconnect(); // Disconnect from wherever it was connected
               this.addLog(`AudioEngineService: Disconnected previous engine output.`);
             } catch (e) {
               this.addLog(`AudioEngineService: Error disconnecting previous engine output: ${e}`);
             }
           }
         }
         if (typeof (this.currentModeEngine as any).cleanup === 'function') {
           (this.currentModeEngine as any).cleanup();
           this.addLog(`AudioEngineService: Cleaned up previous engine for mode ${this.activeMode}.`);
         }
         this.currentModeEngine = null;
         this.previousEngineOutputNode = null;
       }

       // 2. Instantiate and initialize new engine based on newMode
       this.activeMode = newMode;
       switch (newMode) {
         case KNOWN_CONTROLLER_MODES.DEFAULT:
           try {
             this.currentModeEngine = new DefaultModeEngine(
               this.audioContext,
               (logMessage: string) => this.addLog(`DefaultEngine: ${logMessage}`),
               initialParams || {}
             );
             this.addLog(`AudioEngineService: DefaultModeEngine initialized.`);
             this.connectCurrentEngineOutput();
           } catch (error) {
             this.addLog(`AudioEngineService: Error initializing DefaultModeEngine: ${error}`);
             console.error("Error initializing DefaultModeEngine:", error);
             this.activeMode = null;
           }
           break;
         // case KNOWN_CONTROLLER_MODES.SYNTH_MODE: ...
         default:
           this.addLog(`AudioEngineService: Mode ${newMode} not yet supported. No engine loaded.`);
           this.currentModeEngine = null;
           this.activeMode = null;
           break;
       }
     }
     ```
6. **`addLog` Method:** Ensure `AudioEngineService` has or receives an `addLog`
   function.

---

### Step 2.A.3: Integrate Default Mode Engine into `AudioEngineService.ts`

**Objective:** Connect the Default Mode engine into the `AudioEngineService`'s
main audio graph and parameter update flow.

1. **File:** `fresh_webrtc_ds_template/services/AudioEngineService.ts`
2. **Parameter Update Routing:**
   - Modify `public updateParameter(paramId: string, value: any): void`.
   - **Logic:**
     ```typescript
     public updateParameter(paramId: string, value: any): void {
       this.addLog(`AES.updateParameter: Received paramId='${paramId}', value='${String(value)}', activeMode='${this.activeMode}'`);

       // Handle global parameters directly by AudioEngineService
       if (paramId === "defaultGlobalMasterVolume") { // Use exact ID from shared/modes/default/params.ts
         this.masterVolumeGain.gain.setTargetAtTime(Number(value), this.audioContext.currentTime, 0.01);
         this.addLog(`AES: Set master volume to ${value}`);
         return;
       }
       if (paramId === "defaultGlobalReverbAmount") { // Use exact ID
         const wetValue = Number(value);
         const dryValue = 1 - wetValue;
         if (this.reverbWetGain) this.reverbWetGain.gain.setTargetAtTime(wetValue, this.audioContext.currentTime, 0.01);
         if (this.reverbDryGain) this.reverbDryGain.gain.setTargetAtTime(dryValue, this.audioContext.currentTime, 0.01);
         this.addLog(`AES: Set reverb mix to ${value} (Wet: ${wetValue}, Dry: ${dryValue})`);
         return;
       }

       // Forward other parameters to the current mode engine
       if (!this.currentModeEngine) {
         this.addLog(`AES.updateParameter: Cannot update param '${paramId}', no active mode engine.`);
         return;
       }

       if (this.activeMode === KNOWN_CONTROLLER_MODES.DEFAULT) {
         if (typeof (this.currentModeEngine as DefaultModeEngine).updateParam === 'function') {
           // The DefaultModeEngine's updateParam should handle its specific parameters
           // including using param_utils.ts for mapping if that's its internal design.
           this.addLog(`AES.updateParameter: Forwarding to DefaultModeEngine: ID='${paramId}', Value='${String(value)}'`);
           (this.currentModeEngine as DefaultModeEngine).updateParam(paramId, value);
         } else {
           this.addLog(`AES.updateParameter: DefaultModeEngine does not have an updateParam method.`);
         }
       } else if (this.activeMode /* === other modes */) {
         // Handle params for other modes
       } else {
          this.addLog(`AES.updateParameter: Param '${paramId}' not handled in mode '${this.activeMode}'.`);
       }
     }
     ```
3. **Implement `private connectCurrentEngineOutput(): void` Method:**
   - **Logic:**
     ```typescript
     private connectCurrentEngineOutput(): void {
       if (!this.currentModeEngine || typeof (this.currentModeEngine as any).getOutputNode !== 'function') {
         this.addLog("AES.connectCurrentEngineOutput: Current mode engine or its getOutputNode method is not available.");
         return;
       }
       const engineOutputNode = (this.currentModeEngine as any).getOutputNode() as AudioNode | null;

       if (!engineOutputNode) {
          this.addLog("AES.connectCurrentEngineOutput: Engine output node is null or undefined.");
          return;
       }

       this.previousEngineOutputNode = engineOutputNode; // Store for later disconnection if needed

       try {
         // Connect engine's output to the mainMixerInput, which then feeds dry path & reverb path
         engineOutputNode.connect(this.mainMixerInput);
         this.addLog(`AES.connectCurrentEngineOutput: Connected output of ${this.activeMode} engine to mainMixerInput.`);
       } catch (error) {
         this.addLog(`AES.connectCurrentEngineOutput: Error connecting engine output: ${error}`);
         console.error("Error connecting engine output:", error);
       }
     }
     ```
   - Called from `setMode()` after new engine instantiation.
   - The `DefaultModeEngine` class (Claude's `engine.ts`) needs
     `getOutputNode(): AudioNode`.
4. **FFT Data Source:**
   - The `this.analyserNode` (created in constructor/init) is already connected
     after `this.masterVolumeGain`. This will analyze the final mixed output.
     This is fine.

---

### Step 2.A.4: Updates to `useAudioEngine.ts` and `WebRTC.tsx`

**(This step's content remains largely the same as previously planned, ensuring
mode propagation.)**

**Objective:** Enable `useAudioEngine` to instruct `AudioEngineService` to
switch modes based on information received from `WebRTC.tsx`.

1. **File:** `fresh_webrtc_ds_template/islands/WebRTC.tsx`
   - **Action:**
     - Ensure `WebRTC.tsx` has
       `currentControllerMode = useSignal<ControllerMode>(KNOWN_CONTROLLER_MODES.DEFAULT);`.
     - When `WebRTC.tsx` receives a `controller_mode_update` message (from
       controller via data channel) in `handleChannelMessage`, it updates
       `currentControllerMode.value`.
     - Pass `currentControllerMode` signal to `useAudioEngine`:
       ```typescript
       // In WebRTC.tsx
       // const audio = useAudioEngine(addLog, currentControllerMode); // If positional
       const audio = useAudioEngine({
         addLog,
         currentControllerModeSignal: currentControllerMode,
       }); // If props object
       ```

2. **File:** `fresh_webrtc_ds_template/islands/hooks/useAudioEngine.ts`
   - **Action:**
     - Modify `UseAudioEngineProps` (if using props object) or function
       signature to accept
       `currentControllerModeSignal: Signal<ControllerMode>`.
     - Add/confirm the `useEffect` that listens to changes in
       `props.currentControllerModeSignal.value`:
       ```typescript
       useEffect(() => {
         const newMode = props.currentControllerModeSignal.value; // Assuming prop name
         if (newMode && audioEngineServiceRef.current) {
           props.addLog(
             `useAudioEngine: Controller mode changed to ${newMode}. Instructing AudioEngineService.`,
           );
           // Controller should ideally re-broadcast current params for the new mode upon mode switch confirmation.
           // For now, AudioEngineService.setMode will use its own defaults for the new mode if initialParams not sent.
           audioEngineServiceRef.current.setMode(
             newMode, /*, optionalInitialParams */
           );
         }
       }, [props.currentControllerModeSignal.value]); // React to mode value change
       ```
     - Ensure generic `synth_param` messages received by `useAudioEngine` (via
       its `updateSynthParam` method) are still forwarded to
       `audioEngineServiceRef.current?.updateParameter(paramId, value)`.

---

### Step 2.A.5: Testing and Verification for Phase 2.A

**(This step's content remains largely the same as previously planned, a
comprehensive testing checklist.)**

**Objective:** Thoroughly test the integrated Default Mode engine, ensuring
parameter changes from the controller UI correctly affect the audio output via
the new mode-switching and engine architecture.

1. **Mode Switching Test:**
   - (Once `useMidiDeviceManager` or a manual mode switch in `Controller.tsx` is
     implemented) Test switching from another mode (e.g., a stubbed "Synth
     Mode") to "Default Mode".
   - **Verify:** `AudioEngineService` logs show mode change, cleanup of old
     engine (if any), initialization of `DefaultModeEngine`, and connection of
     its output.
2. **Initial Default Mode Audio & `defaultGlobalOnOff`:**
   - Start the application. Controller should activate "Default Mode". Synth
     client connects.
   - **Verify:** Parameter `defaultGlobalOnOff` from
     `shared/modes/default/params.ts` is controllable from the UI.
   - When `defaultGlobalOnOff` is `true`: Audio output begins, matching internal
     defaults of `DefaultModeEngine`.
   - When `defaultGlobalOnOff` is `false`: Rhythmic/generative audio stops.
3. **Global Parameter Testing (`defaultGlobalCPM`, `defaultGlobalMasterVolume`,
   `defaultGlobalReverbAmount`):**
   - Change `defaultGlobalCPM`: Verify overall tempo changes.
   - Change `defaultGlobalMasterVolume`: Verify `AudioEngineService`'s master
     volume gain changes.
   - Change `defaultGlobalReverbAmount`: Verify `AudioEngineService`'s reverb
     wet/dry mix changes.
4. **SIN Parameter Testing (Blips Layer - Pitch, Duration; Euclidean Params):**
   - Modify `defaultBlipF0`.
   - Modify `defaultBlipPitchNumeratorRule`, `DenominatorRule`, and
     `ResolutionMode`.
   - **Verify:** Blip pitches change according to the rules and active
     resolution mode.
   - Test `defaultBlipDurationMsRule` and its resolution mode.
   - Test `defaultBlipsEuclideanStepsRule`, `PulsesRule`, `OffsetRule`, and
     `ResolutionMode`. Verify rhythms change and patterns re-evaluate as per
     "Option A" (after pattern cycle completion).
5. **SIN Parameter Testing (Noise Layer - Rate, Envelope Duration):**
   - Modify `defaultNoiseType`.
   - Modify `defaultNoiseRateNumeratorRule`, `DenominatorRule`, and
     `ResolutionMode`. Verify noise event timing relative to CPM.
   - Modify `defaultNoiseEnvelopeShape`, `DurationRule`, and `ResolutionMode`.
     Verify noise envelope.
6. **SIN Parameter Testing (Clicks Layer - Volume, Euclidean Params):**
   - Test `defaultClickVolumeRule` and its resolution mode.
   - Test Euclidean rhythm parameters for clicks and their resolution mode.
7. **Console Logs & Error Checking:**
   - Monitor browser consoles on both controller and synth for "Unknown
     parameter" errors or any other new errors. Logs should clearly trace
     parameter flow and engine actions.
8. **Multiple Synth Clients (If possible):**
   - Verify global Default Mode parameter changes from the controller affect
     _both_ synth clients consistently.

---

1. **Action (`WebRTC.tsx`):**
   - Ensure `currentControllerMode` signal is passed to `useAudioEngine`.
2. **Action (`useAudioEngine.ts`):**
   - Accept `currentControllerMode` (as a signal or its value).
   - When `currentControllerMode` changes to "default" (or any other mode):
     - Call a method on `AudioEngineService` (e.g.,
       `audioEngineService.setMode(newMode)`) to instruct it to reconfigure its
       audio graph and logic.
   - Continue to pass `synth_param` messages to `AudioEngineService`.

---

## Phase 3: Visuals & Advanced Input (Placeholder for Future)

- Integrate Default Mode specific visuals into `Synth.tsx`.
- Implement computer keyboard input for Default Mode in `Controller.tsx`.

---

**Initial Focus for Claude:** Complete all actions under **Phase 1**. This sets
up the data structures and UI foundation. Phase 2 will involve the more complex
audio engine logic.
````
