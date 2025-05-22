// fresh_webrtc_ds_template/hooks/useIkedaSynthState.ts

import { Signal, useSignal } from "@preact/signals";
import { useCallback, useMemo } from "preact/hooks";

import {
  IkedaSynthState,
  IKEDA_SYNTH_INSTRUMENT_ID,
} from "../types/instruments/ikeda_synth_types.ts";
import { DEFAULT_IKEDA_SYNTH_STATE } from "../types/instruments/ikeda_synth_defaults.ts";
import {
  deepMerge,
  getNestedProperty,
  setNestedProperty,
} from "../lib/utils/mergeUtils.ts";
import type { LoggerFn } from "./types.ts";

/**
 * Callback for notifying parent components of state changes
 */
export interface IkedaSynthStateChangeCallback {
  (newState: IkedaSynthState): void;
}

/**
 * Options for the useIkedaSynthState hook
 */
export interface UseIkedaSynthStateOptions {
  /**
   * Initial state to merge with defaults (optional)
   */
  initialState?: Partial<IkedaSynthState>;
  /**
   * Callback for state changes
   */
  onStateChange?: IkedaSynthStateChangeCallback;
}

/**
 * Return type for the useIkedaSynthState hook
 */
export interface UseIkedaSynthStateReturn {
  // State signals
  stateSignal: Signal<IkedaSynthState>;
  isActivatedSignal: Signal<boolean>;
  
  // Core state management
  initialize: (initialParams?: Partial<IkedaSynthState>) => void;
  reset: () => void;
  
  // Parameter updates
  updateParameter: (paramPath: string, value: any, applyTiming?: "immediate" | "next_phasor_reset") => void;
  updateParameters: (params: Record<string, any>, applyTiming?: "immediate" | "next_phasor_reset") => void;
  
  // WebRTC handlers
  handleSynthParamMessage: (param: string, value: any, applyTiming?: "immediate" | "next_phasor_reset") => void;
  handleSynthParamsFullMessage: (params: Record<string, any>, applyTiming?: "immediate" | "next_phasor_reset") => void;
  
  // Parameter queue management
  applyQueuedParameters: () => void;
  
  // State reporting
  getResolvedState: () => {
    params: Record<string, any>;
    globalSettings: Record<string, any>;
    dynamicInternalState: Record<string, any> | null;
  };
}

/**
 * A hook for managing the Ikeda synth instrument state
 * 
 * @param log - Logging function
 * @param options - Options for initialization and callbacks
 * @returns Interface for interacting with Ikeda synth state
 */
export default function useIkedaSynthState(
  log: LoggerFn,
  options: UseIkedaSynthStateOptions = {},
): UseIkedaSynthStateReturn {
  // Initialize with defaults merged with any provided initial state
  const initialState = useMemo(() => {
    return options.initialState ? 
      deepMerge(DEFAULT_IKEDA_SYNTH_STATE, options.initialState) : 
      DEFAULT_IKEDA_SYNTH_STATE;
  }, [options.initialState]);
  
  // State signals
  const stateSignal = useSignal<IkedaSynthState>(initialState);
  const isActivatedSignal = useSignal<boolean>(false);
  
  // Queue for parameters that should be applied on next phasor reset
  const queuedParameterUpdates = useSignal<Array<{ path: string; value: any }>>([]);

  // Initialize/reset methods
  const initialize = useCallback((initialParams?: Partial<IkedaSynthState>) => {
    log("[useIkedaSynthState] Initializing Ikeda synth state");
    const newState = initialParams ? 
      deepMerge(DEFAULT_IKEDA_SYNTH_STATE, initialParams) : 
      DEFAULT_IKEDA_SYNTH_STATE;
    
    stateSignal.value = newState;
    isActivatedSignal.value = true;
    queuedParameterUpdates.value = [];
    
    if (options.onStateChange) {
      options.onStateChange(newState);
    }
  }, [log, options.onStateChange]);
  
  const reset = useCallback(() => {
    log("[useIkedaSynthState] Resetting Ikeda synth state");
    stateSignal.value = DEFAULT_IKEDA_SYNTH_STATE;
    isActivatedSignal.value = false;
    queuedParameterUpdates.value = [];
    
    if (options.onStateChange) {
      options.onStateChange(DEFAULT_IKEDA_SYNTH_STATE);
    }
  }, [log, options.onStateChange]);

  // Parameter update method with dot notation support
  const updateParameter = useCallback((
    paramPath: string, 
    value: any, 
    applyTiming: "immediate" | "next_phasor_reset" = "immediate"
  ) => {
    if (!isActivatedSignal.value) {
      log("[useIkedaSynthState] Warning: Attempting to update parameter when not activated");
      return;
    }
    
    log(`[useIkedaSynthState] Updating parameter ${paramPath} with timing ${applyTiming}`);
    
    if (applyTiming === "next_phasor_reset") {
      // Queue the update for later application
      queuedParameterUpdates.value = [
        ...queuedParameterUpdates.value,
        { path: paramPath, value }
      ];
      log(`[useIkedaSynthState] Queued parameter update for ${paramPath}`);
      return;
    }
    
    // Get the current value to check if there's a change
    const currentValue = getNestedProperty(stateSignal.value, paramPath);
    if (JSON.stringify(currentValue) === JSON.stringify(value)) {
      log(`[useIkedaSynthState] Parameter ${paramPath} unchanged, skipping update`);
      return;
    }
    
    // Apply the update immediately
    const newState = setNestedProperty(stateSignal.value, paramPath, value);
    stateSignal.value = newState;
    
    if (options.onStateChange) {
      options.onStateChange(newState);
    }
  }, [log, isActivatedSignal, stateSignal, queuedParameterUpdates, options.onStateChange]);

  // Bulk parameter updates
  const updateParameters = useCallback((
    params: Record<string, any>, 
    applyTiming: "immediate" | "next_phasor_reset" = "immediate"
  ) => {
    if (!isActivatedSignal.value) {
      log("[useIkedaSynthState] Warning: Attempting to update parameters when not activated");
      return;
    }
    
    log(`[useIkedaSynthState] Updating multiple parameters with timing ${applyTiming}`);
    
    if (applyTiming === "next_phasor_reset") {
      // Queue all updates for later application
      const newQueue = [...queuedParameterUpdates.value];
      for (const [paramPath, value] of Object.entries(params)) {
        newQueue.push({ path: paramPath, value });
      }
      queuedParameterUpdates.value = newQueue;
      log(`[useIkedaSynthState] Queued ${Object.keys(params).length} parameter updates`);
      return;
    }
    
    // Apply all updates immediately
    let updatedState = { ...stateSignal.value };
    
    for (const [paramPath, value] of Object.entries(params)) {
      // Skip if no change
      const currentValue = getNestedProperty(updatedState, paramPath);
      if (JSON.stringify(currentValue) === JSON.stringify(value)) {
        continue;
      }
      
      updatedState = setNestedProperty(updatedState, paramPath, value);
    }
    
    stateSignal.value = updatedState;
    
    if (options.onStateChange) {
      options.onStateChange(updatedState);
    }
  }, [log, isActivatedSignal, stateSignal, queuedParameterUpdates, options.onStateChange]);

  // Apply queued parameter updates (typically called on phasor reset)
  const applyQueuedParameters = useCallback(() => {
    if (queuedParameterUpdates.value.length === 0) {
      return;
    }
    
    log(`[useIkedaSynthState] Applying ${queuedParameterUpdates.value.length} queued parameter updates`);
    
    let updatedState = { ...stateSignal.value };
    
    for (const { path, value } of queuedParameterUpdates.value) {
      updatedState = setNestedProperty(updatedState, path, value);
    }
    
    stateSignal.value = updatedState;
    queuedParameterUpdates.value = [];
    
    if (options.onStateChange) {
      options.onStateChange(updatedState);
    }
  }, [log, stateSignal, queuedParameterUpdates, options.onStateChange]);

  // WebRTC message handlers
  const handleSynthParamMessage = useCallback((
    param: string, 
    value: any, 
    applyTiming: "immediate" | "next_phasor_reset" = "immediate"
  ) => {
    log(`[useIkedaSynthState] Handling synth_param message for ${param}`);
    updateParameter(param, value, applyTiming);
  }, [log, updateParameter]);

  const handleSynthParamsFullMessage = useCallback((
    params: Record<string, any>, 
    applyTiming: "immediate" | "next_phasor_reset" = "immediate"
  ) => {
    log(`[useIkedaSynthState] Handling synth_params_full message with ${Object.keys(params).length} parameters`);
    updateParameters(params, applyTiming);
  }, [log, updateParameters]);

  // Get resolved state for reporting
  const getResolvedState = useCallback(() => {
    if (!isActivatedSignal.value) {
      log("[useIkedaSynthState] Warning: Getting resolved state when not activated");
      return {
        params: {},
        globalSettings: {},
        dynamicInternalState: null
      };
    }
    
    // Extract params and global settings with resolved values
    const params: Record<string, any> = {};
    const globalSettings: Record<string, any> = {};
    
    // Extract parameters
    for (const [paramKey, paramObj] of Object.entries(stateSignal.value.parameters)) {
      if ('value' in paramObj) {
        params[paramKey] = paramObj.value;
      }
    }
    
    // Extract global settings
    for (const [settingKey, settingObj] of Object.entries(stateSignal.value.global_settings)) {
      if ('value' in settingObj) {
        globalSettings[settingKey] = settingObj.value;
      }
    }
    
    return {
      params,
      globalSettings,
      dynamicInternalState: {
        queued_parameter_count: queuedParameterUpdates.value.length
      }
    };
  }, [log, isActivatedSignal, stateSignal, queuedParameterUpdates]);

  // Return the hook interface
  return {
    stateSignal,
    isActivatedSignal,
    initialize,
    reset,
    updateParameter,
    updateParameters,
    handleSynthParamMessage,
    handleSynthParamsFullMessage,
    applyQueuedParameters,
    getResolvedState
  };
}