/**
 * Vibrato parameters for the synthesizer
 * Controls frequency modulation for vibrato effect
 */

import { createNumberParam } from "./core/params.ts";

// === Constants ===

/** Minimum vibrato rate in Hz */
export const MIN_VIBRATO_RATE = 0;

/** Maximum vibrato rate in Hz */
export const MAX_VIBRATO_RATE = 20;

/** Minimum vibrato width in cents */
export const MIN_VIBRATO_WIDTH = 0;

/** Maximum vibrato width in cents */
export const MAX_VIBRATO_WIDTH = 100;

// === Parameter Descriptors ===

/** Vibrato rate parameter descriptor */
export const vibratoRateParam = createNumberParam({
  name: "vibratoRate",
  min: MIN_VIBRATO_RATE,
  max: MAX_VIBRATO_RATE,
  defaultValue: MIN_VIBRATO_RATE,
  format: (val) => val === 0 ? "Off" : `${val.toFixed(1)}Hz`,
});

/** Vibrato width parameter descriptor */
export const vibratoWidthParam = createNumberParam({
  name: "vibratoWidth",
  min: MIN_VIBRATO_WIDTH,
  max: MAX_VIBRATO_WIDTH,
  defaultValue: MIN_VIBRATO_WIDTH,
  format: (val) => val === 0 ? "Off" : `${val}¢`,
});
