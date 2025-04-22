/**
 * Envelope parameters for the synthesizer
 * Controls the amplitude envelope (attack and release times)
 */

import { createNumberParam } from "./core/params.ts";

// === Constants ===

/** Minimum attack time in seconds */
export const MIN_ATTACK = 0.001; // Very small but not zero to avoid clicks

/** Maximum attack time in seconds */
export const MAX_ATTACK = 5;

/** Minimum release time in seconds */
export const MIN_RELEASE = 0.001; // Very small but not zero to avoid clicks

/** Maximum release time in seconds */
export const MAX_RELEASE = 10;

// === Parameter Descriptors ===

/** Attack time parameter descriptor */
export const attackParam = createNumberParam({
  name: "attack",
  min: MIN_ATTACK,
  max: MAX_ATTACK,
  defaultValue: MIN_ATTACK,
  format: (val) =>
    val < 0.01 ? `${Math.round(val * 1000)}ms` : `${val.toFixed(2)}s`,
});

/** Release time parameter descriptor */
export const releaseParam = createNumberParam({
  name: "release",
  min: MIN_RELEASE,
  max: MAX_RELEASE,
  defaultValue: 0.1, // Short but audible release by default
  format: (val) =>
    val < 0.01 ? `${Math.round(val * 1000)}ms` : `${val.toFixed(2)}s`,
});
