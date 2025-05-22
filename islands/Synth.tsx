import { h } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { type UseAudioEngineReturn } from "../hooks/types.ts";
import { type UseIkedaSynthStateReturn } from "../hooks/useIkedaSynthState.ts";

// Define props for the Synth island with specific audio engine type
interface SynthProps {
  audio: UseAudioEngineReturn;
  ikedaSynth: UseIkedaSynthStateReturn | null;
}

export default function Synth({ audio, ikedaSynth }: SynthProps) {
  // FFT Analyzer Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Update FFT visualization colors based on audio activity
  const getFftColors = () => {
    // Base colors
    if (audio.audioContextStateSignal.value !== 'running') {
      return {
        background: "#f5f5f5",
        border: "#ddd",
        bars: "#aaaaaa",
        text: "#888888",
      };
    }

    // Audio ready, check if program is active
    if (audio.isProgramRunningSignal.value) { // Use isProgramRunningSignal for general activity
      return {
        background: "#f0f8ff", // Light blue background when program is active
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
      audio.audioContextStateSignal.value !== 'running' || !audio.fftData.value ||
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
      if (audio.isProgramRunningSignal.value) { // Use isProgramRunningSignal
        // When the program is active, use a more vibrant gradient
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
    audio.audioContextStateSignal.value, // Corrected: Use audio context state signal
    audio.isProgramRunningSignal.value,  // Updated to reflect program running state
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
  }, [colors.bars, audio.isProgramRunningSignal.value]);

  // Extract Ikeda synth parameters for display
  const getIkedaParameters = () => {
    if (!ikedaSynth || !ikedaSynth.stateSignal.value) {
      return null;
    }

    const state = ikedaSynth.stateSignal.value;
    
    // Extract pink noise level if available
    let pinkNoiseLevel = null;
    if (state.parameters && 
        state.parameters.pink_noise_level && 
        'value' in state.parameters.pink_noise_level) {
      pinkNoiseLevel = state.parameters.pink_noise_level.value;
    }
    
    // Extract pink noise active status if available
    let pinkNoiseActive = null;
    if (state.parameters && 
        state.parameters.pink_noise_active && 
        'value' in state.parameters.pink_noise_active) {
      pinkNoiseActive = state.parameters.pink_noise_active.value;
    }
    
    // Get tempo from global settings if available
    let tempoCpm = null;
    if (state.global_settings && 
        state.global_settings.tempo_cpm && 
        'value' in state.global_settings.tempo_cpm) {
      tempoCpm = state.global_settings.tempo_cpm.value;
    }
    
    // Get global active state if available
    let globalActive = null;
    if (state.global_settings && 
        state.global_settings.active && 
        'value' in state.global_settings.active) {
      globalActive = state.global_settings.active.value;
    }
    
    return {
      pinkNoiseLevel,
      pinkNoiseActive,
      tempoCpm,
      globalActive
    };
  };
  
  const ikedaParams = getIkedaParameters();

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
          {audio.isVolumeCheckActiveSignal.value ? (
            <div style="text-align: center;">
              <h3 style="margin-top: 0; color: #444; font-size: 1.2rem; margin-bottom: 15px;">
                Volume Calibration
              </h3>
              <p style="color: #555; margin-bottom: 20px;">
                A steady sound is playing. Please adjust your system/headphone volume to a comfortable level.
              </p>
              <div style="margin-bottom: 20px; padding: 8px; border-radius: 6px; background-color: #f0f0f0; display: inline-block;">
                <div style="font-weight: 500; color: #555; margin-bottom: 4px; font-size: 0.9em;">
                  Active Sound Context
                </div>
                <div style="font-weight: bold; font-size: 1em; color: #337ab7;">
                  {audio.activeInstrumentIdSignal.value || "Initializing..."} (Pink Noise Layer)
                </div>
              </div>
              <br />
              <button
                onClick={() => audio.confirmVolumeSetAndPrepare()}
                style="padding: 10px 20px; font-size: 1rem; color: white; background-color: #5cb85c; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease;"
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#4cae4c')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#5cb85c')}
              >
                Continue
              </button>
            </div>
          ) : (
            <>
              <h3 style="margin-top: 0; color: #444; font-size: 1.2rem; text-align: center; margin-bottom: 15px;">
                Synth Status & Controls
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
                    Program Status
                  </div>
                  <div
                    class="param-value"
                    style={`font-weight: bold; font-size: 1.1em; color: ${
                      audio.isProgramRunningSignal.value ? "#2e8b57" : "#777"
                    };`}
                  >
                    {audio.isProgramRunningSignal.value ? "ACTIVE" : "IDLE"}
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
                    Current Instrument
                  </div>
                  <div
                    class="param-value"
                    style="font-weight: bold; font-size: 1.1em; color: #337ab7;"
                  >
                    {audio.activeInstrumentIdSignal.value || "N/A"}
                  </div>
                </div>
                
                {/* Display Ikeda synth parameters if available */}
                {ikedaSynth && ikedaParams && (
                  <>
                    <div
                      class="param-item"
                      style="padding: 8px; border-radius: 6px; background-color: #f3f9ff;"
                    >
                      <div
                        class="param-label"
                        style="font-weight: 500; color: #555; margin-bottom: 4px;"
                      >
                        Ikeda Global Status
                      </div>
                      <div
                        class="param-value"
                        style={`font-weight: bold; font-size: 1.1em; color: ${
                          ikedaParams.globalActive ? "#2e8b57" : "#777"
                        };`}
                      >
                        {ikedaParams.globalActive ? "ACTIVE" : "INACTIVE"}
                      </div>
                    </div>
                    
                    {ikedaParams.tempoCpm !== null && (
                      <div
                        class="param-item"
                        style="padding: 8px; border-radius: 6px; background-color: #f3f9ff;"
                      >
                        <div
                          class="param-label"
                          style="font-weight: 500; color: #555; margin-bottom: 4px;"
                        >
                          Tempo (CPM)
                        </div>
                        <div
                          class="param-value"
                          style="font-weight: bold; font-size: 1.1em; color: #337ab7;"
                        >
                          {ikedaParams.tempoCpm}
                        </div>
                      </div>
                    )}
                    
                    {ikedaParams.pinkNoiseActive !== null && (
                      <div
                        class="param-item"
                        style="padding: 8px; border-radius: 6px; background-color: #f3f9ff;"
                      >
                        <div
                          class="param-label"
                          style="font-weight: 500; color: #555; margin-bottom: 4px;"
                        >
                          Pink Noise
                        </div>
                        <div
                          class="param-value"
                          style={`font-weight: bold; font-size: 1.1em; color: ${
                            ikedaParams.pinkNoiseActive ? "#2e8b57" : "#777"
                          };`}
                        >
                          {ikedaParams.pinkNoiseActive ? "ON" : "OFF"}
                        </div>
                      </div>
                    )}
                    
                    {ikedaParams.pinkNoiseLevel !== null && (
                      <div
                        class="param-item"
                        style="padding: 8px; border-radius: 6px; background-color: #f3f9ff;"
                      >
                        <div
                          class="param-label"
                          style="font-weight: 500; color: #555; margin-bottom: 4px;"
                        >
                          Pink Noise Level
                        </div>
                        <div
                          class="param-value"
                          style="font-weight: bold; font-size: 1.1em; color: #337ab7;"
                        >
                          {typeof ikedaParams.pinkNoiseLevel === 'number' 
                            ? `${(ikedaParams.pinkNoiseLevel * 100).toFixed(0)}%` 
                            : ikedaParams.pinkNoiseLevel}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Controls for starting/stopping the program can be added here if desired in synth client UI */}
              {/* For example:
              <div style="text-align: center; margin-top: 20px;">
                <button
                  onClick={() => audio.startProgram()}
                  disabled={audio.isProgramRunningSignal.value}
                  style="padding: 10px 15px; margin-right: 10px; font-size: 1rem; background-color: #337ab7; color: white; border: none; border-radius: 5px; cursor: pointer;"
                >
                  Start Program
                </button>
                <button
                  onClick={() => audio.stopProgram()}
                  disabled={!audio.isProgramRunningSignal.value}
                  style="padding: 10px 15px; font-size: 1rem; background-color: #d9534f; color: white; border: none; border-radius: 5px; cursor: pointer;"
                >
                  Stop Program
                </button>
              </div>
              */}
            </>
          )}

        </div>
      </div>
    </div>
  );
}