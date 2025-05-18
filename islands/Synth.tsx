import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { type UseAudioEngineReturn } from "./hooks/useAudioEngine.ts";

// Define props for the Synth island with specific audio engine type
interface SynthProps {
  audio: UseAudioEngineReturn;
}

export default function Synth({ audio }: SynthProps) {
  // FFT Analyzer Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Update FFT visualization colors based on audio activity
  const getFftColors = () => {
    // Base colors
    if (!audio.audioContextReady.value) {
      return {
        background: "#f5f5f5",
        border: "#ddd",
        bars: "#aaaaaa",
        text: "#888888",
      };
    }

    // Audio ready, check if note is active
    if (audio.isNoteActive.value) {
      return {
        background: "#f0f8ff", // Light blue background when note is playing
        border: "#4682b4", // Steel blue border
        bars: "#4169e1", // Royal blue bars
        text: "#333333",
      };
    } else {
      return {
        background: "#f9f9f9",
        border: "#cccccc",
        bars: "#5088c5",
        text: "#555555",
      };
    }
  };

  const colors = getFftColors();

  // FFT Analyzer Drawing Effect
  useEffect(() => {
    if (!canvasRef.current) { // Canvas not yet available in the DOM
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) { // Context couldn't be retrieved
      return;
    }

    // Check if audio is ready and FFT data is available
    if (
      !audio.audioContextReady.value || !audio.fftData.value ||
      audio.fftData.value.length === 0
    ) {
      // Clear canvas if audio not ready, no FFT data, or FFT data array is empty
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dataArray = audio.fftData.value; // This is a Uint8Array
    const bufferLength = dataArray.length; // Number of frequency bins

    // Dynamically set canvas internal resolution to its displayed size
    // This is important for crisp rendering if CSS affects canvas dimensions
    if (canvas.width !== canvas.clientWidth) {
      canvas.width = canvas.clientWidth;
    }
    if (canvas.height !== canvas.clientHeight) {
      canvas.height = canvas.clientHeight;
    }

    context.clearRect(0, 0, canvas.width, canvas.height); // Clear previous frame

    const barWidth = (canvas.width / bufferLength) * 0.8; // Adjust bar width (e.g., 80% of bin width)
    let barHeight;

    // Calculate starting x to center the bars on the canvas
    const totalBarAndSpaceWidth = (bufferLength * barWidth) +
      Math.max(0, bufferLength - 1) * 1; // Assuming 1px spacing
    let x = (canvas.width - totalBarAndSpaceWidth) / 2;
    if (x < 0) x = 0; // Prevent negative start if bars would overflow

    // Use our color
    context.fillStyle = colors.bars;

    // Draw a gradient based on frequency
    for (let i = 0; i < bufferLength; i++) {
      // Normalize and scale the bar height
      barHeight = (dataArray[i] / 255.0) * canvas.height;

      // Add a minimum height so small values are still visible
      if (barHeight < 2 && barHeight > 0) barHeight = 2;

      // Slight variation in color based on frequency bin
      if (audio.isNoteActive.value) {
        // When a note is playing, use a more vibrant gradient
        const hue = 210 + (i / bufferLength * 30); // Range from 210 to 240 (blue spectrum)
        const saturation = 70 + Math.min(20, (dataArray[i] / 255.0) * 30);
        const lightness = 50 + Math.min(20, (1 - i / bufferLength) * 20);
        context.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      }

      // Draw the bar
      context.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1; // Move to next bar position (barWidth + 1px spacing)
    }
  }, [
    audio.fftData.value,
    audio.audioContextReady.value,
    audio.isNoteActive.value,
    colors,
  ]); // Dependencies

  // Update the FFT drawing color
  useEffect(() => {
    if (canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      if (context) {
        context.fillStyle = colors.bars;
      }
    }
  }, [colors.bars, audio.isNoteActive.value]);

  return (
    <div class="synth-island-wrapper" style="max-width: 800px; margin: 0 auto;">
      {/* FFT Analyzer Container and Canvas */}
      <div
        class="fft-analyzer-container"
        style={`margin: 20px auto; 
               padding: 15px; 
               border-radius: 10px;
               border: 1px solid ${colors.border}; 
               width: 100%; 
               max-width: 650px; 
               background-color: ${colors.background};
               box-shadow: 0 2px 4px rgba(0,0,0,0.05);
               transition: all 0.3s ease;`}
      >
        <h3
          style={`margin-top: 0; 
                   text-align: center; 
                   color: ${colors.text}; 
                   font-size: 1.2rem;
                   font-weight: 500;
                   margin-bottom: 10px;`}
        >
          Frequency Spectrum Analyzer
        </h3>
        <canvas
          ref={canvasRef}
          id="fftCanvas"
          width="600"
          height="180"
          style={`border: 1px solid ${colors.border}; 
                 border-radius: 5px; 
                 display: block; 
                 margin: 0 auto; 
                 background-color: rgba(255,255,255,0.7);`}
        >
        </canvas>
      </div>

      {/* Synth Status Display */}
      <div
        class="synth-status"
        style="margin: 20px auto; max-width: 650px; background-color: white; border-radius: 10px; border: 1px solid #ddd; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"
      >
        <div class="synth-info">
          <h3 style="margin-top: 0; color: #444; font-size: 1.2rem; text-align: center; margin-bottom: 15px;">
            Synth Parameters
          </h3>
          <div
            class="param-display"
            style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;"
          >
            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Note Status
              </div>
              <div
                class="param-value"
                style={`font-weight: bold; font-size: 1.1em; color: ${
                  audio.isNoteActive.value ? "#2e8b57" : "#777"
                };`}
              >
                {audio.isNoteActive.value ? "PLAYING" : "OFF"}
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Pitch
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {audio.currentNote.value || "—"}
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Waveform
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {audio.waveform.value}
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Detune
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {audio.detune.value > 0
                  ? `+${audio.detune.value}`
                  : audio.detune.value} ¢
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Volume
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {Math.round(audio.volume.value * 100)}%
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Attack
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {audio.attack.value < 0.01
                  ? `${Math.round(audio.attack.value * 1000)}ms`
                  : `${audio.attack.value.toFixed(2)}s`}
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Release
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {audio.release.value < 0.01
                  ? `${Math.round(audio.release.value * 1000)}ms`
                  : `${audio.release.value.toFixed(2)}s`}
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Filter
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {audio.filterCutoff.value < 1000
                  ? `${Math.round(audio.filterCutoff.value)}Hz`
                  : `${(audio.filterCutoff.value / 1000).toFixed(1)}kHz`}{" "}
                (Q:{audio.filterResonance.value.toFixed(1)})
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Vibrato
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {audio.vibratoRate.value.toFixed(1)}Hz,{" "}
                {Math.round(audio.vibratoWidth.value)}¢
              </div>
            </div>

            <div
              class="param-item"
              style="padding: 8px; border-radius: 6px; background-color: #f8f8f8;"
            >
              <div
                class="param-label"
                style="font-weight: 500; color: #555; margin-bottom: 4px;"
              >
                Portamento
              </div>
              <div
                class="param-value"
                style="font-weight: bold; font-size: 1.1em; color: #446688;"
              >
                {audio.portamentoTime.value === 0
                  ? "Off"
                  : `${audio.portamentoTime.value.toFixed(2)}s`}
              </div>
            </div>
          </div>
          <p
            class="control-info"
            style="text-align: center; margin-top: 15px; color: #888; font-style: italic; font-size: 0.9em;"
          >
            Synth controls available in controller interface
          </p>
        </div>
      </div>
    </div>
  );
}
