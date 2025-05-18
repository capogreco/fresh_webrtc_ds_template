````markdown
# Creative WebRTC Template: Design Notes

## 1. Overall Goal

To create a Deno Fresh WebRTC template tailored for composers, musicians, and
sonic artists. The template should provide a robust WebRTC infrastructure while
making the creative aspects—primarily control input design (controller client)
and DSP/synthesis design (synth client)—modular, understandable, and highly
extensible. The aim is to lower the barrier to creating novel, networked sonic
interactions and instruments.

## 2. Synth Client Architecture (`AudioEngineService.ts` & `useAudioEngine.ts`)

### 2.1. `AudioEngineService.ts` - The Core Synthesizer Engine

- **Flexible Audio Graph Management:** `AudioEngineService` will act as a
  programmable "patch bay" or a backend for a node graph.
  - It will manage a collection of named `AudioNode` instances. This collection
    can freely mix standard Web Audio API nodes (e.g., `OscillatorNode`,
    `GainNode`, `BiquadFilterNode`, `DelayNode`) and custom `AudioWorkletNode`
    instances.
  - It should provide a clear API for:
    - Adding/removing standard Web Audio nodes by type, with a user-defined
      ID/name.
    - Registering `AudioWorkletProcessor`s (from JS files, e.g., in
      `public/audio-worklets/`) and instantiating their corresponding
      `AudioWorkletNode`s with a user-defined ID/name.
    - Connecting any registered node to any other registered node by their IDs,
      allowing specification of source output and destination input indices for
      multi-channel/multi-input/output nodes.
    - Disconnecting nodes.
    - Getting references to nodes by ID.
- **Unified Parameter Control:**
  - The service will expose a method (e.g.,
    `updateParameter(nodeId: string, paramName: string, value: any)`) to update
    parameters.
  - This method will intelligently handle:
    - Setting `value` for standard `AudioParam`s on built-in nodes.
    - Sending messages to `AudioWorkletNode`s if the `paramName` corresponds to
      a custom parameter defined in the worklet (requiring a convention for how
      worklets expose their parameters, perhaps via messages or by observing
      `AudioParam`s on the `AudioWorkletNode` itself).
- **No Imposed "DSP Module" Abstraction (at Service Level):**
  - The service itself will not enforce a rigid "DSP Module" class structure.
    Users are free to create their own higher-level abstractions (e.g., helper
    functions that build complex voices or effects chains using the service's
    node and connection APIs) if they choose. This prioritizes directness and
    flexibility in audio graph construction.
- **Responsibilities:**
  - Initializing and managing the `AudioContext`.
  - Loading and managing AudioWorklets.
  - Maintaining the audio node graph (nodes and connections).
  - Applying parameter changes received from `useAudioEngine`.
  - Providing audio analysis data (like FFT, waveform) to `useAudioEngine`.

### 2.2. `useAudioEngine.ts` - The Bridge to Preact UI

- **State Management:** Continues to use Preact signals to expose synth state
  (e.g., `audioContextState`, `isMuted`, individual parameter values if mirrored
  as signals, `fftData`, `waveformData`) to UI components.
- **Communication with `AudioEngineService`:** Acts as the intermediary between
  the UI/`WebRTC.tsx` and `AudioEngineService`.
  - Receives parameter update requests (e.g., from data channel messages via
    `WebRTC.tsx`, or potentially from a local UI via `Synth.tsx`) and forwards
    them to `AudioEngineService`.
  - Handles initialization/teardown of `AudioEngineService`.
  - Subscribes to data (like FFT) from `AudioEngineService` and updates its
    signals.
- **Dynamic Parameter Signal Generation (Potential):** If
  `shared/synthParams.ts` defines parameters, `useAudioEngine` could dynamically
  create signals for these, rather than having a fixed set.

## 3. Shared Parameter Definition (`shared/synthParams.ts`)

- **Centralized Parameter Manifest:** A crucial file (e.g.,
  `shared/synthParams.ts`) will export a structured definition (e.g., an array
  of objects) for all controllable parameters of the synthesizer.
  - Each descriptor should include: `id` (unique string, used in messages and
    for mapping), `label` (for UI), `type` (`number`, `enum`, `boolean`,
    `note`), `min`, `max`, `step`, `defaultValue`, `enumValues` (for enums),
    units, etc.
  - Example:
    ```typescript
    export interface SynthParamDescriptor {/* ... as previously defined ... */}
    export const SYNTH_PARAMS: SynthParamDescriptor[] = [/* ... */];
    ```
- **Single Source of Truth:** This manifest will be imported by:
  - The **Controller Client (`Controller.tsx`)** to dynamically generate UI
    controls.
  - The **Synth Client (`AudioEngineService.ts` via `useAudioEngine`)** to
    understand incoming parameter messages and map them to the correct audio
    nodes/parameters.
- **Extensibility:** Adding a new controllable aspect to the synth starts by
  defining it here.

## 4. Controller Client Architecture: Mode Switching & Input Modularity

This section outlines the architecture for the controller client (`Controller.tsx`), focusing on making it adaptable through mode switching based on connected hardware and providing a foundation for modular input sources.

### 4.1. Dynamic UI from Centralized Parameter Manifest

- `Controller.tsx` will import `SYNTH_PARAMS` from `shared/synthParams.ts` and dynamically generate its primary UI for synth parameter control (sliders, knobs, dropdowns, etc.) based on these definitions. This ensures that as new parameters are added to the synth, the controller UI can adapt with minimal changes to `Controller.tsx` itself. (This was implemented by refactoring `SynthControls.tsx`).

### 4.2. Phase 1: Mode Switching Foundation

This phase establishes the core mechanics for detecting specific MIDI controllers and switching the controller's operational "mode," then communicating this mode to connected synth clients.

#### Part A: Controller Side Implementation

1.  **Define Controller Modes (Type/Enum & Mappings):**
    *   **Objective:** Create a shared definition for controller modes and map recognized MIDI devices to these modes.
    *   **File:** `fresh_webrtc_ds_template/shared/controllerModes.ts`
    *   **Content Structure:**
        ```typescript
        // Example content for shared/controllerModes.ts
        export const KNOWN_CONTROLLER_MODES = {
          DEFAULT: "default",
          SYNTH_MODE: "synthMode",    // For AKAI MPK-Mini II
          DRONE_MODE: "droneMode",    // For nakedboards MC-24
          GRID_MODE: "gridMode",      // For Monome Grid
        } as const;

        export type ControllerMode = typeof KNOWN_CONTROLLER_MODES[keyof typeof KNOWN_CONTROLLER_MODES];

        export interface MidiDeviceModeMapping {
          deviceNameSubstrings: string[]; // Substrings to match in MIDI device name
          mode: ControllerMode;
        }

        export const MIDI_DEVICE_TO_MODE_MAPPING: readonly MidiDeviceModeMapping[] = [
          { deviceNameSubstrings: ["MPK Mini", "MPKMINI"], mode: KNOWN_CONTROLLER_MODES.SYNTH_MODE },
          { deviceNameSubstrings: ["MC-24", "nakedboards"], mode: KNOWN_CONTROLLER_MODES.DRONE_MODE },
          { deviceNameSubstrings: ["monome", "grid"], mode: KNOWN_CONTROLLER_MODES.GRID_MODE },
        ];
        ```
    *   **Rationale:** Centralizes mode definitions and device-to-mode mappings for easy updates and sharing between modules.

2.  **Create `useMidiDeviceManager.ts` Hook:**
    *   **Objective:** Encapsulate Web MIDI API interactions, device detection, MIDI device state management, and derive the current controller mode.
    *   **File Location:** `fresh_webrtc_ds_template/islands/hooks/useMidiDeviceManager.ts`
    *   **Core Functionality:**
        *   Imports: `ControllerMode`, `MIDI_DEVICE_TO_MODE_MAPPING`, `KNOWN_CONTROLLER_MODES` from `shared/controllerModes.ts`.
        *   Internal State Signals (using `@preact/signals`):
            *   `midiAccess: Signal<MIDIAccess | null>`
            *   `connectedInputs: Signal<Map<string, MIDIInput>>` (Map of input device ID to `MIDIInput` object)
            *   `error: Signal<string | null>` (for MIDI access errors)
        *   Derived/Computed Signal:
            *   `currentMode: Signal<ControllerMode>`: This signal will compute its value based on `connectedInputs`. It iterates through connected devices, checks their names against `MIDI_DEVICE_TO_MODE_MAPPING`, and determines the mode. If no recognized device is found, or no MIDI devices are connected, it defaults to `KNOWN_CONTROLLER_MODES.DEFAULT`. A priority system should be defined if multiple recognized devices are connected.
        *   **Initialization (`useEffect` on mount):**
            *   Requests MIDI access using `navigator.requestMIDIAccess()`.
            *   On success: Stores the `MIDIAccess` object, initially populates `connectedInputs`, and sets up an `onstatechange` listener on the `MIDIAccess` object.
            *   On failure: Sets the `error` signal.
        *   **`onstatechange` Handler:**
            *   Attached to `midiAccess.value.onstatechange`.
            *   Updates the `connectedInputs` signal whenever a MIDI device's connection state changes (connect/disconnect). This change automatically triggers re-computation of the `currentMode` signal.
        *   **Return Value from Hook (example):**
            ```typescript
            interface UseMidiDeviceManagerReturn {
              midiAccess: Signal<MIDIAccess | null>;
              connectedDeviceNames: Signal<string[]>; // Or more detailed device info
              currentMode: Signal<ControllerMode>;
              error: Signal<string | null>;
            }
            ```
        *   **Logging:** Accepts an `addLog` function prop for logging significant events (MIDI access status, device changes, mode changes).

3.  **Integrate `useMidiDeviceManager.ts` into `Controller.tsx`:**
    *   **Import & Usage:** Import and call the `useMidiDeviceManager` hook within the `Controller` component, passing its `addLog` function.
    *   **State Management:** Store the `currentMode` signal returned by the hook in a local variable (e.g., `const modeFromMidi = useMidiDeviceManager(...).currentMode;`).
    *   **UI Display:** Display the value of `modeFromMidi.value` in the controller's UI (e.g., within the user info section).
    *   **Logging Mode Changes:** Use `useEffect` to observe changes in `modeFromMidi.value` and log them using `addLog`.
    *   **Broadcasting Mode Change:**
        *   Add a `useEffect` hook in `Controller.tsx` that listens to changes in `modeFromMidi.value`.
        *   When `modeFromMidi.value` changes, call a new method on the `clientManagerInstanceRef.current` (e.g., `broadcastControllerModeUpdate(newMode)`).

4.  **Update `useClientManager.ts` (and its instance in `Controller.tsx`) for Mode Broadcasting:**
    *   **Objective:** Enable the client manager to send mode update messages to all connected synth clients.
    *   **New Method:** Add a method like `broadcastControllerModeUpdate(mode: ControllerMode)` to the object returned by `useClientManager`.
        *   This method iterates through all connected clients (`clients.value`).
        *   For each client whose data channel is open (`client.dataChannel?.readyState === "open"`), it sends a JSON message:
            ```json
            {
              "type": "controller_mode_update",
              "mode": "mode" // The new ControllerMode value
            }
            ```
        *   Logs the broadcast action using `addLog`.
    *   **Message Type Definition:** Consider defining this message structure formally in a shared types file (e.g., `fresh_webrtc_ds_template/shared/rtcMessages.ts`).

#### Part B: Synth Client Side Implementation (`WebRTC.tsx`)

1.  **Handle `controller_mode_update` Message:**
    *   **In `handleChannelMessage` (within `WebRTC.tsx`):**
        *   Add a new `case` or `if` block to parse incoming messages of type `"controller_mode_update"`.
        *   Extract the `mode` value from the message.
2.  **Manage and Log Controller Mode State:**
    *   **Signal:** Introduce a new signal in `WebRTC.tsx`:
        ```typescript
        // At the top of WebRTC component function, with other signals
        // Import KNOWN_CONTROLLER_MODES and ControllerMode from shared/controllerModes.ts
        const currentControllerMode = useSignal<ControllerMode>(KNOWN_CONTROLLER_MODES.DEFAULT);
        ```
    *   **Update Signal:** When a `controller_mode_update` message is received, update `currentControllerMode.value` with the new mode from the message.
    *   **Logging:** Use `addLog` to record the mode change: `addLog(\`Controller mode changed to: \${message.mode}\`);`.
3.  **Expose Mode to `useAudioEngine` (Future Use):**
    *   For Phase 1, direct use in `AudioEngineService` is not required. However, to prepare for Phase 2 (synth engine switching):
        *   The `currentControllerMode` signal (or its value) should be passed to `useAudioEngine`.
        *   `useAudioEngine` can then include this `currentControllerMode` in its returned `audio` object.
        *   This makes the current controller mode available to `Synth.tsx` (for potential UI changes) and to `AudioEngineService` (for future engine switching logic).
    *   *Initial Step for Phase 1:* It's sufficient for `WebRTC.tsx` to manage and log this state. The propagation to `useAudioEngine` can be a slightly later step if it simplifies initial implementation.

### 4.3. Future Phases for Controller Client (To Be Detailed)

*   **Modular Input Sources (Phase 2+):**
    *   **Goal:** Allow users to easily integrate various input sources (OSC, mouse/keyboard, algorithmic generators, custom hardware via WebHID/WebSerial) in addition to MIDI.
    *   **Approach:**
        *   Define a clear interface for "Input Handler" modules.
        *   Create a registry system in `Controller.tsx` where users can add their custom input handlers.
        *   Each input handler would be responsible for capturing its specific type of input and translating it into calls to a function that sends `synth_param` messages (or other defined message types) over WebRTC. This function would likely be provided by `useClientManager`.
*   **Control Routing/Mapping (Phase 2+):**
    *   **Initial (already partially in place):** Direct mapping (e.g., a UI slider for "filterCutoff" sends a `synth_param` message with `param: "filterCutoff"`).
    *   **Future Exploration:** Possibility of more complex mapping logic (e.g., one input controlling multiple parameters, scaling/transforming input values, conditional logic). This might involve a dedicated mapping layer or configuration.
*   **Advanced Message System (As Needed):**
    *   While `synth_param`, `note_on`, `note_off`, and `controller_mode_update` cover many cases, explore needs for other message types (e.g., `trigger_event`, `load_preset`, `request_synth_engine_change`).

### 4.4. Default Mode Design Details (Ryoji Ikeda Inspired)

This mode aims for a minimalist, precise, and somewhat brutalist aesthetic in both sound and visuals.

#### 4.4.1. Mode-Specific Configuration Structure
*   A dedicated directory structure will be used for mode-specific configurations:
    ```
    shared/
    └── modes/
        └── default/
            ├── params.ts       // Parameter descriptors specific to Default Mode
            ├── engineConfig.ts // Defines how synth engine is built for this mode
            └── uiLayout.ts     // (Optional) Describes specific UI layout/components for Controller
    ```

#### 4.4.2. Sound Palette
*   Pink Noise
*   White Noise
*   Sine Tone Blips (with rectangular envelopes for sharp on/off)
*   Clicks (short impulses)

#### 4.4.3. Control Parameters & UI (`shared/modes/default/params.ts`)
*   **Global Parameters:**
    *   `onOff`: (boolean) Master play/stop for rhythmic elements.
    *   `cpm`: (number) Cycles Per Minute – main tempo/clock.
    *   `reverbAmount`: (number, 0-1) Wet/Dry mix for the global reverb.
    *   `masterVolume`: (number, 0-1) Final output volume.
*   **\"Noise Layer\" Parameters:**
    *   `noiseType`: (enum: ["white", "pink", "mixed"]) Type of noise.
    *   `noiseRateNumeratorRule`: (string - SIN) Numerator for the Harmonic Ratio System determining noise event rate relative to CPM.
    *   `noiseRateDenominatorRule`: (string - SIN) Denominator for the noise event rate.
    *   `noiseRateResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"]) How the rate ratio rules are resolved by the synth.
    *   `noiseEnvelopeShape`: (enum: ["sine", "halfSineRise", "rectangular"]) Shape of the amplitude envelope for noise events (for sinusoidal roll-in/out or sharp bursts).
    *   `noiseEnvelopeDurationRule`: (string - SIN, in seconds, e.g., "0.5 / 1.0 / 1.5") Duration of the noise envelope.
    *   `noiseEnvelopeDurationResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"])
    *   `noiseDiversityRule`: (string - SIN, 0-1) Controls cross-client variation in noise characteristics.
    *   `noiseDiversityResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"])
*   **\"Blips Layer\" Parameters:**
    *   **Pitch (Harmonic Ratio System):**
        *   `blipF0`: (number) Fundamental frequency (e.g., 220 Hz).
        *   `blipPitchNumeratorRule`: (string - SIN) Rule for pitch ratio numerator.
        *   `blipPitchDenominatorRule`: (string - SIN) Rule for pitch ratio denominator.
        *   `blipPitchResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"]) How pitch ratio rules are resolved.
    *   **Duration:**
        *   `blipDurationMsRule`: (string - SIN, in milliseconds, e.g., "20 / 50 / 100") Duration for the blip's rectangular envelope.
        *   `blipDurationResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"])
    *   **Rhythm (Euclidean):**
        *   `blipsEuclideanStepsRule`: (string - SIN, e.g., "8 / 12 / 16") Total steps.
        *   `blipsEuclideanPulsesRule`: (string - SIN, e.g., "3 / 5") Number of active pulses (beats).
        *   `blipsEuclideanOffsetRule`: (string - SIN, e.g., "0-4") Rotation offset.
        *   `blipsEuclideanResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"]) How the Euclidean pattern rules (steps, pulses, offset) are re-evaluated by the synth to generate new patterns over time.
    *   **Diversity:**
        *   `blipDiversityRule`: (string - SIN, 0-1) Controls cross-client variation.
        *   `blipDiversityResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"])
*   **\"Clicks Layer\" Parameters:**
    *   **Volume:**
        *   `clickVolumeRule`: (string - SIN, 0-1) Controls click amplitude.
        *   `clickVolumeResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"])
    *   **Rhythm (Euclidean):**
        *   `clicksEuclideanStepsRule`: (string - SIN)
        *   `clicksEuclideanPulsesRule`: (string - SIN)
        *   `clicksEuclideanOffsetRule`: (string - SIN)
        *   `clicksEuclideanResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"])
    *   **Diversity:**
        *   `clickDiversityRule`: (string - SIN, 0-1)
        *   `clickDiversityResolutionMode`: (enum: ["static", "random", "shuffle", "ascend", "descend"])
*   **Stochastic Integer Notation (SIN) Convention:**
    *   A string format for defining rules for parameter value generation. Examples:
        *   `"5"`: A static value of 5.
        *   `"2 / 4 / 8"`: Randomly choose between 2, 4, or 8.
        *   `"1-5"`: Randomly choose an integer between 1 and 5 (inclusive).
        *   (Potentially `"1.0-5.0"` for floats, to be defined if needed).
    *   **Controller Client:** Sends the raw SIN string rule and the selected resolution mode (e.g., `blipPitchResolutionMode`, `blipsEuclideanResolutionMode`) to the synth client for each relevant parameter set.
    *   **Synth Client:**
        *   Parses the SIN string (e.g., "1 / 2 / 4" into `[1,2,4]`; "3-7" into `[3,4,5,6,7]`) into an array of possible integer or float values. This parsing logic resides in the synth engine.
        *   Implements the logic for the five resolution modes (`static`, `random`, `shuffle`, `ascend`, `descend`) to select values from the parsed array(s) when needed (e.g., upon each blip trigger for pitch, or when a new Euclidean pattern is to be generated).

#### 4.4.4. Synth Client Audio Graph for Default Mode (`AudioEngineService` configured by `shared/modes/default/engineConfig.ts`)
*   **Output Chain:**
    1.  Sound Sources (Noise, Blips, Clicks)
    2.  Individual Gain Nodes for each source type (for level control if needed, and for envelope application).
    3.  Mixer (summing point for dry signals).
    4.  Dry Path from Mixer -> `dryGainNode` -> `masterVolumeGainNode`.
    5.  Wet Path from Mixer -> `reverbNode` -> `wetGainNode` -> `masterVolumeGainNode`.
    6.  `masterVolumeGainNode` -> `audioContext.destination`.
    7.  `dryGainNode` and `wetGainNode` levels are controlled by `reverbAmount` to achieve wet/dry mix.
*   **Sound Sources:**
    *   **Noise:** `AudioBufferSourceNode`s for pre-generated white/pink noise buffers (looped), or dedicated `AudioWorkletNode`s for noise generation. Routed through their own gain node for level/burst control.
    *   **Blips:** `OscillatorNode` (type 'sine'). Its output goes to a `GainNode` used to apply the sharp rectangular envelope.
    *   **Clicks:** An `AudioWorkletNode` designed to produce a short impulse/click sound.
*   **Triggering Logic & Harmonic Ratio System (within `AudioEngineService` or a \"DefaultModeAudioEngine\" module):**
    *   Master clock derived from CPM parameter.
    *   Euclidean rhythm generators for Blips and Clicks, configured by their respective Stochastic Integer Notation (SIN) parameters (Steps, Pulses, Offset). These step according to the master clock.
    *   Fractional rate logic for the Noise Layer (Numerator/Denominator SIN parameters), also tied to the master clock.
    *   **Harmonic Ratio System Resolution (for Blip Pitch & Noise Rate):**
        *   Receives `f0` (either `blipF0` or derived from `CPM` for noise), the `NumeratorRule` (SIN string), `DenominatorRule` (SIN string), and the relevant `ResolutionMode`.
        *   Parses `NumeratorRule` and `DenominatorRule` SIN strings into arrays of possible integer values.
        *   Maintains internal state for these rules based on the selected `ResolutionMode` (e.g., current index for shuffle/ascend/descend, or the statically chosen value for static).
        *   When a blip pitch or noise rate needs to be determined:
            *   Selects a `chosenNum` and `chosenDen` from the parsed arrays according to the active `ResolutionMode`.
            *   For blips, calculates `targetFrequency = blipF0 * (chosenNum / chosenDen)`. Sets oscillator frequency.
            *   For noise rate, calculates the event interval: `(60 / CPM) * (chosenDen / chosenNum)` seconds. This interval drives the noise event scheduler.
    *   **Euclidean Pattern Generation (for Blips & Clicks):**
        *   Receives `StepsRule`, `PulsesRule`, `OffsetRule` (all SIN strings), and the overall `EuclideanResolutionMode`.
        *   The synth engine decides when to generate a *new* underlying Euclidean pattern based on `EuclideanResolutionMode`:
            *   `static`: Resolves SIN for steps, pulses, offset once (when rules/mode change) and uses that fixed pattern.
            *   `random`: Each time a "new pattern" is needed (e.g., after N CPM cycles, or per sequence loop), re-resolves SIN for steps, pulses, and offset to create a brand new Euclidean sequence.
            *   `shuffle`, `ascend`, `descend`: Could apply to *how a list of pre-generated patterns* is traversed, or how a sequence of *parameter sets* for the generator is traversed. (This needs further thought: does the mode apply to selecting one pattern from many, or to evolving the parameters of a single generator over time?) For now, assume it means re-evaluating the SIN rules for steps/pulses/offset to define the *next* pattern to be used.
        *   The active Euclidean pattern then triggers blips/clicks according to its sequence.
    *   **Duration Resolution (Blips, Noise Envelope):**
        *   Receives `DurationMsRule` (SIN string) and `DurationResolutionMode`.
        *   When a blip or noise event is triggered, resolves the SIN for duration based on the mode to get a specific duration in ms/seconds.
    *   **Event Triggering:**
        *   Blips: When its Euclidean generator pulses, set oscillator frequency (via Harmonic Ratio System), get duration (via Duration Resolution), and apply rectangular envelope.
        *   Clicks: When its Euclidean generator pulses, get volume (via SIN resolution), trigger Click AudioWorklet.
        *   Noise: Based on its Harmonic Ratio System rate, get envelope duration and shape, then trigger the envelope (e.g., sinusoidal roll-in/out) on the pink noise source.

#### 4.4.5. Visuals (Handled by `Synth.tsx` or dedicated visualizer components)
*   **Overall Style:** Brutalist, black and white.
*   **FFT Analyzer:** For visualizing the noise layer primarily.
*   **Blip/Click Visuals:** "Brutalist glitchy visual incursion" – sharp lines, geometric forms, data-like patterns that synchronize with blip/click events. These would likely require trigger events or data from the audio engine.

#### 4.4.6. Controller UI (`Controller.tsx` using `SynthControls.tsx` adapted for Default Mode)
*   The UI will be dynamically generated based on parameters defined in `shared/modes/default/params.ts`.
*   **Stochastic Integer Notation (SIN) Inputs:** Text inputs will be used for parameters that accept SIN strings (e.g., `blipPitchNumeratorRule`, `noiseRateNumerator`, various duration parameters). The controller sends these raw strings to the synth.
*   **Resolution Mode Selection:** Dropdowns or radio buttons for parameters like `blipPitchResolutionMode`.
*   Standard sliders/checkboxes for direct numeric/boolean parameters (e.g., `blipF0`, `masterVolume`).
*   The list of connected synth clients will be incorporated into the UI.

## 5. Developer Experience & Scaffolding

- **"Creative Sandbox" Directories:**
  - `controller/inputs/`: For custom input handler modules for `Controller.tsx`.
  - `synth/audio_engine_configs/` (or similar): Potentially for predefined audio
    graph configurations or user-saved patches if that feature is explored.
  - `public/audio-worklets/`: For `AudioWorkletProcessor` JS files.
  - `shared/`: For code shared between controller and synth (e.g.,
    `synthParams.ts`, custom message type definitions).
- **Clear Examples & Documentation (in Markdown within the template or
  linked):**
  - Tutorial: "Adding a New Controllable Parameter to the Synth."
  - Tutorial: "Creating a Basic AudioWorklet and Using It in the Synth."
  - Tutorial: "Adding a Simple MIDI CC Input to the Controller."
- **Type Safety:** Leverage TypeScript for interfaces (parameter descriptors,
  message types, input handler interfaces) to improve robustness and developer
  experience.

## 6. UI Component Modularity (Already in Progress)

- **`Synth.tsx` Island:** Successfully extracted to handle the display of synth
  parameters and FFT visualization, taking the `audio` object from
  `useAudioEngine` as a prop. This makes `WebRTC.tsx` cleaner.
- `WebRTC.tsx` focuses on WebRTC connection, signaling, data channel
  orchestration, overall UI states (audio enable vs. active), and rendering
  `Synth.tsx`.

This document will be updated as design thinking evolves.
````
