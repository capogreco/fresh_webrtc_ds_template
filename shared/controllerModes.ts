// Controller mode types and constants
export enum ControllerMode {
  IKEDA = "ikeda", // Main mode (MVP)
  DRONE = "drone", // Future mode
  GRID = "grid", // Future mode
  SYNTH_MODE = "synth", // Legacy compatibility
}

// Known controller modes
export const KNOWN_CONTROLLER_MODES = {
  IKEDA: ControllerMode.IKEDA,
  DRONE: ControllerMode.DRONE,
  GRID: ControllerMode.GRID,
  SYNTH_MODE: ControllerMode.SYNTH_MODE,
} as const;

// Map MIDI device IDs to controller modes (for future use with useMidiDeviceManager)
export const MIDI_DEVICE_TO_MODE_MAPPING: Record<string, ControllerMode> = {
  // Map specific MIDI device IDs to modes
  // Examples (to be updated with actual device IDs when implemented):
  "generic-midi-controller": ControllerMode.IKEDA,
  "ikeda-controller": ControllerMode.IKEDA,
  "drone-controller": ControllerMode.DRONE,
  "grid-controller": ControllerMode.GRID,
};

// Get the controller mode for a device ID, falling back to IKEDA mode
export function getControllerModeForDevice(
  deviceId: string | null,
): ControllerMode {
  if (!deviceId) return ControllerMode.IKEDA;
  return MIDI_DEVICE_TO_MODE_MAPPING[deviceId] || ControllerMode.IKEDA;
}
