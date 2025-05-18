```markdown
# Default Mode Implementation Plan

## 1. Objective

To implement the "Default Mode" for the WebRTC Creative Template, inspired by Ryoji Ikeda. This mode will feature a minimalist aesthetic with generative audio based on pink noise, sine blips, and clicks, controlled by Euclidean rhythms and a "Harmonic Ratio System" using "Stochastic Integer Notation" (SIN) for parameter definition.

This plan outlines the steps for shared definitions, controller client modifications, and synth client engine implementation.

**Reference:** This plan builds upon `CREATIVE_TEMPLATE_DESIGN_NOTES.md`, particularly section "4.4. Default Mode Design Details".

## 2. Overall Phasing

*   **Phase 1:** Shared Definitions & Controller UI Foundation for Default Mode.
*   **Phase 2:** Synth Client - Default Mode Engine Core Logic.
*   **Phase 3 (Future):** Visuals and advanced input (e.g., keyboard).

---

## Phase 1: Shared Definitions & Controller UI Foundation

### Step 1.1: Define Default Mode Parameters (`shared/modes/default/params.ts`)

1.  **Action:** Create a new file: `fresh_webrtc_ds_template/shared/modes/default/params.ts`.
2.  **Action:** Populate this file with parameter descriptors specific to the Default Mode. Import `SynthParamDescriptor` from `../../synthParams.ts` (the global one) or redefine it if mode-specific variations are needed. For now, assume we can reuse or slightly extend the global `SynthParamDescriptor`.
    *   Reference: Section "4.4.3. Control Parameters & UI" in `CREATIVE_TEMPLATE_DESIGN_NOTES.md`.
    *   Ensure parameters using Stochastic Integer Notation (SIN) have `type: 'string'` and their `description` clearly indicates the SIN format (e.g., "SIN: 1 / 2 / 4 or 3-7").
    *   Ensure parameters for selecting resolution modes have `type: 'enum'` and `enumValues: ["static", "random", "shuffle", "ascend", "descend"]`.

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
        description: "SIN for Numerator of Harmonic Ratio for noise event rate (vs CPM). E.g., '1', '1/2/3', '1-4'.",
      },
      {
        id: "defaultNoiseRateDenominatorRule",
        label: "Noise Rate Denom.",
        type: "string", // SIN
        defaultValue: "4",
        description: "SIN for Denominator of Harmonic Ratio for noise event rate. E.g., '4', '2/4/8', '2-8'.",
      },
      {
        id: "defaultNoiseRateResolutionMode",
        label: "Noise Rate Mode",
        type: "enum",
        enumValues: ["static", "random", "shuffle", "ascend", "descend"] as const,
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
        description: "SIN for noise envelope duration in seconds. E.g., '0.5 / 1.0', '0.2-1.2'.",
      },
      {
        id: "defaultNoiseEnvelopeDurationResolutionMode",
        label: "Noise Env Dur. Mode",
        type: "enum",
        enumValues: ["static", "random", "shuffle", "ascend", "descend"] as const,
        defaultValue: "static",
      },
      // ... other noise parameters like diversity if desired ...

      // --- Blips Layer Parameters ---
      // Pitch (Harmonic Ratio System)
      {
        id: "defaultBlipF0",
        label: "Blip f0",
        type: "number",
        min: 20, max: 2000, step: 1, defaultValue: 220, unit: "Hz",
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
        enumValues: ["static", "random", "shuffle", "ascend", "descend"] as const,
        defaultValue: "random",
      },
      // Duration
      {
        id: "defaultBlipDurationMsRule",
        label: "Blip Dur. (ms)",
        type: "string", // SIN
        defaultValue: "50",
        description: "SIN for blip duration in milliseconds. E.g., '20 / 50', '10-100'.",
      },
      {
        id: "defaultBlipDurationResolutionMode",
        label: "Blip Dur. Mode",
        type: "enum",
        enumValues: ["static", "random", "shuffle", "ascend", "descend"] as const,
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
        enumValues: ["static", "random", "shuffle", "ascend", "descend"] as const,
        defaultValue: "static",
        description: "How Blip Euclidean pattern rules are re-evaluated by synth.",
      },
      // ... other blip parameters like diversity ...

      // --- Clicks Layer Parameters ---
      // (Similar structure: Volume SIN/Mode, Euclidean SIN/Mode, Diversity SIN/Mode)
      // ...
    ];
    ```

### Step 1.2: Update `Controller.tsx` for Mode-Specific Parameters

1.  **Action:** Modify `Controller.tsx`.
2.  **Import:**
    ```typescript
    import { DEFAULT_MODE_PARAMS } from "../../shared/modes/default/params.ts";
    import { type ControllerMode, KNOWN_CONTROLLER_MODES } from "../../shared/controllerModes.ts"; // Assuming this exists
    // Import useMidiDeviceManager (once created and integrated)
    // const { currentMode } = useMidiDeviceManager(addLog);
    ```
3.  **Determine Active Parameter Set:**
    *   Inside the `Controller` component, get the `currentMode.value` (from `useMidiDeviceManager` once integrated. For now, can be hardcoded to `KNOWN_CONTROLLER_MODES.DEFAULT` for testing).
    *   Based on `currentMode.value`, select the appropriate parameter descriptor array:
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
4.  **Pass to `ClientList.tsx` / `SynthControls.tsx`:**
    *   The `ClientList` component (or wherever `SynthControls` is rendered per client) needs to receive this `activeSynthParams.value` array.
    *   Modify `ClientListProps` (in `ClientList.tsx`) to accept `paramDescriptors: readonly SynthParamDescriptor[]`.
    *   `Controller.tsx` passes `activeSynthParams.value` to `ClientList`.
    *   `ClientList.tsx` then passes these `paramDescriptors` to each `SynthControls` instance.

### Step 1.3: Update `SynthControls.tsx`

1.  **Action:** Modify `fresh_webrtc_ds_template/components/controller/SynthControls.tsx`.
2.  **Props:** Update `SynthControlsProps` to receive `paramDescriptors`:
    ```typescript
    interface SynthControlsProps {
      clientId: string;
      params: Record<string, any>; // Current values for this client
      paramDescriptors: readonly SynthParamDescriptor[]; // NEW: Definitions for controls
      onParamChange: (paramId: string, value: unknown) => void;
    }
    ```
3.  **Dynamic Rendering Loop:**
    *   The main loop for generating controls should now iterate over `props.paramDescriptors` instead of the global `SYNTH_PARAMS`.
    *   The logic for rendering `number`, `enum`, `boolean` types based on `descriptor.type` remains similar.
    *   **New:** For `descriptor.type === 'string'` (intended for SIN inputs):
        *   Render an `<input type="text">`.
        *   `value={String(currentValue)}`
        *   `onInput={(e) => onParamChange(descriptor.id, e.currentTarget.value)}` (send the raw string).
    *   The filter `descriptor.id !== 'oscillatorEnabled'` in the map loop might need adjustment if Default Mode doesn't use `oscillatorEnabled` but uses `defaultGlobalOnOff`. Ensure the "Note On/Off" section is contextually relevant or hidden/replaced for Default Mode. *For Default Mode, we might hide the generic Note On/Off button and rely on `defaultGlobalOnOff`*.

### Step 1.4: Message Passing (Controller to Synth)

1.  **Action:** Review `useClientManager.ts` method `updateClientSynthParam` (or equivalent).
2.  **Ensure:** It correctly sends the `paramId` (e.g., `"defaultBlipPitchNumeratorRule"`) and the `value` (which will be the raw SIN string, e.g., `"1 / 2 / 4"`, or the selected enum string for resolution modes, or a number/boolean for direct params) to the synth client using the existing `{ type: "synth_param", param: string, value: any }` message structure. No changes should be strictly needed here if `value: any` is already handled.

---

## Phase 2: Synth Client - Default Mode Engine

*(This phase will be implemented after Phase 1 is functional and tested. Instructions for Claude will be very detailed for each sub-step.)*

### Step 2.1: `AudioEngineService.ts` (or `DefaultModeAudioEngine.ts` module)

1.  **SIN Parser Utility:**
    *   **Action:** Implement `parseSINString(rule: string): number[]` (or `(string | number)[]` if note names are allowed directly in SIN).
    *   Handles: `"N"`, `"N / M / P"`, `"N-M"`. Converts to arrays of numbers.
2.  **Euclidean Algorithm Utility:**
    *   **Action:** Implement `generateEuclideanPattern(steps: number, pulses: number, offset: number = 0): boolean[]`.
3.  **State Management for Default Mode Parameters:**
    *   **Action:** When `AudioEngineService` is initialized or switched to "Default Mode" (based on message from `useAudioEngine`):
        *   Create internal state variables to store all received SIN rules, resolution modes, and direct parameter values for the Default Mode (e.g., `this.defaultBlipF0`, `this.defaultBlipPitchNumeratorRule`, `this.defaultBlipPitchResolutionMode`, `this.parsedDefaultBlipNumerators`, `this.currentBlipNumeratorIndex`, etc.).
4.  **Parameter Update Handler:**
    *   **Action:** Modify the existing parameter update logic. When a `synth_param` message arrives and the engine is in Default Mode:
        *   If `paramId` is a SIN rule (e.g., `defaultBlipPitchNumeratorRule`):
            *   Store the new rule string.
            *   Re-parse it using `parseSINString` and update the corresponding `parsed...` array.
            *   Reset the state for its associated resolution mode (e.g., if mode is "shuffle", re-shuffle the new array and reset index; if "static", pick a new static value from the new array).
        *   If `paramId` is a resolution mode (e.g., `defaultBlipPitchResolutionMode`):
            *   Update the stored mode.
            *   Reset its state (e.g., pick first value for "ascend", re-shuffle for "shuffle").
        *   If `paramId` is a direct value (e.g., `defaultGlobalCPM`), update it.
5.  **Audio Graph Construction for Default Mode:**
    *   **Action:** Implement logic to create and connect audio nodes as per "Section 4.4.4. Synth Client Audio Graph" in `CREATIVE_TEMPLATE_DESIGN_NOTES.md`. This includes noise sources, sine oscillator for blips, click worklet (to be created), gain nodes for envelopes, global reverb, and master volume.
6.  **Master Clock & Triggering Logic:**
    *   **Action:** Implement a master clock based on `defaultGlobalCPM`.
    *   **Action (Noise Layer):**
        *   Implement Harmonic Ratio System for rate (resolve SIN rules for num/den based on mode).
        *   Schedule noise events. On event: resolve duration (SIN+mode), get envelope shape, trigger envelope on noise source.
    *   **Action (Blips Layer - Euclidean & Harmonic Ratio):**
        *   Euclidean Pattern Generation:
            *   If current pattern cycle ends AND `defaultBlipsEuclideanResolutionMode` dictates: re-resolve SIN for steps/pulses/offset, generate new pattern with `generateEuclideanPattern`.
        *   Step through active Euclidean pattern. On pulse:
            *   Resolve Blip Pitch (f0 + NumRule/DenRule + PitchResMode using SIN parser and mode logic).
            *   Resolve Blip Duration (SIN + ResMode).
            *   Set oscillator freq, trigger rectangular envelope.
    *   **Action (Clicks Layer - Euclidean):** Similar to Blips. Resolve volume (SIN+mode).
7.  **Click AudioWorklet (`public/audio-worklets/ClickProcessor.js`):**
    *   **Action:** Create a simple AudioWorklet that generates a short click/impulse when its `process` method is effectively triggered (e.g., by a parameter change or a message if designed that way).

### Step 2.2: Updates to `useAudioEngine.ts` and `WebRTC.tsx`

1.  **Action (`WebRTC.tsx`):**
    *   Ensure `currentControllerMode` signal is passed to `useAudioEngine`.
2.  **Action (`useAudioEngine.ts`):**
    *   Accept `currentControllerMode` (as a signal or its value).
    *   When `currentControllerMode` changes to "default" (or any other mode):
        *   Call a method on `AudioEngineService` (e.g., `audioEngineService.setMode(newMode)`) to instruct it to reconfigure its audio graph and logic.
    *   Continue to pass `synth_param` messages to `AudioEngineService`.

---

## Phase 3: Visuals & Advanced Input (Placeholder for Future)

*   Integrate Default Mode specific visuals into `Synth.tsx`.
*   Implement computer keyboard input for Default Mode in `Controller.tsx`.

---

**Initial Focus for Claude:** Complete all actions under **Phase 1**. This sets up the data structures and UI foundation. Phase 2 will involve the more complex audio engine logic.
```