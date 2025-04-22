/**
 * Main entry point for the synth library
 * Export all types, constants, defaults, and utils
 */

// Re-export everything for easy imports
export * from "./types.ts";
export * from "./constants.ts";
export * from "./defaults.ts";
export * from "./utils.ts";

// Also provide the default params as the default export
export { DEFAULT_SYNTH_PARAMS as default } from "./defaults.ts";