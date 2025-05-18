// ridge-rat-type2-pink-noise-processor.js

// Coefficients for a 3-stage Type 2 generator
// Based on discussions/examples related to RidgeRat-Tech/Larry Trammell's work
// (e.g., as seen in some music-dsp archive C++ examples)
const P_COEFFS = Object.freeze([0.319, 0.7756, 0.9613]); // Pole positions for each stage
const A_COEFFS = Object.freeze([0.02109238, 0.07113478, 0.68873558]); // Amplitude weights for each stage
const NUM_STAGES = 3;

class RidgeRatType2PinkNoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.states = new Float32Array(NUM_STAGES); // Stores current state of each Type 2 generator (R_k-1)
    // Initialize states to zero or small random values if preferred
  }

  static get parameterDescriptors() {
    return [
      {
        name: "amplitude",
        defaultValue: 1.0, // Adjust as needed; output level depends on A_COEFFS
        minValue: 0,
        maxValue: 5, // Max value may need adjustment based on typical output
        automationRate: "a-rate",
      },
    ];
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outputChannel = output[0]; // Assuming mono output

    const amplitudeValues = parameters.amplitude;
    let currentAmplitude;

    for (let i = 0; i < outputChannel.length; i++) {
      currentAmplitude = amplitudeValues.length > 1
        ? amplitudeValues[i]
        : amplitudeValues[0];

      // 1. Generate a single white noise sample r (common to all stages for this time step)
      // Math.random() gives [0, 1), so map to [-1, 1)
      const white_noise_sample = Math.random() * 2.0 - 1.0;

      let pink_sum = 0.0;

      // 2. Update each Type 2 generator state and sum their weighted outputs
      for (let j = 0; j < NUM_STAGES; j++) {
        // Update rule: R_k = P[j] * R_{k-1} + (1 - P[j]) * r
        // this.states[j] holds R_{k-1} for stage j
        this.states[j] = P_COEFFS[j] * this.states[j] +
          (1.0 - P_COEFFS[j]) * white_noise_sample;

        // Add weighted state to the sum
        pink_sum += A_COEFFS[j] * this.states[j];
      }

      outputChannel[i] = pink_sum * currentAmplitude;
    }
    return true; // Keep processor alive
  }
}

registerProcessor(
  "ridge-rat-type2-pink-noise-generator",
  RidgeRatType2PinkNoiseProcessor,
);
