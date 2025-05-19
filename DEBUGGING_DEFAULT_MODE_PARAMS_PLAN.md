````markdown
# Debugging Plan: Default Mode Parameter Errors & No Audio

## 1. Objective

To diagnose and resolve two critical issues with the Default Mode
implementation:

1. Persistent "Unknown parameter: [param_name]" errors logged by the synth
   client's audio engine (originating from `useAudioEngine.ts` via
   `AudioEngineService.ts` or `DefaultModeEngine`).
2. No audio output in Default Mode after the initial pink noise volume check,
   despite parameter changes being sent from the controller.

This plan provides systematic steps to trace parameter flow and engine state on
the synth client.

## 2. Background & Current Symptoms

- The controller UI for Default Mode global parameters is functional and sends
  `synth_param` messages.
- `WebRTC.tsx` and `useAudioEngine.ts` have been refactored to correctly forward
  these generic `synth_param` messages to `AudioEngineService.ts`.
- However, logs like
  `[AUDIO_ENGINE] Unknown parameter: global_volume useAudioEngine.ts:74:16`
  indicate that `AudioEngineService` or `DefaultModeEngine` is not recognizing
  the received parameter IDs.
- There is no audible output from the `DefaultModeEngine` after the pink noise
  check, even when the `defaultGlobalOnOff` parameter (or its mapped equivalent)
  is intended to start the engine.

## 3. Diagnostic Steps

### Step 3.1: Verify Parameter ID Consistency (End-to-End)

**Objective:** Ensure the exact `paramId` strings used in shared definitions,
sent by the controller, and expected/mapped by the synth engine are identical.

**Actions for Claude:**

1. **Check `shared/modes/default/params.ts`:**
   - Confirm the exact `id` string for the global master volume. The plan
     specifies `"defaultGlobalMasterVolume"`.
   - Confirm the exact `id` string for the global on/off switch. The plan
     specifies `"defaultGlobalOnOff"`.
   - Verify all other parameter IDs intended for Default Mode.

2. **Check Controller Sending Logic (`Controller.tsx` / `SynthControls.tsx`):**
   - Ensure that the `paramId` passed to `handleGlobalDefaultModeParamChange`
     (and subsequently to `broadcastGlobalSynthParam`) in `Controller.tsx`
     precisely matches the `id` field from the `SynthParamDescriptor` objects
     loaded from `shared/modes/default/params.ts`.
   - Specifically, verify that the UI control for master volume sends
     `"defaultGlobalMasterVolume"` as the `paramId`, not `"global_volume"`.

3. **Check Parameter Mapping Utility (`param_utils.ts` -
   `SPECIAL_PARAM_MAPPINGS`):**
   - If this utility is used by `AudioEngineService` or `DefaultModeEngine` to
     translate incoming `paramId`s to internal engine parameter names (e.g.,
     mapping `"defaultGlobalOnOff"` to `"basic.active"`):
     - Ensure the keys in `SPECIAL_PARAM_MAPPINGS` _exactly match_ the `paramId`
       strings defined in `shared/modes/default/params.ts` (e.g., key is
       `"defaultGlobalMasterVolume"`, not `"global_volume"`).
     - Ensure the mapped values (e.g., `"basic.active"`, `"basic.volume"`) are
       what `DefaultModeEngine` internally expects for those functions.

4. **Action:** Correct any discrepancies in `paramId` naming immediately. Ensure
   consistency across all files. The `id` in `shared/modes/default/params.ts` is
   the canonical source of truth for external-facing parameter names.

### Step 3.2: Add Detailed Logging for Parameter Flow & Engine State (Synth Client)

**Objective:** Insert verbose logging at critical points in the synth client's
parameter handling and engine lifecycle to trace the flow and identify where
recognition or action fails.

**Actions for Claude (Modify these files on the synth client):**

1. **`AudioEngineService.ts` - `updateParameter(paramId: string, value: any)`
   method:**
   - At the very beginning of this method, add:
     ```typescript
     this.addLog(
       `AES.updateParameter: Received paramId='${paramId}', value='${
         String(value)
       }', activeMode='${this.activeMode}'`,
     );
     ```
   - If `param_utils.ts` / `SPECIAL_PARAM_MAPPINGS` is used here for
     translation:
     ```typescript
     // After attempting to get a mapped ID
     this.addLog(
       `AES.updateParameter: Original paramId='${paramId}', Mapped ID (if any)='${
         mappedId || "N/A"
       }'`,
     );
     ```
   - Just before calling any method on `this.currentModeEngine` (e.g.,
     `this.currentModeEngine.updateParam(...)`):
     ```typescript
     this.addLog(
       `AES.updateParameter: Forwarding to DefaultModeEngine: ID='${forwardedParamId}', Value='${
         String(value)
       }'`,
     );
     ```
   - If `AudioEngineService` directly handles certain global parameters (like
     `defaultGlobalMasterVolume`):
     ```typescript
     // Example for master volume
     if (
       paramId === "defaultGlobalMasterVolume" /* or its mapped equivalent */
     ) {
       this.addLog(
         `AES.updateParameter: Setting master volume directly to ${value}`,
       );
       // ... actual gain set ...
     }
     ```

2. **`DefaultModeEngine` (`engine.ts`) - Its main parameter update method (e.g.,
   `updateParam(internalParamId: string, value: any)`):**
   - At the very beginning of this method:
     ```typescript
     this.logger(
       `DME.updateParam: Received internalParamId='${internalParamId}', value='${
         String(value)
       }'`,
     );
     ```
   - Inside the logic that handles the parameter mapped from
     `defaultGlobalOnOff` (e.g., `internalParamId === 'basic.active'`):
     ```typescript
     this.logger(
       `DME.updateParam: 'basic.active' (from defaultGlobalOnOff) is now ${value}. Calling this.start() or this.stop().`,
     );
     // ... call this.start() or this.stop() ...
     ```
   - For any other parameter it's supposed to handle (SIN rules, resolution
     modes, CPM, f0, etc.):
     ```typescript
     this.logger(
       `DME.updateParam: Handling '${internalParamId}'. New value stored/SINResolver updated.`,
     );
     ```
   - If a received `internalParamId` is not recognized by any specific logic:
     ```typescript
     // This is where the "Unknown parameter" log specific to the engine would come from
     this.logger(
       `DME.updateParam: ERROR - Unknown internalParamId='${internalParamId}'`,
     );
     ```

3. **`DefaultModeEngine` (`engine.ts`) - `start()` and `stop()` methods:**
   - At the beginning of `start()`:
     ```typescript
     this.logger("DME: start() called. Initializing/starting master clock...");
     // Log key initial state like CPM if available
     ```
   - At the beginning of `stop()`:
     ```typescript
     this.logger(
       "DME: stop() called. Stopping master clock and event generation.",
     );
     ```

4. **`AudioEngineService.ts` - `setMode(newMode: ControllerMode, ...)` method:**
   - Log right after `this.currentModeEngine = new DefaultModeEngine(...)`:
     ```typescript
     this.addLog(
       `AES.setMode: DefaultModeEngine instance created: ${!!this
         .currentModeEngine}`,
     );
     ```
   - Log before and after calling `this.connectCurrentEngineOutput()`:
     ```typescript
     this.addLog(
       "AES.setMode: Attempting to connect DefaultModeEngine output...",
     );
     this.connectCurrentEngineOutput();
     this.addLog(
       "AES.setMode: Call to connectCurrentEngineOutput() completed.",
     );
     ```

5. **`AudioEngineService.ts` - `connectCurrentEngineOutput()` method:**
   - Log the output node being connected:
     ```typescript
     const engineOutputNode = (this.currentModeEngine as any).getOutputNode();
     this.addLog(
       `AES.connectCurrentEngineOutput: Engine output node is ${
         engineOutputNode ? "defined" : "null/undefined"
       }.`,
     );
     if (engineOutputNode) {
       this.addLog(
         `AES.connectCurrentEngineOutput: Connecting to masterVolumeGain: ${!!this
           .masterVolumeGain}`,
       );
       // ... actual connection ...
     }
     ```

### Step 3.3: Focused Test - `defaultGlobalOnOff` and One Other Parameter

**Objective:** Isolate the parameter flow for the master start/stop and one
other simple parameter to simplify debugging.

**Actions for Claude:**

1. **Verify Parameter ID Consistency:** Complete Step 3.1 first, ensuring
   `"defaultGlobalOnOff"` and one other chosen Default Mode parameter (e.g.,
   `"defaultGlobalCPM"`) have consistent IDs end-to-end.
2. **Controller Modification (Temporary):**
   - In `Controller.tsx`, inside `handleGlobalDefaultModeParamChange`,
     temporarily modify it to _only_ broadcast `defaultGlobalOnOff` and your
     chosen second parameter (e.g., `defaultGlobalCPM`). Comment out
     broadcasting for other parameters. This reduces log noise.
3. **Run Test:**
   - Start the application with controller and synth client. Ensure Default Mode
     is active.
   - Toggle the "Master On/Off" UI control.
   - Change the UI control for the second chosen parameter (e.g., "CPM").
4. **Collect Logs:** Gather all console logs from the synth client's browser
   console.
5. **Expected Outcomes & Analysis:**
   - **No "Unknown parameter" errors** for `"defaultGlobalOnOff"` or your second
     chosen parameter in the `[AUDIO_ENGINE]` logs from `useAudioEngine.ts`.
   - Logs from `AudioEngineService.updateParameter` should show it receiving
     these two `paramId`s correctly.
   - Logs should trace the `paramId` (or its mapped equivalent) into
     `DefaultModeEngine.updateParam`.
   - Logs from `DefaultModeEngine.start()` or `stop()` should appear when
     `defaultGlobalOnOff` is toggled.
   - **Audio Output:** Sound should start and stop when "Master On/Off" is
     toggled. Changing the second parameter (e.g., CPM) should audibly affect
     the sound if the engine's clock is running.
   - If "Unknown parameter" still occurs for these, the logs from Step 3.2
     should pinpoint if the issue is in `AudioEngineService`'s routing/mapping
     or within `DefaultModeEngine`'s recognition of the (mapped) ID.
   - If parameters are recognized but there's still no audio, the logs from
     `start()`, `setMode`, and `connectCurrentEngineOutput` are critical to
     check if the engine is failing to initialize its clock or if its audio
     output isn't connected to `audioContext.destination`.

### Step 3.4: Analyze Logs & Address Discrepancies Iteratively

**Objective:** Based on the logs from the focused test, identify the exact point
of failure and correct it.

**Actions for Claude:**

1. Review the logs generated in Step 3.3.
2. If "Unknown parameter" errors persist for the tested parameters:
   - Focus on the parameter ID string itself. Is it an exact match at every
     stage (shared `params.ts`, controller UI sending, `param_utils.ts` mapping
     key, engine expectation)?
   - Is the mapping in `param_utils.ts` being correctly applied by
     `AudioEngineService` before passing to `DefaultModeEngine`?
3. If parameters are recognized by `DefaultModeEngine` but `start()`/`stop()`
   methods are not having an effect (no audio / no stop):
   - Investigate the internal clock/scheduler logic within
     `DefaultModeEngine.start()` and `stop()`.
   - Verify the audio graph connections within `DefaultModeEngine` and from
     `DefaultModeEngine`'s output to `AudioEngineService`'s main output chain
     (`connectCurrentEngineOutput`). Ensure all necessary nodes
     (`masterVolumeGain`, `audioContext.destination`) are valid and connected.
4. Once `defaultGlobalOnOff` and one other parameter work correctly end-to-end
   (UI change -> audible effect), incrementally uncomment broadcasting for other
   Default Mode parameters in `Controller.tsx` and test them one by one,
   ensuring each is recognized and functional. Correct mappings or engine logic
   as needed for each.

This structured approach should help isolate the root cause of the parameter
recognition issues and the lack of audio output.
````
