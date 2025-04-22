/**
 * Portamento parameters for the synthesizer
 * Controls the glide time between notes
 */

import { createNumberParam } from "./core/params.ts";

// === Constants ===

/** Minimum portamento time in seconds */
export const MIN_PORTAMENTO_TIME = 0;

/** Maximum portamento time in seconds */
export const MAX_PORTAMENTO_TIME = 5;

// === Parameter Descriptors ===

/** Portamento time parameter descriptor */
export const portamentoTimeParam = createNumberParam({
  name: "portamentoTime",
  min: MIN_PORTAMENTO_TIME,
  max: MAX_PORTAMENTO_TIME,
  defaultValue: MIN_PORTAMENTO_TIME,
  format: (val) => {
    if (val === 0) return "Off";
    return val < 0.01 ? `${Math.round(val * 1000)}ms` : `${val.toFixed(2)}s`;
  },
});
