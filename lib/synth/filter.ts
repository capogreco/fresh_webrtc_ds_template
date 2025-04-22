/**
 * Filter parameters for the synthesizer
 * Controls the low-pass filter cutoff and resonance
 */

import { createNumberParam } from "./core/params.ts";

// === Constants ===

/** Minimum filter cutoff frequency in Hz */
export const MIN_FILTER_CUTOFF = 20;

/** Maximum filter cutoff frequency in Hz */
export const MAX_FILTER_CUTOFF = 20000;

/** Minimum filter resonance (Q) */
export const MIN_FILTER_RESONANCE = 0;

/** Maximum filter resonance (Q) */
export const MAX_FILTER_RESONANCE = 30;

// === Parameter Descriptors ===

/** Filter cutoff parameter descriptor */
export const filterCutoffParam = createNumberParam({
  name: "filterCutoff",
  min: MIN_FILTER_CUTOFF,
  max: MAX_FILTER_CUTOFF,
  defaultValue: MAX_FILTER_CUTOFF * 0.8, // 80% of max for a slightly mellower tone
  format: (val) =>
    val < 1000 ? `${Math.round(val)}Hz` : `${(val / 1000).toFixed(1)}kHz`,
});

/** Filter resonance parameter descriptor */
export const filterResonanceParam = createNumberParam({
  name: "filterResonance",
  min: MIN_FILTER_RESONANCE,
  max: MAX_FILTER_RESONANCE,
  defaultValue: MIN_FILTER_RESONANCE,
  format: (val) => val.toFixed(1),
});
