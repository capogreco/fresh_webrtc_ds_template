// fresh_webrtc_ds_template/types/instruments/ikeda_synth_types.ts

export const IKEDA_SYNTH_INSTRUMENT_ID = "ikeda_synth_v1"; // Or a versioned ID like "ikeda_synth_v1.0.0"

// --- Rule Value Objects ---
export interface IkedaRuleValue<T> {
  values: T[];
  selection_mode: "static" | "random" | "shuffle" | "ascending" | "descending";
}

// --- Global Settings ---
export interface IkedaGlobalSettings {
  active: {
    is_resolved: true;
    value: boolean;
    update_channel: "reliable";
  };
  tempo_cpm: {
    is_resolved: true;
    value: number;
    update_channel: "streaming";
  };
  beats_per_global_cycle: {
    is_resolved: true;
    value: number; // integer
    update_channel: "reliable";
  };
}

// --- Parameter Sub-Structures (Rules) ---
export interface IkedaHarmonicRatioCPMValue {
  rule_type: "harmonic_ratio_cpm";
  numerator: IkedaRuleValue<number>;
  denominator: IkedaRuleValue<number>;
}

export interface IkedaHarmonicRatioPitchValue {
  rule_type: "harmonic_ratio_pitch";
  numerator: IkedaRuleValue<number>;
  denominator: IkedaRuleValue<number>;
}

export interface IkedaEuclideanRhythmValue {
  rule_type: "euclidean_rhythm_trigger";
  pulses: IkedaRuleValue<number>;
  steps: IkedaRuleValue<number>;
  offset: IkedaRuleValue<number>;
}

// --- Main Parameters Structure ---
export interface IkedaParameters {
  // Pink Noise Layer
  pink_noise_active: { is_resolved: true; value: boolean; update_channel: "reliable" };
  pink_noise_volume: { is_resolved: true; value: number; update_channel: "streaming" };
  pink_noise_reverb_wet_dry: { is_resolved: true; value: number; update_channel: "reliable" };
  pink_noise_lfo_rate_rule: { is_resolved: false; value: IkedaHarmonicRatioCPMValue; update_channel: "reliable" };
  pink_noise_lfo_initial_phase_randomized: { is_resolved: true; value: boolean; update_channel: "reliable" };

  // Blips Layer
  blip_active: { is_resolved: true; value: boolean; update_channel: "reliable" };
  blip_base_f0_hz: { is_resolved: true; value: number; update_channel: "streaming" };
  blip_pitch_harmonic_ratio_rule: { is_resolved: false; value: IkedaHarmonicRatioPitchValue; update_channel: "reliable" };
  blip_duration_ms: { is_resolved: true; value: number; update_channel: "reliable" };
  blip_euclidean_rhythm_rule: { is_resolved: false; value: IkedaEuclideanRhythmValue; update_channel: "reliable" };
  blip_amplitude: { is_resolved: true; value: number; update_channel: "streaming" };
  blip_reverb_wet_dry: { is_resolved: true; value: number; update_channel: "reliable" };
  blip_timbre_source: { is_resolved: true; value: string; update_channel: "reliable" };

  // Clicks Layer
  click_active: { is_resolved: true; value: boolean; update_channel: "reliable" };
  click_timbre_source: { is_resolved: true; value: string; update_channel: "reliable" };
  click_length_ms: { is_resolved: true; value: number; update_channel: "reliable" };
  click_euclidean_rhythm_rule: { is_resolved: false; value: IkedaEuclideanRhythmValue; update_channel: "reliable" };
  click_reverb_wet_dry: { is_resolved: true; value: number; update_channel: "reliable" };

  // Snare Layer
  snare_active_after_reset: { is_resolved: true; value: boolean; update_channel: "reliable" };
  snare_timbre_source: { is_resolved: true; value: string; update_channel: "reliable" };
  snare_duration_beats: { is_resolved: true; value: number; update_channel: "reliable" }; // integer
  snare_amplitude: { is_resolved: true; value: number; update_channel: "reliable" };
  snare_reverb_wet_dry: { is_resolved: true; value: number; update_channel: "reliable" };
  snare_target_beat_in_cycle: { is_resolved: true; value: number; update_channel: "reliable" }; // 1-indexed integer
}

// --- Full Instrument State ---
export interface IkedaSynthState {
  instrument_id: typeof IKEDA_SYNTH_INSTRUMENT_ID;
  global_settings: IkedaGlobalSettings;
  parameters: IkedaParameters;
}