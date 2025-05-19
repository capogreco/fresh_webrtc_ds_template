// Controller mode types and constants
export enum ControllerMode {
  DEFAULT = "default",
  IKEDA = "ikeda", // New Ikeda Mode (MVP)
  DRONE = "drone", // Future mode
  GRID = "grid", // Future mode
}

// Known controller modes
export const KNOWN_CONTROLLER_MODES = {
  DEFAULT: ControllerMode.DEFAULT,
  IKEDA: ControllerMode.IKEDA,
  DRONE: ControllerMode.DRONE,
  GRID: ControllerMode.GRID,
} as const;

// Map MIDI device IDs to controller modes (for future use with useMidiDeviceManager)
export const MIDI_DEVICE_TO_MODE_MAPPING: Record<string, ControllerMode> = {
  // Map specific MIDI device IDs to modes
  // Examples (to be updated with actual device IDs when implemented):
  "generic-midi-controller": ControllerMode.DEFAULT,
  "ikeda-controller": ControllerMode.IKEDA,
  "drone-controller": ControllerMode.DRONE,
  "grid-controller": ControllerMode.GRID,
};

// Get the controller mode for a device ID, falling back to default mode
export function getControllerModeForDevice(
  deviceId: string | null,
): ControllerMode {
  if (!deviceId) return ControllerMode.DEFAULT;
  return MIDI_DEVICE_TO_MODE_MAPPING[deviceId] || ControllerMode.DEFAULT;
}