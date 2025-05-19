/**
 * Default parameter values for Default Mode
 */

import type { DefaultModeParams } from "./types.ts";

/**
 * Default parameters for the Default Mode engine
 */
export const DEFAULT_MODE_PARAMS: DefaultModeParams = {
  basic: {
    volume: 0.75,
    active: false,
    tempo: 30, // Measured in CPM (cycles per minute), not BPM
    sinResolution: "static",
    harmonicRoot: 55,
    volumeCheckLevel: 0.15, // Default volume check level as specified in the document
  },

  noise: {
    type: "pink", // Now using pink noise by default
    level: 0.7,
    enabled: true,
    reverbSend: 0, // No reverb on noise by default
    rateNumerator: "1", // Default to 1 for numerator
    rateNumeratorMode: "static",
    rateDenominator: "4 / 8 / 16", // LFO cycles at 1/4, 1/8, or 1/16 of CPM
    rateDenominatorMode: "random",
    density: "4 / 8 / 16", // Legacy parameter
    densityMode: "random", // Legacy parameter
  },

  // Filter removed for Ryoji Ikeda aesthetic

  // Renamed the previous clicks to blips (mid-range tonal pulses)
  blips: {
    type: "burst",
    duration: 20,
    level: 0.7,
    enabled: false, // Disabled by default per requirements
    reverbSend: 0.5, // 50% of blip signal sent to reverb by default
    frequency: "200 / 400 / 800",
    frequencyMode: "random",
    pitchRange: "0-24",
    pitchRangeMode: "random",
  },

  // New high-frequency clicks layer
  clicks: {
    type: "digital",
    duration: 10, // Shorter duration than blips
    level: 0.6,
    enabled: false, // Disabled by default per requirements
    reverbSend: 0.3, // 30% of click signal sent to reverb by default
    frequency: 1200, // Higher frequency than blips
  },

  // Envelope section removed for Ryoji Ikeda aesthetic

  timing: {
    subdivisionNumerator: "1", // Using 1 as the static numerator
    subdivisionNumeratorMode: "static",
    subdivisionDenominator: "8 / 16", // Choose between 8 and 16 for the denominator
    subdivisionDenominatorMode: "random",
  },

  pattern: {
    steps: 16,
    pulses: "4 / 5 / 7",
    pulsesMode: "shuffle",
    rotation: "0 / 1 / 2",
    rotationMode: "shuffle",
  },

  reverb: {
    mix: 0.3, // Global reverb mix - affects blips and clicks (but not noise directly since noise.reverbSend=0)
    decay: 1.5,
    preDelay: 20,
    enabled: true,
  },
};

/**
 * Get subdivision value in milliseconds at a given cycle rate using a harmonic ratio
 *
 * @param numerator The numerator of the subdivision ratio
 * @param denominator The denominator of the subdivision ratio
 * @param cpm Tempo in cycles per minute
 * @returns Duration in milliseconds
 */
export function getSubdivisionMs(
  numerator: number,
  denominator: number,
  cpm: number,
): number {
  // Default denominator to 1 if invalid to prevent division by zero
  const validDenominator = denominator > 0 ? denominator : 1;

  // Calculate the cycle duration in milliseconds
  const cycleDurationMs = 60000 / cpm;

  // Calculate the duration based on the harmonic ratio
  // If numerator = 1 and denominator = 8, this gives 1/8th of a cycle
  return cycleDurationMs * (numerator / validDenominator);
}

/**
 * Parse subdivision string and return the numerical value
 * @param subdivisionStr Subdivision string (e.g., "1/4", "1/8", "1/16")
 * @returns Numerical value (e.g., 4, 8, 16), or default if invalid
 */
export function parseSubdivision(subdivisionStr: string): number {
  // Default to 1/8 note if parsing fails
  let subdivision = 8;

  // Parse fraction like "1/8" or "1/16"
  if (subdivisionStr.includes("/")) {
    const parts = subdivisionStr.split("/");
    if (parts.length === 2) {
      const numerator = parseInt(parts[0], 10);
      const denominator = parseInt(parts[1], 10);

      if (!isNaN(numerator) && !isNaN(denominator) && denominator > 0) {
        subdivision = denominator;
      }
    }
  } else {
    // Handle plain numbers like "4" or "8"
    const value = parseInt(subdivisionStr, 10);
    if (!isNaN(value) && value > 0) {
      subdivision = value;
    }
  }

  return subdivision;
}
