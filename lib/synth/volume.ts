/**
 * Volume parameter for the synthesizer
 * Controls the main output gain
 */

import { createNumberParam } from "./core/params.ts";

// === Constants ===

/** Minimum volume (silent) */
export const MIN_VOLUME = 0;

/** Maximum volume (full) */
export const MAX_VOLUME = 1;

// === Parameter Descriptors ===

/** Volume parameter descriptor */
export const volumeParam = createNumberParam({
  name: "volume",
  min: MIN_VOLUME,
  max: MAX_VOLUME,
  defaultValue: 0.1, // 10% volume by default to avoid being too loud
  format: (val) => `${Math.round(val * 100)}%`,
});
