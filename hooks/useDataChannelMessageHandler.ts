// fresh_webrtc_ds_template/hooks/useDataChannelMessageHandler.ts

import type { AudioEngineControls, LoggerFn } from "./types.ts";
import type { UseIkedaSynthStateReturn } from "./useIkedaSynthState.ts";

/**
 * Defines callbacks for actions the message handler might need to trigger externally,
 * primarily for sending messages back to the Ctrl Client.
 */
export interface ChannelOperationCallbacks {
  sendDataToCtrl: (messageJSON: string, channelLabel?: string) => boolean; 
}

/**
 * Defines the return structure of the useDataChannelMessageHandler hook.
 */
export interface UseDataChannelMessageHandlerReturn {
  handleDataMessage: (event: MessageEvent, channel: RTCDataChannel, prefix?: string) => void;
}

/**
 * Type alias for the handleDataMessage function to allow easier import in other files
 */
export type DataMessageHandlerFn = (event: MessageEvent, channel: RTCDataChannel, prefix?: string) => void;

// --------------------------------------------------------------------------------
// Hook Implementation
// --------------------------------------------------------------------------------

/**
 * A Preact custom hook that provides a comprehensive handler for incoming WebRTC
 * data channel messages from a Ctrl Client, based on the defined system specification.
 *
 * @param audioEngine - An instance conforming to AudioEngineControls, providing access to audio processing.
 * @param ikedaSynthState - An instance of useIkedaSynthState hook return value for Ikeda synth state management.
 * @param addLog - A logging function.
 * @param callbacks - An object containing callback functions, primarily `sendDataToCtrl`.
 * @returns An object containing the `handleDataMessage` function.
 */
export default function useDataChannelMessageHandler(
  audioEngine: AudioEngineControls,
  ikedaSynthState: UseIkedaSynthStateReturn,
  addLog: LoggerFn,
  callbacks: ChannelOperationCallbacks,
): UseDataChannelMessageHandlerReturn {

  const handleDataMessage = (
    event: MessageEvent,
    channel: RTCDataChannel,
    prefix: string = "",
  ): void => {
    const logPrefix = prefix ? `[${prefix}][${channel.label}]` : `[${channel.label}]`;
    const rawDataForLog = typeof event.data === 'string' ? event.data.substring(0, 250) : '<binary_data>';
    addLog(`${logPrefix} Received message: ${rawDataForLog}`);

    if (typeof event.data !== 'string') {
      addLog(`${logPrefix} Received non-string data type (${typeof event.data}), ignoring.`);
      return;
    }
    const messageDataString = event.data as string;

    try {
      const message = JSON.parse(messageDataString);
      addLog(`${logPrefix} Parsed JSON. Type: ${message.type}`);

      if (channel.label === "streaming_updates") { 
        const discreteTypesOnStreaming = [
          "set_active_instrument", "instrument_command", "play", "stop",
          "set_tempo", "synchronise_phasors", "note_on", "note_off",
          "set_parameter_portamento", "save_state_to_bank", "load_state_from_bank",
          "request_current_resolved_state", "instrument_definition", "app_ping"
        ];
        if (discreteTypesOnStreaming.includes(message.type)) {
            addLog(`${logPrefix} WARNING: Received message type '${message.type}' on the streaming_updates channel. Processing, but this type is usually expected on reliable_control.`);
        }
      }

      switch (message.type) {
        case "set_active_instrument":
          if (typeof message.instrument_id === 'string') {
            // For Ikeda synth, initialize it through the dedicated hook
            if (message.instrument_id === "ikeda_synth_v1") {
              ikedaSynthState.initialize(message.initial_params);
              audioEngine.activateInstrument(message.instrument_id, message.initial_params);
            } else {
              // Fallback to the regular audio engine for other instruments
              audioEngine.activateInstrument(message.instrument_id, message.initial_params);
            }
          } else {
            addLog(`${logPrefix} Invalid 'set_active_instrument': missing instrument_id. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing instrument_id for set_active_instrument" }));
          }
          break;

        case "synth_param":
          if (message.param && message.value !== undefined) {
            const applyTiming = message.apply_timing === "next_phasor_reset" ? "next_phasor_reset" : "immediate";
            
            // Check if this is an Ikeda synth parameter
            if (ikedaSynthState.isActivatedSignal.value && message.param.startsWith("parameters.") || message.param.startsWith("global_settings.")) {
              // Use the Ikeda-specific handler with dot notation support
              ikedaSynthState.handleSynthParamMessage(message.param, message.value, applyTiming);
            } else {
              // Fallback to the regular audio engine parameter update
              audioEngine.updateSynthParam(message.param, message.value, applyTiming);
            }
          } else {
            addLog(`${logPrefix} Invalid 'synth_param': missing param or value. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing param or value for synth_param" }));
          }
          break;

        case "synth_params_full":
          if (message.params && typeof message.params === 'object') {
            const applyTiming = message.apply_timing === "next_phasor_reset" ? "next_phasor_reset" : "immediate";
            
            // Separate Ikeda and non-Ikeda parameters
            const ikedaParams: Record<string, any> = {};
            const regularParams: Record<string, any> = {};
            
            for (const [paramId, value] of Object.entries(message.params)) {
              if (value !== undefined) {
                if (ikedaSynthState.isActivatedSignal.value && (paramId.startsWith("parameters.") || paramId.startsWith("global_settings."))) {
                  ikedaParams[paramId] = value;
                } else {
                  regularParams[paramId] = value;
                }
              }
            }
            
            // Process Ikeda parameters in bulk if there are any
            if (Object.keys(ikedaParams).length > 0) {
              ikedaSynthState.handleSynthParamsFullMessage(ikedaParams, applyTiming);
            }
            
            // Process regular parameters individually (maintaining backward compatibility)
            for (const [paramId, value] of Object.entries(regularParams)) {
              audioEngine.updateSynthParam(paramId, value, applyTiming);
            }
          } else {
            addLog(`${logPrefix} Invalid 'synth_params_full': missing or non-object params. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing or non-object params for synth_params_full" }));
          }
          break;

        case "instrument_command":
          if (typeof message.name === 'string') {
            audioEngine.executeInstrumentCommand(message.name, message.args);
          } else {
            addLog(`${logPrefix} Invalid 'instrument_command': missing command name. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing name for instrument_command" }));
          }
          break;

        case "play":
          audioEngine.playPhasor();
          break;

        case "stop":
          audioEngine.stopPhasor();
          break;

        case "set_tempo":
          if (typeof message.cpm === 'number' && message.cpm > 0) {
            audioEngine.setTempo(message.cpm);
          } else {
            addLog(`${logPrefix} Invalid 'set_tempo': missing or non-positive cpm. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing or non-positive cpm for set_tempo" }));
          }
          break;

        case "synchronise_phasors":
          audioEngine.synchronisePhasor();
          audioEngine.applyQueuedParamsNow();
          
          // Also apply any queued Ikeda parameters
          ikedaSynthState.applyQueuedParameters();
          break;

        case "note_on":
          if (typeof message.pitch === 'number') {
            audioEngine.handleExternalNoteOn(message);
          } else {
            addLog(`${logPrefix} Invalid 'note_on': missing pitch. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing pitch for note_on" }));
          }
          break;

        case "note_off":
          audioEngine.handleExternalNoteOff(message);
          break;

        case "set_parameter_portamento":
          if (typeof message.duration_ms === 'number' && message.duration_ms >= 0) {
            audioEngine.setParameterPortamento(message.duration_ms, message.curve);
          } else {
            addLog(`${logPrefix} Invalid 'set_parameter_portamento': missing or negative duration_ms. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing or negative duration_ms for set_parameter_portamento" }));
          }
          break;

        case "save_state_to_bank":
          if (typeof message.bank_index === 'number') {
            const result = audioEngine.saveStateToBank(message.bank_index);
            callbacks.sendDataToCtrl(JSON.stringify({
              type: "save_state_to_bank_ack",
              bank_index: message.bank_index,
              status: result.success ? "success" : "failure",
              instrument_id: result.instrumentId || audioEngine.activeInstrumentIdSignal.value || "unknown"
            }));
          } else {
            addLog(`${logPrefix} Invalid 'save_state_to_bank': missing bank_index. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing bank_index for save_state_to_bank" }));
          }
          break;

        case "load_state_from_bank":
          if (typeof message.bank_index === 'number') {
            const result = audioEngine.loadStateFromBank(message.bank_index);
            callbacks.sendDataToCtrl(JSON.stringify({
              type: "load_state_from_bank_ack",
              bank_index: message.bank_index,
              status: result.success ? "success" : (result.error || "error"),
              instrument_id: result.instrumentId || audioEngine.activeInstrumentIdSignal.value || "unknown"
            }));
          } else {
            addLog(`${logPrefix} Invalid 'load_state_from_bank': missing bank_index. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing bank_index for load_state_from_bank" }));
          }
          break;

        case "request_current_resolved_state":
          addLog(`${logPrefix} Received 'request_current_resolved_state'. Constructing and sending report.`);
          if (typeof audioEngine.getCurrentResolvedState === 'function') {
            let stateReport: {
              params: Record<string, any>;
              globalSettings: Record<string, any>;
              dynamicInternalState: Record<string, any> | null;
            };
            
            // Use Ikeda-specific state if active
            if (ikedaSynthState.isActivatedSignal.value) {
              stateReport = ikedaSynthState.getResolvedState();
            } else {
              stateReport = audioEngine.getCurrentResolvedState();
            }
            
            callbacks.sendDataToCtrl(JSON.stringify({
              type: "current_resolved_state_report",
              active_instrument_id: audioEngine.activeInstrumentIdSignal.value || "unknown",
              is_playing: audioEngine.isPlayingSignal.value,
              is_globally_muted: audioEngine.isGloballyMutedSignal.value,
              audio_context_state: audioEngine.audioContextStateSignal.value,
              params: stateReport.params,
              global_settings: stateReport.globalSettings,
              dynamic_internal_state: stateReport.dynamicInternalState
            }));
          } else {
            const errorMsg = "audioEngine does not implement getCurrentResolvedState. Cannot send report.";
            addLog(`${logPrefix} ${errorMsg}`);
            callbacks.sendDataToCtrl(JSON.stringify({
              type: "error_report",
              original_message_type: message.type,
              error_code: "not_supported",
              message: errorMsg
            }));
          }
          break;
        
        case "instrument_definition":
          if (message.instrument_id) {
            addLog(`${logPrefix} Received 'instrument_definition' for ${message.instrument_id}. This message is for synth recovery/update if a definition was missing. Core synth logic should handle processing/caching. It might trigger re-activation of the instrument.`);
            // Example of what core synth logic might do:
            // globalStore.cacheInstrumentDefinition(message);
            // audioEngine.activateInstrument(message.instrument_id, message.initial_params_from_definition_if_any); 
          } else {
            addLog(`${logPrefix} Invalid 'instrument_definition': missing instrument_id. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing instrument_id for instrument_definition" }));
          }
          break;

        case "app_ping":
          if (typeof message.timestamp === 'number') {
            callbacks.sendDataToCtrl(JSON.stringify({
              type: "app_pong",
              original_timestamp: message.timestamp
            }), channel.label); 
            addLog(`${logPrefix} Responded to app_ping with app_pong on ${channel.label}.`);
          } else {
            addLog(`${logPrefix} Invalid 'app_ping': missing or invalid timestamp. Data: ${rawDataForLog}`);
            callbacks.sendDataToCtrl(JSON.stringify({ type: "error_report", original_message_type: message.type, error_code: "invalid_payload", message: "Missing or invalid timestamp for app_ping" }));
          }
          break;

        default:
          const unknownType = message.type || "undefined_or_missing_type_field";
          addLog(`${logPrefix} Unknown JSON message type: '${unknownType}'. Full message snippet: ${messageDataString.substring(0, 200)}`);
          callbacks.sendDataToCtrl(JSON.stringify({
             type: "error_report",
             original_message_type: unknownType,
             error_code: "unknown_message_type",
             message: `Synth client received unknown JSON message type: ${unknownType}`
          }));
          break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`${logPrefix} Error processing message (JSON parsing or general handling): ${errorMsg}. Raw data: ${messageDataString.substring(0,100)}`);
      console.error(`${logPrefix} Error processing message:`, error, `Raw data: ${messageDataString}`);
      callbacks.sendDataToCtrl(JSON.stringify({
         type: "error_report",
         error_code: "message_processing_error",
         message: `Error processing message: ${errorMsg}. Raw data snippet: ${messageDataString.substring(0,100)}`
      }));
    }
  };

  return {
    handleDataMessage,
  };
}