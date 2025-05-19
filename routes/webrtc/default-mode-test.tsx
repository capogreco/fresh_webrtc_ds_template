/**
 * Test page for Default Mode functionality
 */
import { PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import WebRTC from "../../islands/WebRTC.tsx";
import { DEV_MODE } from "../../lib/config.ts";

export default function DefaultModeTestPage(props: PageProps) {
  // Only allow access in DEV_MODE
  if (!DEV_MODE) {
    return (
      <div class="container">
        <h1>Default Mode Test Page</h1>
        <p>
          This page is only available in development mode. Please set DEV_MODE
          to true in config.ts.
        </p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Default Mode Test - WebRTC Synth</title>
        <link rel="stylesheet" href="/styles.css" />
        <style>
          {`
          .test-heading {
            background-color: #f85149;
            color: white;
            padding: 10px;
            text-align: center;
            font-weight: bold;
            margin-bottom: 20px;
          }
          
          .test-panel {
            margin-top: 20px;
            padding: 15px;
            border: 1px solid #444c56;
            border-radius: 8px;
            background-color: rgba(22, 27, 34, 0.3);
          }
          
          .test-section {
            margin-bottom: 20px;
          }
          
          .test-section h3 {
            margin-top: 0;
            color: #539bf5;
            border-bottom: 1px solid #444c56;
            padding-bottom: 5px;
          }
          
          .test-button {
            margin: 5px;
            padding: 8px 12px;
            border-radius: 6px;
            background-color: #2d333b;
            color: #adbac7;
            border: 1px solid #444c56;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          
          .test-button:hover {
            background-color: #394249;
            border-color: #768390;
          }
          
          .test-button-primary {
            background-color: #347d39;
            color: white;
            border-color: #46954a;
          }
          
          .test-button-primary:hover {
            background-color: #46954a;
            border-color: #6fdd8b;
          }
          
          .test-button-warning {
            background-color: #966600;
            color: white;
            border-color: #c88000;
          }
          
          .test-range {
            width: 100%;
            margin: 10px 0;
          }
          
          .test-input-row {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
          }
          
          .test-input-row label {
            flex: 0 0 120px;
            margin-right: 10px;
          }
          
          .test-input-row input,
          .test-input-row select {
            flex: 1;
            padding: 5px;
            background-color: #22272e;
            border: 1px solid #444c56;
            border-radius: 4px;
            color: #adbac7;
          }
        `}
        </style>
      </Head>
      <div class="test-heading">
        DEFAULT MODE TEST PAGE
      </div>
      <WebRTC />
      <div class="test-panel">
        <h2>Default Mode Test Controls</h2>

        <div class="test-section">
          <h3>Basic Controls</h3>
          <button id="dm-activate" class="test-button test-button-primary">
            Activate Default Mode
          </button>
          <button id="dm-deactivate" class="test-button test-button-warning">
            Deactivate Default Mode
          </button>

          <div class="test-input-row">
            <label>Master Volume:</label>
            <input
              type="range"
              id="dm-volume"
              min="0"
              max="1"
              step="0.01"
              value="0.7"
              class="test-range"
            />
            <span id="dm-volume-value">0.7</span>
          </div>

          <div class="test-input-row">
            <label>Tempo (CPM):</label>
            <input
              type="range"
              id="dm-tempo"
              min="10"
              max="120"
              step="1"
              value="30"
              class="test-range"
            />
            <span id="dm-tempo-value">30</span>
          </div>
        </div>

        <div class="test-section">
          <h3>Noise Controls</h3>
          <div class="test-input-row">
            <label>Noise Type:</label>
            <select id="dm-noise-type">
              <option value="white">White</option>
              <option value="pink" selected>Pink</option>
              <option value="brown">Brown</option>
              <option value="blue">Blue</option>
              <option value="violet">Violet</option>
            </select>
          </div>

          <div class="test-input-row">
            <label>Noise Level:</label>
            <input
              type="range"
              id="dm-noise-level"
              min="0"
              max="1"
              step="0.01"
              value="0.5"
              class="test-range"
            />
            <span id="dm-noise-level-value">0.5</span>
          </div>

          <div class="test-input-row">
            <label>Noise Enabled:</label>
            <input type="checkbox" id="dm-noise-enabled" checked />
          </div>

          <div class="test-input-row">
            <label>Noise Density:</label>
            <input type="text" id="dm-noise-density" value="1" />
          </div>
        </div>

        <div class="test-section">
          <h3>Filter Controls</h3>
          <div class="test-input-row">
            <label>Filter Type:</label>
            <select id="dm-filter-type">
              <option value="lowpass" selected>Lowpass</option>
              <option value="highpass">Highpass</option>
              <option value="bandpass">Bandpass</option>
              <option value="notch">Notch</option>
            </select>
          </div>

          <div class="test-input-row">
            <label>Cutoff:</label>
            <input
              type="range"
              id="dm-cutoff"
              min="20"
              max="20000"
              step="1"
              value="1000"
              class="test-range"
            />
            <span id="dm-cutoff-value">1000 Hz</span>
          </div>

          <div class="test-input-row">
            <label>Resonance:</label>
            <input
              type="range"
              id="dm-resonance"
              min="0"
              max="30"
              step="0.1"
              value="2"
              class="test-range"
            />
            <span id="dm-resonance-value">2</span>
          </div>
        </div>

        <div class="test-section">
          <h3>Euclidean Pattern Controls</h3>
          <div class="test-input-row">
            <label>Steps:</label>
            <input
              type="range"
              id="dm-steps"
              min="1"
              max="32"
              step="1"
              value="16"
              class="test-range"
            />
            <span id="dm-steps-value">16</span>
          </div>

          <div class="test-input-row">
            <label>Pulses:</label>
            <input type="text" id="dm-pulses" value="4" />
          </div>

          <div class="test-input-row">
            <label>Rotation:</label>
            <input type="text" id="dm-rotation" value="0" />
          </div>
        </div>

        <div class="test-section">
          <h3>Click Controls</h3>
          <div class="test-input-row">
            <label>Click Type:</label>
            <select id="dm-click-type">
              <option value="sine">Sine</option>
              <option value="burst" selected>Burst</option>
              <option value="pulse">Pulse</option>
              <option value="digital">Digital</option>
            </select>
          </div>

          <div class="test-input-row">
            <label>Click Duration:</label>
            <input
              type="range"
              id="dm-click-duration"
              min="1"
              max="500"
              step="1"
              value="20"
              class="test-range"
            />
            <span id="dm-click-duration-value">20 ms</span>
          </div>

          <div class="test-input-row">
            <label>Click Enabled:</label>
            <input type="checkbox" id="dm-click-enabled" checked />
          </div>

          <div class="test-input-row">
            <label>Click Frequency:</label>
            <input type="text" id="dm-click-frequency" value="440" />
          </div>
        </div>
      </div>

      <script>
        {`
        // Wait for window load
        window.addEventListener('load', () => {
          // Helper function to send a parameter to the Default Mode engine
          function sendParam(paramId, value) {
            // Dispatch a custom event that WebRTC.tsx can listen for
            const event = new CustomEvent('default-mode-test', {
              detail: {
                type: 'synth_param',
                param: paramId,
                value: value
              }
            });
            window.dispatchEvent(event);
            console.log('Default Mode Test:', paramId, value);
          }
          
          // Set up event listeners for the test controls
          document.getElementById('dm-activate').addEventListener('click', () => {
            // First switch to Default Mode
            const modeChangeEvent = new CustomEvent('default-mode-test', {
              detail: {
                type: 'controller_mode',
                mode: 'default'
              }
            });
            window.dispatchEvent(modeChangeEvent);
            
            // Then activate the Default Mode
            sendParam('basic.active', true);
          });
          
          document.getElementById('dm-deactivate').addEventListener('click', () => {
            sendParam('basic.active', false);
          });
          
          // Set up range input events
          document.getElementById('dm-volume').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('dm-volume-value').textContent = value.toFixed(2);
            sendParam('basic.volume', value);
          });
          
          document.getElementById('dm-tempo').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('dm-tempo-value').textContent = value;
            sendParam('basic.tempo', value);
          });
          
          document.getElementById('dm-noise-type').addEventListener('change', (e) => {
            sendParam('noise.type', e.target.value);
          });
          
          document.getElementById('dm-noise-level').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('dm-noise-level-value').textContent = value.toFixed(2);
            sendParam('noise.level', value);
          });
          
          document.getElementById('dm-noise-enabled').addEventListener('change', (e) => {
            sendParam('noise.enabled', e.target.checked);
          });
          
          document.getElementById('dm-noise-density').addEventListener('change', (e) => {
            sendParam('noise.density', e.target.value);
          });
          
          document.getElementById('dm-filter-type').addEventListener('change', (e) => {
            sendParam('filter.type', e.target.value);
          });
          
          document.getElementById('dm-cutoff').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('dm-cutoff-value').textContent = value + ' Hz';
            sendParam('filter.cutoff', value);
          });
          
          document.getElementById('dm-resonance').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('dm-resonance-value').textContent = value.toFixed(1);
            sendParam('filter.resonance', value);
          });
          
          document.getElementById('dm-steps').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('dm-steps-value').textContent = value;
            sendParam('pattern.steps', value);
          });
          
          document.getElementById('dm-pulses').addEventListener('change', (e) => {
            sendParam('pattern.pulses', e.target.value);
          });
          
          document.getElementById('dm-rotation').addEventListener('change', (e) => {
            sendParam('pattern.rotation', e.target.value);
          });
          
          document.getElementById('dm-click-type').addEventListener('change', (e) => {
            sendParam('clicks.type', e.target.value);
          });
          
          document.getElementById('dm-click-duration').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('dm-click-duration-value').textContent = value + ' ms';
            sendParam('clicks.duration', value);
          });
          
          document.getElementById('dm-click-enabled').addEventListener('change', (e) => {
            sendParam('clicks.enabled', e.target.checked);
          });
          
          document.getElementById('dm-click-frequency').addEventListener('change', (e) => {
            sendParam('clicks.frequency', e.target.value);
          });
        });
        `}
      </script>
    </>
  );
}
