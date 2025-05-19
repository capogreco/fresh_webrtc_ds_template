/**
 * Parameter utilities for Default Mode
 *
 * This module provides helper functions for working with Default Mode parameters,
 * including parameter mapping, validation, and conversion between different formats.
 */

import type { DefaultModeGroup, DefaultModeParamMessage } from "./types.ts";

/**
 * Map from parameter name to group for flat parameter references
 */
export const PARAM_TO_GROUP_MAP: Record<string, DefaultModeGroup> = {
  // Basic parameters
  "volume": "basic",
  "tempo": "basic",
  "active": "basic",
  "volumeCheckLevel": "basic",

  // Noise parameters
  "noiseType": "noise",
  "noiseLevel": "noise",
  "noiseEnabled": "noise",
  "noiseReverbSend": "noise",
  "noiseRateNumerator": "noise",
  "noiseRateNumeratorMode": "noise",
  "noiseRateDenominator": "noise",
  "noiseRateDenominatorMode": "noise",
  "noiseDensity": "noise", // Legacy
  "noiseDensityMode": "noise", // Legacy

  // Filter parameters removed for Ryoji Ikeda aesthetic

  // Blip parameters (mid-range tonal pulses)
  "blipType": "blips",
  "blipDuration": "blips",
  "blipLevel": "blips",
  "blipsEnabled": "blips",
  "blipReverbSend": "blips",
  "blipFrequency": "blips",
  "blipFrequencyMode": "blips",
  "blipPitchRange": "blips",
  "blipPitchRangeMode": "blips",

  // Click parameters (high-frequency clicks)
  "clickType": "clicks",
  "clickDuration": "clicks",
  "clickLevel": "clicks",
  "clicksEnabled": "clicks",
  "clickReverbSend": "clicks",
  "clickFrequency": "clicks",

  // Envelope parameters removed for Ryoji Ikeda aesthetic

  // Timing parameters
  "subdivisionNumerator": "timing",
  "subdivisionNumeratorMode": "timing",
  "subdivisionDenominator": "timing",
  "subdivisionDenominatorMode": "timing",

  // Pattern parameters
  "steps": "pattern",
  "pulses": "pattern",
  "pulsesMode": "pattern",
  "rotation": "pattern",
  "rotationMode": "pattern",

  // Reverb parameters
  "reverbMix": "reverb",
  "reverbDecay": "reverb",
  "reverbPreDelay": "reverb",
  "reverbEnabled": "reverb",
};

/**
 * Map from flat parameter name to group-specific parameter name
 */
export const PARAM_NAME_MAP: Record<string, string> = {
  // Noise parameters
  "noiseType": "type",
  "noiseLevel": "level",
  "noiseEnabled": "enabled",
  "noiseReverbSend": "reverbSend",
  "noiseRateNumerator": "rateNumerator",
  "noiseRateNumeratorMode": "rateNumeratorMode",
  "noiseRateDenominator": "rateDenominator",
  "noiseRateDenominatorMode": "rateDenominatorMode",
  "noiseDensity": "density", // Legacy
  "noiseDensityMode": "densityMode", // Legacy

  // Filter parameters removed for Ryoji Ikeda aesthetic

  // Blip parameters (mid-range tonal pulses)
  "blipType": "type",
  "blipDuration": "duration",
  "blipLevel": "level",
  "blipsEnabled": "enabled",
  "blipReverbSend": "reverbSend",
  "blipFrequency": "frequency",
  "blipFrequencyMode": "frequencyMode",
  "blipPitchRange": "pitchRange",
  "blipPitchRangeMode": "pitchRangeMode",

  // Click parameters (high-frequency clicks)
  "clickType": "type",
  "clickDuration": "duration",
  "clickLevel": "level",
  "clicksEnabled": "enabled",
  "clickReverbSend": "reverbSend",
  "clickFrequency": "frequency",

  // Envelope parameters removed for Ryoji Ikeda aesthetic

  // Reverb parameters
  "reverbMix": "mix",
  "reverbDecay": "decay",
  "reverbPreDelay": "preDelay",
  "reverbEnabled": "enabled",
};

/**
 * Special parameter mappings for compatibility
 */
export const SPECIAL_PARAM_MAPPINGS: Record<
  string,
  { group: DefaultModeGroup; param: string }
> = {
  // Handle special case parameters
  "defaultMasterVolume": { group: "basic", param: "volume" },
  "defaultActive": { group: "basic", param: "active" },
  "defaultTempo": { group: "basic", param: "tempo" },
  "defaultGlobalOnOff": { group: "basic", param: "active" },
  "defaultGlobalReverbAmount": { group: "reverb", param: "mix" },
  "defaultGlobalMasterVolume": { group: "basic", param: "volume" },
  "defaultVolumeCheckLevel": { group: "basic", param: "volumeCheckLevel" },
  "defaultNoiseReverbAmount": { group: "noise", param: "reverbSend" },

  // Global parameters from params.ts
  "global_volume": { group: "basic", param: "volume" },
  "global_tempo": { group: "basic", param: "tempo" },
  "global_sin_resolution": { group: "basic", param: "sinResolution" },
  "global_harmonic_root": { group: "basic", param: "harmonicRoot" },
};

/**
 * Parse a parameter identifier into group and parameter name
 * @param paramId Parameter identifier
 * @returns Object with group and parameter name
 */
export function parseParamId(
  paramId: string,
): { group: DefaultModeGroup; param: string } {
  // Check for special mappings first
  if (paramId in SPECIAL_PARAM_MAPPINGS) {
    return SPECIAL_PARAM_MAPPINGS[paramId];
  }

  // Check if the parameter is in dot notation (group.param)
  const parts = paramId.split(".");
  if (parts.length === 2) {
    return {
      group: parts[0] as DefaultModeGroup,
      param: parts[1],
    };
  }

  // Check if it's a flat parameter name
  if (paramId in PARAM_TO_GROUP_MAP) {
    const group = PARAM_TO_GROUP_MAP[paramId];
    const param = PARAM_NAME_MAP[paramId] || paramId;
    return { group, param };
  }

  // Default fallback - try to infer
  for (
    const group of [
      "basic",
      "noise",
      "filter",
      "clicks",
      "envelope",
      "timing",
      "pattern",
      "reverb",
    ] as DefaultModeGroup[]
  ) {
    if (paramId.startsWith(group)) {
      // Remove group prefix and capitalize first letter
      const paramName = paramId.substring(group.length);
      const param = paramName.charAt(0).toLowerCase() + paramName.slice(1);
      return { group, param };
    }
  }

  // Last resort fallback
  console.warn(
    `Could not parse parameter: ${paramId}, using basic.active as fallback`,
  );
  return { group: "basic", param: "active" };
}

/**
 * Create a properly formatted DefaultModeParamMessage from a parameter ID and value
 * @param paramId Parameter identifier
 * @param value Parameter value
 * @returns Formatted message object
 */
export function createDefaultModeParamMessage(
  paramId: string,
  value: unknown,
): DefaultModeParamMessage {
  const { group, param } = parseParamId(paramId);

  return {
    type: "default_mode_param",
    group,
    param,
    value: value as string | number | boolean,
  };
}
