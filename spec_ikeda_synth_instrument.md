# `ikeda_synth` Instrument Specification

**Version:** 1.0
**Date:** 2024-07-30

This document describes the `ikeda_synth` instrument definition, intended for use within the Distributed Synthesis system. It details the structure, parameters, and expected behavior of Synth Clients when this instrument is active.

## 1. Overview

The `ikeda_synth` instrument is inspired by the sonic aesthetics of artists like Ryoji Ikeda, focusing on layers of precisely controlled noise, sine-based "blips," and impulsive "clicks." It features generative rhythmic patterns and global synchronization commands to move between states of order and complexity.

*   **`instrument_id`**: `"ikeda_synth_v1"` (example, can be versioned)
*   **`synth_engine.type`**: `"ikeda_engine_v1"` (example, a unique identifier for the Synth Client's engine implementation)

## 2. `global_settings`

These settings apply to the overall behavior of the `ikeda_synth` instrument on a Synth Client.

1.  **`active`**:
    *   `is_resolved`: `true`
    *   `value`: `boolean` (Master on/off for this instrument on the Synth Client)
    *   `update_channel`: `"reliable"`
2.  **`tempo_cpm`**: (Master tempo in Cycles Per Minute)
    *   `is_resolved`: `true`
    *   `value`: `number`
    *   `update_channel`: `"streaming"`
3.  **`beats_per_global_cycle`**: (Defines "crotchet" beats within one `tempo_cpm` cycle, e.g., 4. Used for snare timing.)
    *   `is_resolved`: `true`
    *   `value`: `integer` (e.g., 4)
    *   `update_channel`: `"reliable"`

## 3. `parameters`

This flat list of parameters configures the various layers and components of the `ikeda_synth_engine_v1`.

### 3.1. Pink Noise Layer

Controls a layer of pink noise with sinusoidal amplitude modulation.

4.  **`pink_noise_active`**:
    *   `is_resolved`: `true`
    *   `value`: `boolean`
    *   `update_channel`: `"reliable"`
    *   *Description:* Enables or disables the pink noise layer.
5.  **`pink_noise_volume`**:
    *   `is_resolved`: `true`
    *   `value`: `number` (0.0 to 1.0)
    *   `update_channel`: `"streaming"`
    *   *Description:* Peak amplitude of the LFO controlling the pink noise level.
6.  **`pink_noise_reverb_wet_dry`**:
    *   `is_resolved`: `true`
    *   `value`: `number` (0.0 to 1.0)
    *   `update_channel`: `"reliable"`
    *   *Description:* Reverb mix for the pink noise layer.
7.  **`pink_noise_lfo_rate_rule`**:
    *   `is_resolved`: `false`
    *   `value` (object):
        ```json
        {
          "rule_type": "harmonic_ratio_cpm",
          "numerator": {
            "values": "number[]",
            "selection_mode": "\"static\" | \"random\" | \"shuffle\" | \"ascending\" | \"descending\""
          },
          "denominator": {
            "values": "number[]",
            "selection_mode": "\"static\" | \"random\" | \"shuffle\" | \"ascending\" | \"descending\""
          }
        }
        ```
    *   *Description:* Rule for the Synth Client to determine the LFO rate for amplitude modulation. Numerator (N) and Denominator (D) are selected based on `selection_mode`. The rate `(N/D) * (tempo_cpm / 60)` Hz is calculated. N and D are re-evaluated per completion of one LFO cycle if their `selection_mode` is dynamic (random, shuffle, etc.). `static` mode picks one N/D randomly once and keeps it until the rule changes.
8.  **`pink_noise_lfo_shape`**: (Optional)
    *   `is_resolved`: `true`
    *   `value`: `"sine" | "triangle" | "sawtooth" | "square"` (defaults to `"sine"`)
    *   `update_channel`: `"reliable"`
    *   *Description:* Waveform shape for the amplitude LFO.
9.  **`pink_noise_lfo_initial_phase_randomized`**: (Optional)
    *   `is_resolved`: `true`
    *   `value`: `boolean` (defaults to `true`)
    *   `update_channel`: `"reliable"`
    *   *Description:* If `true`, after a `synchronise_phases` command, each client randomizes its LFO's starting phase. If `false` (and LFO rates are identical across clients), LFOs will be phase-locked.

### 3.2. Blips Layer

Controls a layer of pitched, short sonic events ("blips") triggered by a Euclidean rhythm.

10. **`blip_active`**:
    *   `is_resolved`: `true`; `value`: `boolean`; `update_channel`: `"reliable"`
    *   *Description:* Enables or disables the blips layer.
11. **`blip_base_f0_hz`**:
    *   `is_resolved`: `true`; `value`: `number`; `update_channel`: `"streaming"`
    *   *Description:* Base fundamental frequency used for calculating individual blip pitches.
12. **`blip_pitch_harmonic_ratio_rule`**:
    *   `is_resolved`: `false`
    *   `value` (object):
        ```json
        {
          "rule_type": "harmonic_ratio_pitch",
          "numerator": { "values": "number[]", "selection_mode": "..." },
          "denominator": { "values": "number[]", "selection_mode": "..." }
        }
        ```
    *   *Description:* Rule for the Synth Client to determine a pitch multiplier `(N/D)` for `blip_base_f0_hz`. N and D are re-evaluated for each triggered blip based on their `selection_mode`.
13. **`blip_duration_ms`**:
    *   `is_resolved`: `true`; `value`: `number`; `update_channel`: `"reliable"`
    *   *Description:* Duration of each blip event.
14. **`blip_euclidean_rhythm_rule`**:
    *   `is_resolved`: `false`
    *   `value` (object):
        ```json
        {
          "rule_type": "euclidean_rhythm_trigger",
          "pulses": { "values": "number[]", "selection_mode": "..." },
          "steps": { "values": "number[]", "selection_mode": "..." },
          "offset": { "values": "number[]", "selection_mode": "..." }
        }
        ```
    *   *Description:* Rule for generating blip triggers. `pulses` (k), `steps` (n), and `offset` (r) define the E(k,n,r) pattern. The `n` steps subdivide one master cycle period (derived from `global_settings.tempo_cpm`). k, n, and r are re-evaluated per completion of one full E(k,n) pattern cycle based on their `selection_mode`.
15. **`blip_amplitude`**:
    *   `is_resolved`: `true`; `value`: `number` (0.0 to 1.0); `update_channel`: `"streaming"`
    *   *Description:* Amplitude for each blip.
16. **`blip_reverb_wet_dry`**:
    *   `is_resolved`: `true`; `value`: `number` (0.0 to 1.0); `update_channel`: `"reliable"`
    *   *Description:* Reverb mix for the blips layer.
17. **`blip_timbre_source`**:
    *   `is_resolved`: `true`; `value`: `string` (e.g., `"sine_env"`, `"short_filtered_pulse"`)
    *   `update_channel`: `"reliable"`
    *   *Description:* Defines the basic sound source or synthesis method for a blip.

### 3.3. Clicks Layer

Controls a layer of unpitched, impulsive "clicks" triggered by a Euclidean rhythm.

18. **`click_active`**:
    *   `is_resolved`: `true`; `value`: `boolean`; `update_channel`: `"reliable"`
    *   *Description:* Enables or disables the clicks layer.
19. **`click_timbre_source`**:
    *   `is_resolved`: `true`; `value`: `string` (e.g., `"digital_impulse"`, `"micro_noise_burst_preset"`)
    *   `update_channel`: `"reliable"`
    *   *Description:* Defines the basic sound of a click. Synth Client engine handles volume (e.g., max for impulse, preset for noise burst).
20. **`click_length_ms`**:
    *   `is_resolved`: `true`; `value`: `number` (e.g., 0.1 to 5.0 ms)
    *   `update_channel`: `"reliable"`
    *   *Description:* Duration of each click. Very short values approximate an impulse.
21. **`click_euclidean_rhythm_rule`**:
    *   `is_resolved`: `false`
    *   `value` (object): (Same structure as `blip_euclidean_rhythm_rule.value`)
    *   *Description:* Rule for generating click triggers. `pulses` (k), `steps` (n), and `offset` (r) define the E(k,n,r) pattern. The `n` steps subdivide one master cycle period. k, n, and r are re-evaluated per completion of one full E(k,n) pattern cycle based on their `selection_mode`.
22. **`click_reverb_wet_dry`**:
    *   `is_resolved`: `true`; `value`: `number` (0.0 to 1.0); `update_channel`: `"reliable"`
    *   *Description:* Reverb mix for the clicks layer.

### 3.4. White Noise Snare Layer (Conditional Event)

Parameters defining the sound of the special snare event, which is triggered conditionally after a `synchronise_phases` command.

23. **`snare_active_after_reset`**:
    *   `is_resolved`: `true`; `value`: `boolean`; `update_channel`: `"reliable"`
    *   *Description:* If `true`, the snare logic is enabled following a `synchronise_phases` command.
24. **`snare_timbre_source`**:
    *   `is_resolved`: `true`; `value`: `string` (e.g., `"white_noise_rectangular_env"`)
    *   `update_channel`: `"reliable"`
    *   *Description:* Defines the sound of the snare.
25. **`snare_duration_beats`**:
    *   `is_resolved`: `true`; `value`: `integer` (e.g., `1`)
    *   `update_channel`: `"reliable"`
    *   *Description:* Duration of the snare in terms of "crotchet" beats defined by `global_settings.beats_per_global_cycle` relative to `global_settings.tempo_cpm`.
26. **`snare_amplitude`**:
    *   `is_resolved`: `true`; `value`: `number` (0.0 to 1.0)
    *   `update_channel`: `"reliable"`
    *   *Description:* Amplitude of the snare event.
27. **`snare_reverb_wet_dry`**:
    *   `is_resolved`: `true`; `value`: `number` (0.0 to 1.0); `update_channel`: `"reliable"`
    *   *Description:* Reverb mix for the snare event.
28. **`snare_target_beat_in_cycle`**:
    *   `is_resolved`: `true`; `value`: `integer` (1-indexed, e.g., `3` for the 3rd beat)
    *   `update_channel`: `"reliable"`
    *   *Description:* Specifies which beat within the master cycle (after a `synchronise_phases` event) the armed Synth Client should play the snare on.

## 4. Special `instrument_command`s for `ikeda_synth`

These commands are sent from the `ctrl` Client to Synth Clients running the `ikeda_synth` instrument via the `reliable_control` data channel. The message `type` would be `"instrument_command"`, and the `payload` would contain `instrument_id: "ikeda_synth_v1"` (or current version) and `command_name`.

1.  **`command_name: "synchronise_phases"`**
    *   **Action on Synth Client:**
        *   Resets the internal phase of the `pink_noise_lfo_rate_rule`'s LFO to its starting point. Re-evaluates N/D for the LFO rate based on `selection_mode`.
        *   Re-evaluates k, n, r for `blip_euclidean_rhythm_rule` based on `selection_mode`. Resets current step of the blip pattern to 0.
        *   Re-evaluates k, n, r for `click_euclidean_rhythm_rule` based on `selection_mode`. Resets current step of the click pattern to 0.
        *   Effectively aligns all layers and all clients to a common T0 for the start of their patterns and modulations.
        *   Enables the condition for a subsequent `arm_snare_for_target_beat` command to be effective for the next occurring target beat.

2.  **`command_name: "desynchronise_phases"`**
    *   **Action on Synth Client:**
        *   Calculates `master_cycle_period_ms = (60 / global_settings.tempo_cpm.value) * 1000`.
        *   Generates a single random `wait_ms = Math.random() * master_cycle_period_ms`.
        *   The entire `ikeda_synth_engine` processing (all layers) pauses for `wait_ms`, then resumes from where it left off. This shifts the phase of the client's entire output relative to other clients.

3.  **`command_name: "arm_snare_for_target_beat"`**
    *   **Targeting:** This command is intended to be sent by the `ctrl` Client to *one specific* Synth Client after a `synchronise_phases` command has been broadcast.
    *   **Action on Targeted Synth Client:**
        *   The client is "armed." If `parameters.snare_active_after_reset` is `true`, it will play the snare sound (defined by `snare_*` parameters) when its internal clock reaches the `parameters.snare_target_beat_in_cycle` of the *first full master cycle that began at or after the last `synchronise_phases` event was processed*.
        *   The "armed" state is consumed after one snare playback or after the target beat in that specific cycle passes.

## 5. Synth Client Engine Notes

The Synth Client's `ikeda_engine_v1` implementation must:
*   Correctly parse all parameters and rule objects.
*   Implement the logic for `harmonic_ratio_cpm` and `harmonic_ratio_pitch` rule types, including `selection_mode` behaviors and re-evaluation triggers.
*   Implement the logic for `euclidean_rhythm_trigger`, including `selection_mode` for k,n,r, clocking by `global_settings.tempo_cpm`, and re-evaluation per pattern cycle.
*   Manage audio synthesis for pink noise, blips (based on `blip_timbre_source`), and clicks (based on `click_timbre_source`, including implicit volume logic).
*   Handle the `synchronise_phases`, `desynchronise_phases`, and snare arming/triggering logic.
*   Manage a mono audio output chain, including per-layer reverb sends if applicable.
*   Process parameter updates received on both `reliable_control` and `streaming_updates` data channels, respecting the `update_channel` flag and timestamping for streamed updates.
```