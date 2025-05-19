**Objective:** To thoroughly understand the current state of the audio engine and controller logic, diagnose the root causes of the "no audio in Default/Ikeda Mode" and "parameter errors," and then formulate a highly explicit, incremental, MVP-based rebuild plan for the `IkedaModeEngine` that Claude can follow with minimal room for misinterpretation.

**Phase 1: Full Code Ingestion and Current State Analysis (My Task)**

1.  **Acknowledge All Changed Files:** Done. This ensures I'm working with the latest context provided by you.
2.  **Request and Ingest Full Content of Key Audio-Related Files:** (This is the step where you provide me with the *current complete code* for the files I listed in my previous message).
    *   `services/AudioEngineService.ts`
    *   The main `DefaultModeEngine` file (e.g., `lib/synth/default_mode/engine.ts`)
    *   Its direct utilities: `sin_parser.ts`, `sin_resolver.ts`, `euclidean.ts`, `param_utils.ts` (if still in use), `defaults.ts` (for Default Mode), `types.ts` (for Default Mode).
    *   `shared/modes/default/params.ts` (or `ikeda/params.ts` if renamed already).
    *   `islands/Controller.tsx` (to see current parameter sending logic).
    *   `islands/hooks/useAudioEngine.ts` (to see current interaction with `AudioEngineService`).
    *   `islands/WebRTC.tsx` (specifically `handleChannelMessage`).
3.  **Analyze Current Parameter Flow (My Task):**
    *   Trace how a parameter (e.g., `defaultGlobalOnOff` or the new `ikedaGlobalOnOff`) is defined in `shared/.../params.ts`.
    *   Trace how `Controller.tsx` reads this definition and sends it (what `paramId` string is actually sent).
    *   Trace how `WebRTC.tsx` receives it and passes it to `useAudioEngine.ts`.
    *   Trace how `useAudioEngine.ts` passes it to `AudioEngineService.ts`.
    *   Trace how `AudioEngineService.ts` attempts to process it or route it to the current `DefaultModeEngine` instance. This includes understanding how any mapping utilities (`param_utils.ts`) are (or are not) being used.
    *   Trace how `DefaultModeEngine` expects to receive this parameter and what internal logic it triggers.
4.  **Analyze `DefaultModeEngine` Structure and Lifecycle (My Task):**
    *   Identify how audio nodes are created, connected, and managed.
    *   Specifically look for repeated node creation in event handlers or update methods.
    *   Understand its current `start()`, `stop()`, and parameter update methods.
    *   Understand how it implements the (now integrated) volume check.
5.  **Identify Key Discrepancies and "Pain Points" (My Task):**
    *   Pinpoint exact `paramId` mismatches.
    *   Identify incorrect node lifecycle management (e.g., repeated instantiation).
    *   Identify broken or missing logic in the audio graph setup or control flow.
    *   Note any overly complex sections that deviate from the simplified MVP goals.

**Phase 2: Formulate the Explicit `IKEDA_MODE_MVP_REBUILD_PLAN.md` for Claude (My Task, Outputting to a New `.md` File)**

1.  **Define MVP Scope Clearly:** Reiterate the MVP goal: continuous pink noise, global on/off, global master volume, pink noise level, integrated volume check – all using the "Ikeda Mode" naming.
2.  **Step-by-Step Instructions for Claude:**
    *   **Step 0 (Project Prep):**
        *   Detailed instructions on which existing `lib/synth/default_mode/` files to rename (backup) to effectively clear the slate for the MVP engine.
        *   Instructions to create the new `shared/modes/ikeda/` directory and `params.ts` file with *only* the MVP parameters (e.g., `ikedaGlobalOnOff`, `ikedaGlobalMasterVolume`, `ikedaPinkNoiseLevel`, `ikedaVolumeCheckLevel`).
        *   Instructions to update `shared/controllerModes.ts` and `shared/modes/index.ts` for "Ikeda Mode."
        *   Instruction for `Controller.tsx` to default to `KNOWN_CONTROLLER_MODES.IKEDA`.
    *   **Step 1 (Implement MVP `IkedaModeEngine`):**
        *   Provide the **complete, simple code structure** for the new `lib/synth/ikeda_mode/engine.ts`. This engine will *only* handle the MVP features. (This is where I'd provide the simplified engine code we discussed earlier).
        *   Provide simple `types.ts` and `defaults.ts` for this MVP engine.
        *   Explicitly state that SIN parsers, Euclidean utils, etc., are *not* to be used or imported by this MVP engine.
    *   **Step 2 (Refactor `AudioEngineService.ts`):**
        *   Explicit instructions on how `AudioEngineService.setMode()` should instantiate the *new MVP* `IkedaModeEngine`.
        *   Explicit instructions on how `AudioEngineService.updateParameter()` should route the *MVP-specific parameters* (e.g., `ikedaGlobalOnOff`, `ikedaPinkNoiseLevel`) to the MVP `IkedaModeEngine`. Clarify that `ikedaGlobalMasterVolume` is handled by `AudioEngineService` itself.
        *   Explicit instructions for `AudioEngineService.confirmVolumeCheckComplete()` to call the MVP engine's `activateFullGenerativeMode()`.
        *   Explicit instructions for connecting the MVP engine's output.
    *   **Step 3 (Verify `useAudioEngine.ts` and `WebRTC.tsx`):**
        *   Confirm they correctly propagate the mode and parameters to `AudioEngineService`.
        *   Confirm UI logic for integrated volume check in `WebRTC.tsx` based on `audio.isVolumeCheckPending`.
    *   **Step 4 (Testing the MVP):**
        *   A very precise list of test cases for the MVP functionality (on/off, level controls, volume check flow).
        *   What logs to look for to confirm correct operation.
3.  **Emphasize Simplicity and Incrementality:** Stress that this MVP is about getting a minimal, stable version working. Future features will be added back *incrementally* onto this stable base.

**Phase 3: Claude Implements the `IKEDA_MODE_MVP_REBUILD_PLAN.md` (Claude's Task)**

1.  Claude follows the new, explicit plan.

**Phase 4: Review and Iteration (Our Joint Task)**

1.  We review Claude's MVP implementation.
2.  If the MVP works, we then create new, small, incremental plans to add back individual features (e.g., "Add Blips Layer with Rectangular Envelopes to IkedaModeEngine," then "Add Euclidean Rhythms to Blips Layer," then "Add SIN control to Blip Duration," etc.).

This meta-plan ensures that I first gain a clear understanding (as much as possible by reading code) of the current state and then provide a plan that is as unambiguous and focused as possible for Claude, minimizing the chances for complex features to interact in unexpected ways during this critical rebuild phase.
