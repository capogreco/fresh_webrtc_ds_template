import { type SynthParamDescriptor } from "../../synthParams.ts"; // Path to global SynthParamDescriptor type

export const IKEDA_MODE_MVP_PARAMS: readonly SynthParamDescriptor[] = [
  {
    id: "ikedaGlobalOnOff", // Renamed from defaultGlobalOnOff
    label: "Ikeda Mode Active",
    type: "boolean",
    defaultValue: false,
    description: "Master play/stop for Ikeda Mode.",
  },
  {
    id: "ikedaGlobalMasterVolume", // Renamed
    label: "Master Volume (Ikeda)", // This will be handled by AudioEngineService's global gain
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.5,
    unit: "%",
    description:
      "Overall volume for Ikeda Mode (controlled by AudioEngineService master gain).",
  },
  {
    id: "ikedaPinkNoiseLevel", // Renamed
    label: "Pink Noise Level",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.15, // Default level for pink noise.
    unit: "%",
    description: "Level of the continuous pink noise in Ikeda Mode.",
  },
  {
    id: "ikedaVolumeCheckLevel",
    label: "Volume Check Level",
    type: "number",
    min: 0.01,
    max: 0.5,
    step: 0.01,
    defaultValue: 0.15,
    unit: "%",
    description: "Fixed gain for pink noise during initial volume check.",
  },
  {
    id: "ikedaGlobalReverbAmount",
    label: "Reverb Amount (Ikeda)",
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.0,
    unit: "%",
    description:
      "Global reverb amount for Ikeda Mode (controlled by AudioEngineService's reverb).",
  },
];
