import { IkedaModeMVPEngineParams } from "./types.ts";
import { IKEDA_MODE_MVP_PARAMS } from "../../../shared/modes/ikeda/params.ts";

// Initialize with type assertion. This requires that IkedaModeMVPEngineParams's
// properties are assignable and that IKEDA_MODE_MVP_PARAMS provides these values.
const defaults = {} as IkedaModeMVPEngineParams;

// Find and assign the specific defaults the engine cares about from the shared parameters
const onOffParam = IKEDA_MODE_MVP_PARAMS.find(p => p.id === "ikedaGlobalOnOff");
if (onOffParam !== undefined) {
  defaults.ikedaGlobalOnOff = onOffParam.defaultValue as boolean;
} else {
  console.warn("[defaults.ts] Default for 'ikedaGlobalOnOff' not found in shared params. Engine default might be incorrect or missing.");
  // Consider setting a hardcoded fallback if critical, e.g., defaults.ikedaGlobalOnOff = false;
}

const pinkNoiseLevelParam = IKEDA_MODE_MVP_PARAMS.find(p => p.id === "ikedaPinkNoiseLevel");
if (pinkNoiseLevelParam !== undefined) {
  defaults.ikedaPinkNoiseLevel = pinkNoiseLevelParam.defaultValue as number;
} else {
  console.warn("[defaults.ts] Default for 'ikedaPinkNoiseLevel' not found in shared params. Engine default might be incorrect or missing.");
}

const volumeCheckLevelParam = IKEDA_MODE_MVP_PARAMS.find(p => p.id === "ikedaVolumeCheckLevel");
if (volumeCheckLevelParam !== undefined) {
  defaults.ikedaVolumeCheckLevel = volumeCheckLevelParam.defaultValue as number;
} else {
  console.warn("[defaults.ts] Default for 'ikedaVolumeCheckLevel' not found in shared params. Engine default might be incorrect or missing.");
}

export const IKEDA_MVP_ENGINE_DEFAULTS: IkedaModeMVPEngineParams = defaults;
