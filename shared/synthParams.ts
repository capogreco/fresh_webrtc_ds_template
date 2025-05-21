export type SynthParamType = "number" | "enum" | "boolean" | "note" | "string";

export interface SynthParamDescriptor {
  id: string; // Unique identifier, used for messaging and mapping
  label: string; // User-friendly label for UI
  type: SynthParamType; // Type of parameter
  min?: number; // Minimum value for 'number' type
  max?: number; // Maximum value for 'number' type
  step?: number; // Step value for 'number' type sliders/inputs
  defaultValue: number | string | boolean; // Default value
  enumValues?: readonly string[]; // Possible values for 'enum' type
  unit?: string; // Optional unit display (e.g., "Hz", "ms", "dB", "¢")
  description?: string; // Optional longer description for tooltips
}

export const SYNTH_PARAMS: readonly SynthParamDescriptor[] = [
  {
    id: "frequency",
    label: "Frequency",
    type: "number",
    min: 20,
    max: 20000,
    step: 0.1,
    defaultValue: 440,
    unit: "Hz",
    description: "Main oscillator frequency.",
  },
  {
    id: "waveform",
    label: "Waveform",
    type: "enum",
    enumValues: ["sine", "square", "sawtooth", "triangle"] as const,
    defaultValue: "sine",
    description: "Main oscillator waveform shape.",
  },
  {
    id: "volume",
    label: "Volume",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.75,
    unit: "%", // Often displayed as percentage
    description: "Overall output gain.",
  },
  {
    id: "attack",
    label: "Attack",
    type: "number",
    min: 0.001,
    max: 5,
    step: 0.001,
    defaultValue: 0.01,
    unit: "s",
    description: "Amplitude envelope attack time.",
  },
  {
    id: "release",
    label: "Release",
    type: "number",
    min: 0.001,
    max: 5,
    step: 0.001,
    defaultValue: 0.1,
    unit: "s",
    description: "Amplitude envelope release time.",
  },
  {
    id: "filterCutoff",
    label: "Filter Cutoff",
    type: "number",
    min: 20,
    max: 20000,
    step: 1,
    defaultValue: 8000,
    unit: "Hz",
    description: "Cutoff frequency of the low-pass filter.",
  },
  {
    id: "filterResonance",
    label: "Filter Q",
    type: "number",
    min: 0.1,
    max: 30,
    step: 0.1,
    defaultValue: 1,
    unit: "Q",
    description: "Resonance (Q factor) of the low-pass filter.",
  },
  {
    id: "detune",
    label: "Detune",
    type: "number",
    min: -1200,
    max: 1200,
    step: 1,
    defaultValue: 0,
    unit: "¢", // Cents
    description: "Fine-tuning of the main oscillator frequency in cents.",
  },
  {
    id: "portamentoTime",
    label: "Portamento",
    type: "number",
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: 0,
    unit: "s",
    description: "Glide time between notes. 0 for no portamento.",
  },
  {
    id: "vibratoRate",
    label: "Vibrato Rate",
    type: "number",
    min: 0.1,
    max: 20,
    step: 0.1,
    defaultValue: 5,
    unit: "Hz",
    description: "Speed of the pitch vibrato.",
  },
  {
    id: "vibratoWidth",
    label: "Vibrato Width",
    type: "number",
    min: 0,
    max: 200, // Max 2 semitones
    step: 1,
    defaultValue: 0,
    unit: "¢", // Cents
    description: "Depth/amount of the pitch vibrato in cents.",
  },
  // Example of a boolean parameter
  // {
  //   id: "filterEnable",
  //   label: "Filter Enable",
  //   type: "boolean",
  //   defaultValue: true,
  //   description: "Toggles the filter on or off."
  // },
  // Example of a note parameter (might require special UI handling)
  // {
  //   id: "currentNote",
  //   label: "Current Note",
  //   type: "note", // This type is conceptual, UI would need custom handling
  //   defaultValue: "A4",
  //   description: "Represents the currently playing note name."
  // }
];

// Helper function to get a parameter descriptor by its ID
export function getSynthParamDescriptor(
  id: string,
): SynthParamDescriptor | undefined {
  return SYNTH_PARAMS.find((p) => p.id === id);
}
