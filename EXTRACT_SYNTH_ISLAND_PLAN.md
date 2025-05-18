````markdown
# Plan for Extracting `Synth.tsx` Island from `WebRTC.tsx`

## 1. Objective

To improve modularity and reduce the complexity of
`fresh_webrtc_ds_template/islands/WebRTC.tsx` by extracting the synthesizer
display UI (including parameter readouts and FFT visualization) into a new,
dedicated island component: `fresh_webrtc_ds_template/islands/Synth.tsx`.

## 2. Prerequisites

- The `fresh_webrtc_ds_template/islands/WebRTC.tsx` component is functional.
- The `useAudioEngine` hook
  (`fresh_webrtc_ds_template/islands/hooks/useAudioEngine.ts`) provides the
  necessary audio state and FFT data via its returned `audio` object.

## 3. Steps

### 3.1. Create `Synth.tsx` File

1. **Action:** Create a new file: `fresh_webrtc_ds_template/islands/Synth.tsx`.
2. **Action:** Add initial boilerplate for a Preact component:

   ```typescript
   import { h } from "preact";
   import { useEffect, useRef } from "preact/hooks";
   import { type Signal } from "@preact/signals"; // For typing props if needed
   // Potentially import type for the 'audio' object from useAudioEngine if available
   // import { type UseAudioEngineReturn } from "./hooks/useAudioEngine.ts";

   // Define props for the Synth island
   interface SynthProps {
     audio: any; // Replace 'any' with a more specific type for the audio engine object if possible
     // e.g., audio: UseAudioEngineReturn;
   }

   export default function Synth({ audio }: SynthProps) {
     const canvasRef = useRef<HTMLCanvasElement | null>(null);

     // FFT Analyzer Drawing Effect (will be moved here)
     useEffect(() => {
       // ... FFT drawing logic will go here ...
     }, [audio.fftData.value, audio.audioContextReady.value]);

     return (
       <div>
         {/* FFT Analyzer and Synth Status UI will be moved here */}
       </div>
     );
   }
   ```
   _Note: The specific type for the `audio` prop might need to be defined or
   imported if `useAudioEngine.ts` exports its return type. For now, `any` can
   be a placeholder._

### 3.2. Move FFT Analyzer Logic from `WebRTC.tsx` to `Synth.tsx`

1. **Identify in `WebRTC.tsx`:**
   - The `const canvasRef = useRef<HTMLCanvasElement | null>(null);`
     declaration. (Currently around line 1048 in `WebRTC.tsx`)
   - The `useEffect` hook responsible for FFT drawing. (Currently around lines
     1109-1150 in `WebRTC.tsx`)
2. **Action (Cut from `WebRTC.tsx`, Paste into `Synth.tsx`):**
   - Cut the `canvasRef` declaration from `WebRTC.tsx`.
   - Paste it into `Synth.tsx`, replacing the placeholder `canvasRef` in the
     boilerplate.
   - Cut the entire FFT `useEffect` hook from `WebRTC.tsx`.
   - Paste it into `Synth.tsx`, replacing the placeholder FFT `useEffect` in the
     boilerplate.
3. **Verify in `Synth.tsx`:**
   - Ensure `useRef` and `useEffect` are imported from `preact/hooks`.
   - Ensure the `useEffect` dependencies (`audio.fftData.value`,
     `audio.audioContextReady.value`) correctly refer to the `audio` prop.

### 3.3. Move FFT Analyzer and Synth Status JSX from `WebRTC.tsx` to `Synth.tsx`

1. **Identify in `WebRTC.tsx` (within the `return` statement, in the `else`
   branch of `showAudioButton.value`):**
   - The FFT Analyzer container:
   ```html
   <div
     class="fft-analyzer-container"
     style="margin: 20px auto; padding: 10px; border: 1px solid #ddd; width: 502px; background-color: #f9f9f9"
   >
     <h3 style="margin-top: 0; text-align: center">FFT Analyzer</h3>
     <canvas
       ref="{canvasRef}"
       id="fftCanvas"
       width="500"
       height="150"
       style="border: 1px solid #ccc; display: block; margin: 0 auto"
     ></canvas>
   </div>
   ```
   (Currently around lines 1232-1235 in `WebRTC.tsx`)
   - The main synth status display block: The `div` that starts with
     `<div class="synth-status">` and contains the `synth-info` and
     `param-display` sections. This is part of the larger
     `<div class="synth-ui">` block. For simplicity, we can initially move the
     `<div class="fft-analyzer-container">...</div>` and the
     `<div class="synth-status">...</div>` sections. (The
     `<div class="synth-status">` is currently around line 1245 in
     `WebRTC.tsx`).

2. **Action (Cut from `WebRTC.tsx`, Paste into `Synth.tsx`):**
   - Cut the identified JSX blocks (FFT analyzer container and the
     `synth-status` div) from `WebRTC.tsx`.
   - Paste them into the `return` statement of `Synth.tsx`, replacing the
     placeholder `<div>...</div>`.
   - The `Synth.tsx` return statement should look something like this:
   ```tsx
   return (
     <div class="synth-island-wrapper">
       {/* Or any appropriate wrapper */}
       {/* FFT Analyzer Container and Canvas (pasted from WebRTC.tsx) */}
       <div
         class="fft-analyzer-container"
         style="margin: 20px auto; padding: 10px; border: 1px solid #ddd; width: 502px; background-color: #f9f9f9;"
       >
         <h3 style="margin-top: 0; text-align: center;">FFT Analyzer</h3>
         <canvas
           ref={canvasRef}
           id="fftCanvas"
           width="500"
           height="150"
           style="border: 1px solid #ccc; display: block; margin: 0 auto;"
         >
         </canvas>
       </div>

       {/* Synth Status Display (pasted from WebRTC.tsx) */}
       <div class="synth-status">
         <div class="synth-info">
           <h3>Synth Status</h3>
           <div class="param-display">
             {/* All the <p> tags for Note Status, Pitch, Waveform, etc. */}
             {/* Ensure all 'audio.*.value' references correctly use the 'audio' prop */}
             <p>
               Note Status:{" "}
               <span
                 class={audio.isNoteActive.value ? "status-on" : "status-off"}
               >
                 {audio.isNoteActive.value ? "PLAYING" : "OFF"}
               </span>
             </p>
             {/* ... other parameter displays ... */}
           </div>
           <p class="control-info">
             Synth controls available in controller interface
           </p>
         </div>
       </div>
     </div>
   );
   ```
3. **Verify in `Synth.tsx`:**
   - Ensure all JSX is correctly structured.
   - Ensure all references like `audio.frequency.value`, `audio.fftData.value`,
     `canvasRef` correctly use the props or refs defined within `Synth.tsx`.
   - Ensure `Math.round` or any other global utilities used in the parameter
     displays are available (they should be).

### 3.4. Update `WebRTC.tsx` to Use the New `Synth` Island

1. **Action (In `WebRTC.tsx`):**
   - Add an import for the new `Synth` island at the top of the file:
     ```typescript
     import Synth from "./Synth.tsx";
     ```
   - In the JSX `return` statement of `WebRTC.tsx`, where the FFT analyzer and
     synth status JSX was removed, render the new `Synth` island. Pass the
     `audio` object (from `useAudioEngine`) as a prop:
     ```tsx
     // ... inside the <div class="synth-and-volume-adjust-ui"> ...
     // Before:
     // {/* FFT Analyzer (removed) */}
     // {/* Main Synth UI elements ... <div class="synth-status"> (removed) ... */}

     // After:
     <Synth audio={audio} />;
     // ... other parts of synth-ui like connection-info, logs, etc., might remain or also be moved if desired.
     // For this plan, only FFT and synth-status are moved initially.
     ```
     The location will be within the `<div class="synth-ui">` block, or directly
     under the conditional pink noise section if `<div class="synth-ui">`'s
     content is being fully replaced by `<Synth />` and other elements. Adjust
     structure as needed. A common placement might be:
     ```tsx
     // ... inside <div class="synth-and-volume-adjust-ui">
     // {audio.pinkNoiseActive.value && !audio.pinkNoiseSetupDone.value && ( PinkNoiseUI )}

     // <div class="synth-ui"> // This existing wrapper in WebRTC.tsx might still be useful
     //   <h1>WebRTC Synth</h1>
     //   <div class="status-bar">...</div>
          <Synth audio={audio} /> {/* Replaces the FFT and synth-status sections */}
     //   <div class="connection-info">...</div>
     //   <div class="message-area">...</div>
     //   <div class="log">...</div>
     // </div>
     ```

2. **Verify in `WebRTC.tsx`:**
   - The `canvasRef` declaration and the FFT `useEffect` hook should be
     completely removed from `WebRTC.tsx`.
   - The `Synth` component is correctly imported and rendered with the `audio`
     prop.

### 3.5. Final Checks and Cleanup

1. **Review Both Files:**
   - `Synth.tsx`: Ensure all necessary imports (`h`, `useRef`, `useEffect`,
     types) are present. Check for any dangling references to variables that
     were only available in `WebRTC.tsx`.
   - `WebRTC.tsx`: Ensure removal of moved code is clean. Check for any errors
     related to the `Synth` component integration.
2. **Test Application:**
   - Run the application (`deno task start`).
   - Verify that the "Enable Audio" flow works.
   - Verify that after enabling audio, the volume adjustment UI (if active) and
     the main synth UI (including FFT and parameter displays) appear correctly.
   - Verify the FFT analyzer is working.
   - Verify synth parameter displays update correctly.
3. **Consider Further Refinements (Optional):**
   - Define a more specific type for the `audio` prop in `SynthProps` by
     exporting the return type of `useAudioEngine` from `useAudioEngine.ts` and
     importing it in `Synth.tsx`. Example:
   ```typescript
   // In useAudioEngine.ts
   // export type UseAudioEngineReturn = ReturnType<typeof useAudioEngine>;

   // In Synth.tsx
   // import { type UseAudioEngineReturn } from "./hooks/useAudioEngine.ts";
   // interface SynthProps { audio: UseAudioEngineReturn; }
   ```
   - Review if other parts of the `<div class="synth-ui">` in `WebRTC.tsx` (like
     the main `<h1>WebRTC Synth</h1>` or the `status-bar`) should also logically
     belong in `Synth.tsx`. For this initial extraction, we've focused on the
     most stateful parts (FFT and parameter displays).

## 4. Expected Outcome

- `WebRTC.tsx` will be smaller and less concerned with the direct rendering
  details of the synth's visual state.
- `Synth.tsx` will be a focused component responsible for displaying all
  synth-related information and visualizations.
- Improved code organization and maintainability.
````
