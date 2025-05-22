// fresh_webrtc_ds_template/types/instruments/ikeda_synth_defaults.ts

import { 
  IkedaGlobalSettings, 
  IkedaParameters, 
  IkedaSynthState, 
  IKEDA_SYNTH_INSTRUMENT_ID
} from "./ikeda_synth_types.ts";

/**
 * Default global settings for the Ikeda Synth
 */
export const DEFAULT_IKEDA_GLOBAL_SETTINGS: IkedaGlobalSettings = {
  active: { is_resolved: true, value: false, update_channel: "reliable" },
  tempo_cpm: { is_resolved: true, value: 120, update_channel: "streaming" },
  beats_per_global_cycle: { is_resolved: true, value: 4, update_channel: "reliable" },
};

/**
 * Default parameters for the Ikeda Synth
 */
export const DEFAULT_IKEDA_PARAMETERS: IkedaParameters = {
  // Pink Noise Layer Defaults
  pink_noise_active: { is_resolved: true, value: true, update_channel: "reliable" },
  pink_noise_volume: { is_resolved: true, value: 0.5, update_channel: "streaming" },
  pink_noise_reverb_wet_dry: { is_resolved: true, value: 0.3, update_channel: "reliable" },
  pink_noise_lfo_rate_rule: { 
    is_resolved: false, 
    value: {
      rule_type: "harmonic_ratio_cpm",
      numerator: { values: [1], selection_mode: "static" },
      denominator: { values: [1, 2, 4, 8], selection_mode: "static" },
    }, 
    update_channel: "reliable" 
  },
  pink_noise_lfo_initial_phase_randomized: { is_resolved: true, value: true, update_channel: "reliable" },

  // Blips Layer Defaults
  blip_active: { is_resolved: true, value: true, update_channel: "reliable" },
  blip_base_f0_hz: { is_resolved: true, value: 220, update_channel: "streaming" },
  blip_pitch_harmonic_ratio_rule: {
    is_resolved: false,
    value: { 
      rule_type: "harmonic_ratio_pitch",
      numerator: { values: [1, 2, 3, 4], selection_mode: "static"},
      denominator: { values: [1, 2, 3, 4], selection_mode: "static"},
    },
    update_channel: "reliable"
  },
  blip_duration_ms: { is_resolved: true, value: 100, update_channel: "reliable" },
  blip_euclidean_rhythm_rule: {
    is_resolved: false,
    value: {
      rule_type: "euclidean_rhythm_trigger",
      pulses: { values: [3], selection_mode: "static"},
      steps: { values: [8], selection_mode: "static"},
      offset: { values: [0], selection_mode: "static"},
    },
    update_channel: "reliable"
  },
  blip_amplitude: { is_resolved: true, value: 0.7, update_channel: "streaming" },
  blip_reverb_wet_dry: { is_resolved: true, value: 0.2, update_channel: "reliable" },
  blip_timbre_source: { is_resolved: true, value: "sine_env", update_channel: "reliable" },

  // Clicks Layer Defaults
  click_active: { is_resolved: true, value: true, update_channel: "reliable" },
  click_timbre_source: { is_resolved: true, value: "digital_impulse", update_channel: "reliable" },
  click_length_ms: { is_resolved: true, value: 1.0, update_channel: "reliable" },
  click_euclidean_rhythm_rule: {
    is_resolved: false,
    value: {
      rule_type: "euclidean_rhythm_trigger",
      pulses: { values: [4], selection_mode: "static" },
      steps: { values: [16], selection_mode: "static" },
      offset: { values: [0], selection_mode: "static" },
    },
    update_channel: "reliable"
  },
  click_reverb_wet_dry: { is_resolved: true, value: 0.1, update_channel: "reliable" },

  // Snare Layer Defaults
  snare_active_after_reset: { is_resolved: true, value: true, update_channel: "reliable" },
  snare_timbre_source: { is_resolved: true, value: "white_noise_rectangular_env", update_channel: "reliable" },
  snare_duration_beats: { is_resolved: true, value: 1, update_channel: "reliable" },
  snare_amplitude: { is_resolved: true, value: 0.8, update_channel: "reliable" },
  snare_reverb_wet_dry: { is_resolved: true, value: 0.25, update_channel: "reliable" },
  snare_target_beat_in_cycle: { is_resolved: true, value: 3, update_channel: "reliable" },
};

/**
 * Default complete state for the Ikeda Synth
 */
export const DEFAULT_IKEDA_SYNTH_STATE: IkedaSynthState = {
  instrument_id: IKEDA_SYNTH_INSTRUMENT_ID,
  global_settings: DEFAULT_IKEDA_GLOBAL_SETTINGS,
  parameters: DEFAULT_IKEDA_PARAMETERS,
};