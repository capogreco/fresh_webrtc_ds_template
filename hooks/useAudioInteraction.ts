// fresh_webrtc_ds_template/hooks/useAudioInteraction.ts

import type { Signal } from "@preact/signals";

// Minimal interface to define the expected shape of the audioEngine argument.
// This should align with the relevant parts of the actual useAudioEngine hook's return type.
export interface AudioEngineControls {
  frequency: Signal<number>;
  waveform: Signal<string>;
  volume: Signal<number>;
  isNoteActive: Signal<boolean>; // Represents if an oscillator/note is currently active
  detune: Signal<number>;
  attack: Signal<number>;
  release: Signal<number>;
  filterCutoff: Signal<number>;
  filterResonance: Signal<number>;
  vibratoRate: Signal<number>;
  vibratoWidth: Signal<number>;
  portamentoTime: Signal<number>;
  isMuted: Signal<boolean>;
  audioContextState: Signal<string>; // e.g., "running", "suspended", "closed", "interrupted"
  activeControllerMode: Signal<string>; // e.g., IKEDA_MODE from constants
}

// Type for the logger function provided to the hook
export type LoggerFn = (text: string) => void;

/**
 * Defines the methods returned by the useAudioInteraction hook.
 */
export interface UseAudioInteractionReturn {
  sendAllSynthParameters: (channel: RTCDataChannel) => void;
  sendAudioStateOnly: (channel: RTCDataChannel, pendingNote?: boolean) => void;
  sendParamToController: (
    channel: RTCDataChannel,
    param: string,
    value: unknown,
  ) => void;
}

/**
 * A Preact custom hook to handle sending audio engine state and parameters
 * over a WebRTC data channel.
 *
 * @param {AudioEngineControls} audioEngine - An object containing signals and properties
 *                                        representing the audio engine's state.
 * @param {LoggerFn} addLog - A function to log messages.
 * @returns {UseAudioInteractionReturn} An object containing methods to send audio data.
 */
export default function useAudioInteraction(
  audioEngine: AudioEngineControls,
  addLog: LoggerFn,
): UseAudioInteractionReturn {
  /**
   * Sends all current synthesizer parameters to the controller.
   * @param {RTCDataChannel} channel - The RTCDataChannel to send the parameters on.
   */
  const sendAllSynthParameters = (channel: RTCDataChannel): void => {
    if (!channel || channel.readyState !== "open") {
      addLog(
        "[AudioInteraction] Cannot send all synth parameters: channel not open.",
      );
      return;
    }
    try {
      const params = [
        { param: "frequency", value: audioEngine.frequency.value },
        { param: "waveform", value: audioEngine.waveform.value },
        { param: "volume", value: audioEngine.volume.value },
        { param: "oscillatorEnabled", value: audioEngine.isNoteActive.value },
        { param: "detune", value: audioEngine.detune.value },
        { param: "attack", value: audioEngine.attack.value },
        { param: "release", value: audioEngine.release.value },
        { param: "filterCutoff", value: audioEngine.filterCutoff.value },
        { param: "filterResonance", value: audioEngine.filterResonance.value },
        { param: "vibratoRate", value: audioEngine.vibratoRate.value },
        { param: "vibratoWidth", value: audioEngine.vibratoWidth.value },
        { param: "portamentoTime", value: audioEngine.portamentoTime.value },
      ];

      params.forEach(({ param, value }) => {
        channel.send(
          JSON.stringify({
            type: "synth_param",
            param,
            value,
          }),
        );
      });

      // Also send the full audio state
      channel.send(
        JSON.stringify({
          type: "audio_state",
          isMuted: audioEngine.isMuted.value,
          audioState: audioEngine.audioContextState.value,
          controllerMode: audioEngine.activeControllerMode.value,
          isNoteActive: audioEngine.isNoteActive.value, // Include current note status
        }),
      );

      addLog(
        "[AudioInteraction] Sent all synth parameters and current audio state.",
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(
        `[AudioInteraction] Error sending all synth parameters: ${errorMessage}`,
      );
      console.error(
        "[AudioInteraction] Error sending all synth parameters:",
        error,
      );
    }
  };

  /**
   * Sends only the essential audio state to the controller.
   * Useful when audio is not fully enabled or has just been disabled.
   * @param {RTCDataChannel} channel - The RTCDataChannel to send the state on.
   * @param {boolean} [pendingNote] - Optional: Explicitly state if a note is pending (e.g. requested while muted).
   */
  const sendAudioStateOnly = (channel: RTCDataChannel, pendingNote?: boolean): void => {
    if (!channel || channel.readyState !== "open") {
      addLog(
        "[AudioInteraction] Cannot send audio state only: channel not open.",
      );
      return;
    }
    try {
      channel.send(
        JSON.stringify({
          type: "audio_state",
          isMuted: audioEngine.isMuted.value,
          audioState: audioEngine.audioContextState.value,
          controllerMode: audioEngine.activeControllerMode.value,
          // If pendingNote is explicitly passed, use it, otherwise use current isNoteActive
          isNoteActive: typeof pendingNote === 'boolean' ? pendingNote : audioEngine.isNoteActive.value,
        }),
      );
      addLog("[AudioInteraction] Sent audio state only.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(
        `[AudioInteraction] Error sending audio state only: ${errorMessage}`,
      );
      console.error("[AudioInteraction] Error sending audio state only:", error);
    }
  };

  /**
   * Sends a specific synthesizer parameter update to the controller.
   * @param {RTCDataChannel} channel - The RTCDataChannel to send the update on.
   * @param {string} param - The name of the parameter to update.
   * @param {unknown} value - The new value of the parameter.
   */
  const sendParamToController = (
    channel: RTCDataChannel,
    param: string,
    value: unknown,
  ): void => {
    if (!channel || channel.readyState !== "open") {
      addLog(
        `[AudioInteraction] Cannot send param '${param}': channel not open.`,
      );
      return;
    }
    try {
      channel.send(
        JSON.stringify({
          type: "synth_param",
          param,
          value,
        }),
      );
      // addLog(`[AudioInteraction] Sent param: ${param} = ${String(value)}`); // Optional: can be noisy
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(
        `[AudioInteraction] Error sending param '${param}': ${errorMessage}`,
      );
      console.error(`[AudioInteraction] Error sending param '${param}':`, error);
    }
  };

  return {
    sendAllSynthParameters,
    sendAudioStateOnly,
    sendParamToController,
  };
}