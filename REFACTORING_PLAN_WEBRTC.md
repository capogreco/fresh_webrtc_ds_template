# WebRTC.tsx Refactoring Plan

This document outlines a plan to refactor the `fresh_webrtc_ds_template/islands/WebRTC.tsx` file. The goal is to improve modularity, readability, and maintainability by separating concerns into dedicated services, custom hooks, and smaller components.

## Guiding Principles

*   **Separation of Concerns:** Isolate WebRTC logic, audio synthesis logic, signaling, state management, and UI rendering.
*   **Single Responsibility Principle:** Each module (service, hook, component) should have a clear and focused responsibility.
*   **Preact Signals for Reactivity:** Continue using Preact signals for managing reactive UI state within hooks and components.
*   **TypeScript:** Maintain strong typing throughout the refactored codebase.
*   **Incremental Refactoring:** Apply changes step-by-step to minimize disruption and allow for testing at each stage.

## Phase 1: Service Layer Extraction

Create dedicated services for core functionalities. These services will encapsulate the low-level logic and will be framework-agnostic (not directly using Preact hooks or signals internally for their primary logic).

### 1.1. `AudioEngineService.ts`

*   **Location:** `fresh_webrtc_ds_template/services/AudioEngineService.ts`
*   **Responsibilities:**
    *   Managing the Web Audio `AudioContext`.
    *   Creating and configuring audio nodes: `OscillatorNode`, `GainNode`, `BiquadFilterNode`, LFOs (`OscillatorNode` for vibrato, tremolo), etc.
    *   Implementing audio synthesis logic (e.g., ADSR envelope for gain).
    *   Handling pink noise generation and playback.
    *   Managing FFT analysis (`AnalyserNode`) and providing frequency/time domain data.
    *   Exposing methods to control all synth parameters (frequency, gain, filter cutoff, resonance, envelope settings, LFO rates/depths).
*   **Key Methods (Examples):**
    *   `constructor(initialParams)`
    *   `initializeAudioContext(): Promise<void>`
    *   `noteOn(frequency: number, velocity?: number): void`
    *   `noteOff(): void`
    *   `setFrequency(frequency: number): void`
    *   `setGain(gain: number): void`
    *   `setFilterCutoff(cutoff: number): void`
    *   `setLFO(lfoType: 'vibrato' | 'tremolo', rate: number, depth: number): void`
    *   `updateParameter(paramName: string, value: number): void`
    *   `getFFTData(): Uint8Array`
    *   `getWaveformData(): Uint8Array`
    *   `startPinkNoise(): void`
    *   `stopPinkNoise(): void`
    *   `setPinkNoiseGain(gain: number): void`
    *   `isAudioContextActive(): boolean`
    *   `close(): void` (for cleanup)
*   **State:** Manages internal state related to audio nodes and parameters. Does not directly expose Preact signals.

### 1.2. `WebRTCService.ts`

*   **Location:** `fresh_webrtc_ds_template/services/WebRTCService.ts`
*   **Responsibilities:**
    *   Managing `RTCPeerConnection` instances.
    *   Creating and setting local/remote session descriptions (offers, answers).
    *   Handling ICE candidates.
    *   Managing `RTCDataChannel` setup, sending, and receiving messages.
    *   Encapsulating STUN/TURN server configuration.
*   **Key Methods (Examples):**
    *   `constructor(iceServers: RTCIceServer[])`
    *   `createPeerConnection(onIceCandidate: (candidate: RTCIceCandidate) => void, onTrack: (event: RTCTrackEvent) => void, onDataChannel: (event: RTCDataChannelEvent) => void, onConnectionStateChange: (state: RTCPeerConnectionState) => void): RTCPeerConnection`
    *   `createOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit>`
    *   `createAnswer(pc: RTCPeerConnection, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>`
    *   `setLocalDescription(pc: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void>`
    *   `setRemoteDescription(pc: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<void>`
    *   `addIceCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void>`
    *   `createDataChannel(pc: RTCPeerConnection, label: string, options?: RTCDataChannelInit): RTCDataChannel`
    *   `sendDataChannelMessage(dc: RTCDataChannel, message: string | ArrayBuffer | Blob): void`
    *   `closeConnection(pc: RTCPeerConnection): void`
*   **Events/Callbacks:** Will need to interact with a signaling mechanism. This service should provide callbacks or emit events for signaling actions (e.g., when an ICE candidate is generated, when an offer/answer is ready to be sent).

## Phase 2: Custom Hooks Implementation

Develop Preact custom hooks to manage state (using signals) and bridge the UI components with the services.

### 2.1. `useAudioEngine.ts`

*   **Location:** `fresh_webrtc_ds_template/islands/hooks/useAudioEngine.ts`
*   **Responsibilities:**
    *   Instantiating and managing the `AudioEngineService`.
    *   Exposing synth parameters and audio state (e.g., `isMuted`, `audioContextReady`, `currentFrequency`, `currentGain`) as Preact signals.
    *   Providing memoized callback functions for UI components to interact with the `AudioEngineService` (e.g., `playNote`, `stopNote`, `updateSynthParam`).
    *   Handling the lifecycle of the `AudioEngineService`.
*   **Exposed API (Example):**
    *   `audioContextReady: Signal<boolean>`
    *   `isMuted: Signal<boolean>`
    *   `frequency: Signal<number>`
    *   `gain: Signal<number>`
    *   `filterCutoff: Signal<number>`
    *   `// ... other synth param signals`
    *   `initializeAudio(): Promise<void>`
    *   `playNote(frequency: number): void`
    *   `stopNote(): void`
    *   `updateSynthParam(param: string, value: number): void`
    *   `toggleMute(): void`
    *   `fftData: Signal<Uint8Array | null>` (updated periodically)

### 2.2. `useWebRTCConnection.ts`

*   **Location:** `fresh_webrtc_ds_template/islands/hooks/useWebRTCConnection.ts`
*   **Responsibilities:**
    *   Instantiating and managing the `WebRTCService` for a peer connection.
    *   Interfacing with a signaling hook/service to send/receive WebRTC signaling messages (offers, answers, candidates).
    *   Exposing connection state (e.g., `connectionStateSignal`, `iceGatheringStateSignal`, `dataChannelOpenSignal`) as Preact signals.
    *   Providing methods to initiate, answer, and manage a WebRTC connection.
*   **Exposed API (Example - assuming one peer connection per hook instance):**
    *   `connectionState: Signal<RTCPeerConnectionState | null>`
    *   `isDataChannelOpen: Signal<boolean>`
    *   `lastDataChannelMessage: Signal<any | null>`
    *   `connect(isInitiator: boolean, signalingSendMessage: (message: any) => void): Promise<void>`
    *   `handleSignalingMessage(message: any): Promise<void>` (called by the signaling hook)
    *   `sendData(data: any): void`
    *   `closeConnection(): void`
*   **Note on Multiple Connections:** This hook is designed to manage a single peer connection. If the application requires managing multiple, concurrent WebRTC connections, consider either:
    *   Instantiating multiple instances of `useWebRTCConnection`, if each connection is managed independently in the UI.
    *   Developing a higher-level manager service or hook that orchestrates multiple `WebRTCService` instances if more complex coordination is needed. The current plan focuses on refactoring the existing single-connection pattern.

### 2.3. `useSignaling.ts`

*   **Location:** `fresh_webrtc_ds_template/islands/hooks/useSignaling.ts`
*   **Responsibilities:**
    *   Managing the WebSocket connection for signaling.
    *   Exposing signaling status (e.g., `isSocketConnectedSignal`, `lastErrorSignal`) as Preact signals.
    *   Providing methods to connect to the signaling server and send messages.
    *   Handling incoming WebSocket messages and dispatching them (e.g., via a callback prop or an event system that `useWebRTCConnection` subscribes to).
*   **Exposed API (Example):**
    *   `isSocketConnected: Signal<boolean>`
    *   `signalingLogs: Signal<string[]>`
    *   `connectSignaling(url: string, onMessage: (message: any) => void): void`
    *   `sendSignalingMessage(message: any): void`
    *   `disconnectSignaling(): void`

## Phase 3: Component Refactoring (`WebRTC.tsx`)

Refactor the main `WebRTC.tsx` island and potentially create smaller, focused UI components.

### 3.1. Slimming Down `WebRTC.tsx`

*   The `WebRTC.tsx` island will become primarily a coordinator.
*   It will instantiate and use the custom hooks (`useAudioEngine`, `useWebRTCConnection`, `useSignaling`).
*   UI elements will be driven by signals exposed by these hooks.
*   Event handlers in the UI will call the action methods provided by the hooks.
*   Remove direct Web Audio API calls, `RTCPeerConnection` management, and WebSocket logic from the component file.

### 3.2. Creating Sub-Components

*   Identify distinct UI sections within the current `WebRTC.tsx` and consider extracting them into smaller, presentational components.
*   **Location:** `fresh_webrtc_ds_template/components/webrtc/` (new directory) or keep them within `WebRTC.tsx` if very simple.
*   **Examples:**
    *   `SynthControlSlider.tsx`: A reusable slider for a synth parameter.
    *   `SynthControlsPanel.tsx`: Groups all synth control UI.
    *   `ConnectionStatusDisplay.tsx`: Shows WebRTC connection status.
    *   `SignalingLogView.tsx`: Displays signaling messages.
    *   `AudioVisualizer.tsx`: Renders the FFT or waveform data.
    *   `ConnectionButton.tsx`: Button to initiate or manage connection.
*   These sub-components will receive state (signals) and callbacks as props from the main `WebRTC.tsx` island.

## Phase 4: Utility Functions Consolidation

*   Identify any generic utility functions currently within `WebRTC.tsx`.
*   **Examples:** `formatTime`, `frequencyToNote`, `noteToFrequency`, `clamp`, specific logging helpers.
*   Move these to appropriate locations:
    *   General utilities: `fresh_webrtc_ds_template/lib/utils/`
    *   Synth-specific utilities: `fresh_webrtc_ds_template/lib/synth/utils.ts` (new file)
    *   WebRTC-specific utilities: `fresh_webrtc_ds_template/lib/webrtc/utils.ts` (new file)
*   Ensure these utilities are pure functions where possible.

## State Management Strategy

*   **Services (`AudioEngineService`, `WebRTCService`):** Manage their internal state using standard TypeScript class properties and methods. They do not directly use or expose Preact signals.
*   **Hooks (`useAudioEngine`, `useWebRTCConnection`, `useSignaling`):**
    *   Act as a bridge between services and the UI.
    *   Hold UI-relevant state in Preact signals.
    *   Subscribe to events or call methods on services and update their signals accordingly.
    *   Provide memoized callback functions to components to trigger actions in services.
*   **Components (`WebRTC.tsx`, sub-components):**
    *   Are driven by signals from the hooks.
    *   Call action methods provided by hooks to modify state or trigger operations.

## Error Handling Strategy

A robust error handling strategy is crucial for a complex system like this. Errors should be handled consistently across layers:

*   **Services (`AudioEngineService`, `WebRTCService`):**
    *   Should throw specific, typed errors (custom error classes extending `Error` are recommended, e.g., `AudioEngineError`, `WebRTCConnectionError`).
    *   Avoid catching errors that they cannot handle meaningfully; let them propagate.
    *   Log critical internal errors with sufficient context.
*   **Hooks (`useAudioEngine`, `useWebRTCConnection`, `useSignaling`):**
    *   Should catch errors originating from the services they manage.
    *   Expose error states as Preact signals (e.g., `error: Signal<Error | null>`). This allows UI components to react to errors.
    *   Provide methods to clear error states if applicable.
    *   Log errors caught from services, possibly with additional context from the hook's state.
*   **UI Components (`WebRTC.tsx`, sub-components):**
    *   Should check error signals from hooks and display user-friendly error messages or fallback UI.
    *   Avoid complex error recovery logic; this should primarily reside in hooks or services.
    *   Report critical UI-level errors if they occur.
*   **Logging:**
    *   Implement a consistent logging strategy. Use different log levels (e.g., DEBUG, INFO, WARN, ERROR).
    *   Ensure logs provide enough context to diagnose issues (e.g., component name, method name, relevant state).
    *   The `addLog` function mentioned in the original `WebRTC.tsx` should be standardized and potentially made part of a logging utility or context.

## Performance Considerations

Given the real-time nature of WebRTC and audio synthesis, performance is key:

*   **Audio Processing (`AudioEngineService`, `useAudioEngine`):**
    *   **Parameter Updates:** For frequently updated parameters from UI controls (e.g., sliders for filter cutoff), consider debouncing or throttling updates in the hook or component to avoid overwhelming the Web Audio `AudioParam` scheduling.
    *   **FFT Analysis:**
        *   Choose an appropriate `fftSize` for `AnalyserNode` – larger sizes give more frequency resolution but cost more CPU.
        *   Update FFT data for visualizations using `requestAnimationFrame` to sync with display refresh rates and avoid unnecessary processing when the UI is not visible.
    *   **Worklets:** For more complex custom audio processing in the future, consider Audio Worklets to run JavaScript code on the audio rendering thread, preventing main thread jank.
*   **WebRTC (`WebRTCService`, `useWebRTCConnection`):**
    *   **Data Channels:** If sending large or frequent messages over data channels, use efficient serialization formats (e.g., Protocol Buffers, MessagePack, or optimized JSON).
    *   **Video/Audio Tracks:** While not explicitly detailed for synthesis, if media tracks are involved, be mindful of codec choices and resolution/bitrate settings.
*   **Preact/UI (`WebRTC.tsx`, Hooks, Sub-Components):**
    *   **Memoization:** Leverage `useMemo` and `useCallback` appropriately in hooks and components to prevent unnecessary re-calculations and re-renders of child components.
    *   **Signal Updates:** Ensure Preact signals are updated only when necessary. Batch updates if multiple related signals change together to trigger a single re-render.
    *   **Component Profiling:** Use Preact DevTools or browser performance profiling tools to identify and address rendering bottlenecks if they arise.
    *   **Virtualization:** For long logs or lists, consider list virtualization techniques.

## Step-by-Step Implementation Guidance for Claude

1.  **Create Service Stubs:** Start by creating the service files (`AudioEngineService.ts`, `WebRTCService.ts`) with basic class structures and method signatures based on the existing logic in `WebRTC.tsx`.
2.  **Implement `AudioEngineService.ts`:**
    *   Gradually move all Web Audio API related logic (context creation, node setup, parameter updates, pink noise, FFT) from `WebRTC.tsx` into this service.
    *   Test methods individually if possible.
3.  **Implement `WebRTCService.ts`:**
    *   Move all `RTCPeerConnection` logic (creation, offer/answer, ICE, data channels) from `WebRTC.tsx` into this service.
    *   Define clear interfaces for callbacks needed for signaling.
4.  **Develop `useSignaling.ts` Hook:**
    *   Extract WebSocket logic from `WebRTC.tsx`.
    *   Manage WebSocket connection state with signals.
    *   Provide `connect`, `sendMessage`, and `onMessage` callback prop.
5.  **Develop `useAudioEngine.ts` Hook:**
    *   Instantiate `AudioEngineService`.
    *   Create signals for synth parameters and audio state.
    *   Wrap `AudioEngineService` methods with callbacks that update signals.
6.  **Develop `useWebRTCConnection.ts` Hook:**
    *   Instantiate `WebRTCService`.
    *   Use `useSignaling` (or accept its `sendMessage` and `onMessage` as props/callbacks) for signaling.
    *   Manage WebRTC connection state with signals.
    *   Implement logic to orchestrate offer/answer/ICE exchange via signaling.
7.  **Refactor `WebRTC.tsx` Incrementally:**
    *   Start by replacing WebSocket logic with `useSignaling`.
    *   Then, replace direct audio manipulation with `useAudioEngine`.
    *   Finally, replace direct WebRTC peer connection logic with `useWebRTCConnection`.
    *   As you replace logic, bind UI elements to the signals and actions from the hooks.
8.  **Extract UI Sub-Components:**
    *   Once the main island is using hooks, identify self-contained UI sections (e.g., the bank of synth sliders, the log display) and move them into separate components in `fresh_webrtc_ds_template/components/webrtc/`.
9.  **Consolidate Utilities:** Move helper functions to their respective utility files.
10. **Testing Strategy (Expanded):**
    *   **`AudioEngineService.ts` & `WebRTCService.ts` (Services):**
        *   **Unit Testing:** These should be highly unit-testable.
        *   Mock Web APIs: Use libraries like `jest-webgl-canvas-mock` (can be adapted for Web Audio) or create simple mocks for `AudioContext`, `RTCPeerConnection`, etc.
        *   Focus on testing internal logic, state changes, and correct interaction with mocked APIs.
        *   Test edge cases and error handling (e.g., what happens if `AudioContext` creation fails).
    *   **`useAudioEngine.ts`, `useWebRTCConnection.ts`, `useSignaling.ts` (Hooks):**
        *   **Unit Testing:** Use a Preact hooks testing library (e.g., `@testing-library/preact-hooks` if available or adapt React's).
        *   Mock service dependencies: Provide mock implementations of `AudioEngineService`, `WebRTCService`, and WebSocket.
        *   Test that hooks correctly manage their state (signals) in response to service interactions or simulated events.
        *   Verify that callbacks provided by hooks correctly invoke service methods.
    *   **UI Components (`WebRTC.tsx`, Sub-Components):**
        *   **Component Testing:** Use `@testing-library/preact`.
        *   Focus on rendering output based on props and signals.
        *   Test user interactions (e.g., button clicks, slider changes) and ensure they trigger the correct callbacks.
        *   Mock hooks or pass mock signals/callbacks as props for isolated component testing.
    *   **Integration Testing:**
        *   Consider a few key integration tests for critical user flows (e.g., establishing a WebRTC connection and sending a message, playing a note and hearing sound if a mock audio output can be verified).
        *   These tests would involve less mocking and verify interactions between multiple modules.
    *   **Manual Testing:** Indispensable for a real-time audio/video application.
        *   Perform thorough manual testing in target browsers after each significant refactoring step and before releases.
        *   Check for audio quality, connection stability, UI responsiveness, and error recovery.
11. **Review and Refine:** After the initial refactoring, review the new structure for clarity, efficiency, adherence to best practices, and the newly added considerations for error handling and performance.

## Suggested Directory Structure

```
fresh_webrtc_ds_template/
├── components/
│   └── webrtc/                 # New: For WebRTC/Synth UI sub-components
│       ├── SynthControlSlider.tsx
│       ├── SynthControlsPanel.tsx
│       └── ...
├── islands/
│   ├── WebRTC.tsx              # Slimmed down main island
│   └── hooks/
│       ├── useAudioEngine.ts     # New
│       ├── useWebRTCConnection.ts# New
│       └── useSignaling.ts       # New (or adapted from existing if any)
├── lib/
│   ├── synth/
│   │   ├── index.ts
│   │   └── utils.ts            # New: For synth-specific utilities
│   ├── utils/
│   │   ├── formatTime.ts
│   │   └── ...                 # Existing general utilities
│   └── webrtc/
│       ├── index.ts            # (or webrtc.ts if it exists)
│       └── utils.ts            # New: For WebRTC-specific utilities
└── services/                   # New directory for core logic services
    ├── AudioEngineService.ts   # New
    └── WebRTCService.ts      # New
```

This plan provides a structured approach to refactoring `WebRTC.tsx`. Adhering to these steps should result in a more robust, understandable, and maintainable codebase. Remember to commit changes frequently and test thoroughly at each stage.