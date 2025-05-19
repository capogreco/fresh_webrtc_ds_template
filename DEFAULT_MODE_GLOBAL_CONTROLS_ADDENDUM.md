````markdown
# Addendum: Global Controls for Default Mode

## (To be used with `DEFAULT_MODE_IMPLEMENTATION_PLAN.md`)

**Objective:** Refactor the Default Mode UI in `Controller.tsx` so that its
primary controls are global (affecting all connected synth clients) rather than
per-client. This serves as a "Phase 1.5" or a refinement of Phase 1 in the main
`DEFAULT_MODE_IMPLEMENTATION_PLAN.md`.

---

### Step 1: Modify `Controller.tsx` for Global Default Mode Controls

1. **File:** `fresh_webrtc_ds_template/islands/Controller.tsx`
2. **State for Global Default Mode Parameter _Values_:**
   - Add a new signal to hold the live values of the global parameters
     specifically for Default Mode:
     ```typescript
     // In Controller.tsx, with other state signals
     // Ensure ControllerMode and KNOWN_CONTROLLER_MODES are imported from shared/controllerModes.ts
     // Ensure DEFAULT_MODE_PARAMS are imported from shared/modes/default/params.ts
     const globalDefaultModeParamsState = useSignal<Record<string, any>>({});

     // Initialize and update this state when the mode is DEFAULT
     // This useEffect should be placed after currentMode and addLog are defined
     useEffect(() => {
       if (currentMode.value === KNOWN_CONTROLLER_MODES.DEFAULT) {
         const initialDefaults: Record<string, any> = {};
         // Ensure DEFAULT_MODE_PARAMS is available in this scope
         // It might be part of MODE_PARAMS_MAP[KNOWN_CONTROLLER_MODES.DEFAULT]
         const defaultParamsDescriptors =
           MODE_PARAMS_MAP[KNOWN_CONTROLLER_MODES.DEFAULT] || [];
         defaultParamsDescriptors.forEach((descriptor) => {
           initialDefaults[descriptor.id] = descriptor.defaultValue;
         });
         globalDefaultModeParamsState.value = initialDefaults;
         addLog("Initialized global Default Mode parameters state.");
       } else {
         // Optional: Clear state if mode is not Default, or manage as needed
         // globalDefaultModeParamsState.value = {};
       }
     }, [currentMode.value]); // Re-run when currentMode changes
     ```

3. **Render Global Default Mode Controls in JSX:**
   - In the `return (...)` statement of `Controller.tsx`, add a new UI section
     that renders _only when_
     `currentMode.value === KNOWN_CONTROLLER_MODES.DEFAULT`. This section should
     be separate from and typically rendered _before_ the
     `ClientManagerProvider` and `ClientList`.
     ```jsx
     {/* ... existing user info div ... */}

     {
       currentMode.value === KNOWN_CONTROLLER_MODES.DEFAULT && (
         <div
           class="default-mode-global-controls section-box"
           style="margin-bottom: 20px; padding: 15px; border: 1px solid #ccc;"
         >
           {/* Basic styling for separation */}
           <h2>Default Mode Global Controls</h2>
           <SynthControls
             idPrefix="global_default" // Static prefix for HTML element ID uniqueness
             params={globalDefaultModeParamsState.value} // Pass the signal holding global param VALUES
             paramDescriptors={MODE_PARAMS_MAP[
               KNOWN_CONTROLLER_MODES.DEFAULT
             ] || []} // Pass DEFAULT_MODE_PARAMS descriptors
             onParamChange={(paramId, newValue) => {
               // 1. Update local state for immediate UI feedback
               globalDefaultModeParamsState.value = {
                 ...globalDefaultModeParamsState.value,
                 [paramId]: newValue,
               };
               addLog(`Global Default Param Changed: ${paramId} = ${newValue}`);

               // 2. Broadcast this change to ALL connected synth clients
               // This requires broadcastGlobalSynthParam method in useClientManager
               clientManagerInstanceRef.current?.broadcastGlobalSynthParam(
                 paramId,
                 newValue,
               );
             }}
             // currentOperatingMode={currentMode.value} // Optional: Pass mode if SynthControls needs to adapt further
           />
         </div>
       );
     }

     {/* ClientList and other forms remain below, wrapped in ClientManagerProvider */}
     <ClientManagerProvider value={clientManagerInstanceRef.current}>
       {/* ... ClientList, AddClientForm, BroadcastMessageForm ... */}
     </ClientManagerProvider>;
     ```
4. **Ensure `currentModeParams` (renamed to `activeParamDescriptorsForUI` or
   similar for clarity) is still computed for passing to `ClientList` for
   _other_ modes if they have per-client controls:**
   ```typescript
   // In Controller.tsx
   const paramDescriptorsForClientList = computed(() => {
     if (
       currentMode.value !== KNOWN_CONTROLLER_MODES.DEFAULT &&
       MODE_PARAMS_MAP[currentMode.value]
     ) {
       return MODE_PARAMS_MAP[currentMode.value];
     }
     // For Default Mode, ClientList won't show main controls, or if other modes have no specific per-client UI needs
     return []; // Or potentially SYNTH_PARAMS (old global) if other modes use that for per-client controls
   });
   ```
   Then pass this to `ClientList`:
   `paramDescriptors={paramDescriptorsForClientList.value}`.

---

### Step 2: Update `useClientManager.ts` for Global Parameter Broadcasting

1. **File:** `fresh_webrtc_ds_template/islands/hooks/useClientManager.ts`
2. **New Method:** Add `broadcastGlobalSynthParam` to the object returned by
   `useClientManager`.
   ```typescript
   // Inside the useClientManager hook function, before the return statement:
   const broadcastGlobalSynthParam = (paramId: string, value: unknown) => {
     addLog(
       `Broadcasting global param update: ${paramId} = ${value} to ${clients.value.size} clients.`,
     );
     clients.value.forEach((client, clientId) => { // Changed 'client' to 'clientId' to avoid confusion if client obj has id
       const clientObj = clients.value.get(clientId); // Get the client object
       if (
         clientObj?.dataChannel && clientObj.dataChannel.readyState === "open"
       ) {
         try {
           clientObj.dataChannel.send(JSON.stringify({
             type: "synth_param", // Synth client listens for this type
             param: paramId, // The ID of the global Default Mode parameter
             value: value, // The new value (e.g., SIN string, enum value)
             // No specific client target; synth interprets as global for its current mode
           }));
         } catch (error) {
           addLog(
             `Error broadcasting global param to client ${clientId}: ${error}`,
           );
           console.error(`Error broadcasting to ${clientId}:`, error);
         }
       }
     });
   };

   // In the return statement of useClientManager, include the new method:
   return {
     // ... existing methods and signals ...
     broadcastGlobalSynthParam,
     // ...
   };
   ```

---

### Step 3: Update `SynthControls.tsx` for Flexibility

1. **File:** `fresh_webrtc_ds_template/components/controller/SynthControls.tsx`
2. **Props Modification:**
   - Make `clientId` prop optional and rename to `idPrefix` for clarity, as it's
     mainly for DOM ID uniqueness.
     ```typescript
     interface SynthControlsProps {
       idPrefix?: string; // Optional: Used to make HTML element IDs unique
       params: Record<string, any>;
       paramDescriptors: readonly SynthParamDescriptor[];
       onParamChange: (paramId: string, value: unknown) => void;
       // currentOperatingMode?: ControllerMode; // Can be passed if specific UI changes per mode are needed in SynthControls
     }
     ```
   - In the component body, use `props.idPrefix` when generating `controlId`:
     ```typescript
     // const controlId = `${descriptor.id}-${clientId}`; // Old
     const controlId = `${
       props.idPrefix ?? descriptor.id_fallback
     }_${descriptor.id}`; // New, ensure unique
     ```
     (Ensure `descriptor.id_fallback` is robust or simplify if `idPrefix` is
     always provided for global/client context). A simple approach:
     `const controlId =`
     ${props.idPrefix ? props.idPrefix + "_" : ""}${descriptor.id}`;`
3. **Conditional Rendering of Generic Note On/Off:**
   - The existing logic to hide the generic "Note On/Off" controls if
     `paramDescriptors !== SYNTH_PARAMS` (i.e., if mode-specific parameters like
     `DEFAULT_MODE_PARAMS` are passed) should be maintained or adapted. For
     Default Mode, these generic controls should indeed be hidden, as control is
     through `defaultGlobalOnOff`.
   - A more robust way to check if using mode-specific params:
     ```tsx
     // At the top of SynthControls function, before return:
     // const isUsingGlobalDefaultParams = paramDescriptors === SYNTH_PARAMS; // Old check
     // Better: Check if 'defaultGlobalOnOff' exists in current descriptors
     const hasDefaultModeGlobalToggle = paramDescriptors.some(p => p.id === 'defaultGlobalOnOff');

     // In JSX for Note On/Off:
     {!hasDefaultModeGlobalToggle && ( /* Render generic Note On/Off if defaultGlobalOnOff is NOT in current params */
       // ... existing Note On/Off JSX ...
     )}
     ```

---

### Step 4: Update `ClientList.tsx` to Conditionally Render Per-Client Controls

1. **File:** `fresh_webrtc_ds_template/components/controller/ClientList.tsx`
2. **Props:**
   - Ensure it receives `currentOperatingMode: ControllerMode` (already
     planned).
   - The `paramDescriptors` prop it receives should be intended for _per-client
     controls for non-Default modes_.
3. **Conditional Rendering of Per-Client `SynthControls`:**
   - Inside the `clientsArray.map(...)` function, wrap the rendering of the
     per-client `<SynthControls>` instance (or the `div.client-controls` that
     contains it) in a condition:
     ```tsx
     {
       client.connected && client.synthParams &&
         (props.currentOperatingMode !== KNOWN_CONTROLLER_MODES.DEFAULT) &&
         props.paramDescriptors && props.paramDescriptors.length > 0 && (
           // ^^^ Only render per-client SynthControls if NOT in Default Mode AND if there are descriptors for it
           <div class="client-controls">
             {
               /*
           Pass props.paramDescriptors here. These would be for specific per-client
           controls if a non-Default mode is active and has such parameters.
           For Default Mode, this whole block is skipped.
         */
             }
             <SynthControls
               idPrefix={`client_${clientId}`}
               params={client.synthParams}
               onParamChange={(param, value) =>
                 onSynthParamChange(clientId, param, value)} // This is the per-client onSynthParamChange
               paramDescriptors={props.paramDescriptors}
             />
           </div>
         );
     }
     {
       /* For Default Mode, you could display minimal, read-only status for each client here,
         but not the main interactive controls, as those are now global. */
     }
     ```

---

**Testing for this Addendum:**

- Verify that when `Controller.tsx` is in "Default Mode":
  - A global set of controls (from `DEFAULT_MODE_PARAMS`) appears outside/above
    the client list.
  - Changing these global controls updates `globalDefaultModeParamsState` in
    `Controller.tsx`.
  - These changes are broadcast via
    `clientManagerInstanceRef.current.broadcastGlobalSynthParam(...)`.
  - The `ClientList` does _not_ show individual Default Mode controls for each
    client.
- Verify that if `currentMode` is switched to something _other_ than Default
  Mode (and if that mode has `paramDescriptors` configured for per-client use),
  the `ClientList` _does_ show the per-client controls.

This addendum provides the necessary steps to refactor the controller UI for
global Default Mode parameter management.
````
