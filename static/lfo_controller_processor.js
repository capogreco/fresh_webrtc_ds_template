// static/lfo_controller_processor.js

class UnipolarLFOProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._phase = 0;
    this._sampleRate = sampleRate;

    this._isFrozen = false;
    this._frozenPhase = 0.5; // Default phase to freeze at if explicitly frozen

    this._isRunUntilActive = false;
    this._runUntilTargetPhase = 0;
    this._previousPhaseForRunUntilCheck = 0; // Helps detect crossing the target

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === "set_frozen_state") {
        this._isFrozen = !!data.frozen;
        this._isRunUntilActive = false; // Explicit freeze/unfreeze cancels run_until
        if (this._isFrozen && typeof data.phaseToFreezeAt === "number") {
          this._frozenPhase = Math.max(0, Math.min(1, data.phaseToFreezeAt));
          this._phase = this._frozenPhase;
        } else if (this._isFrozen) {
          // If freezing without a specific phase, ensure it holds the intended _frozenPhase
          this._phase = this._frozenPhase;
        }
        // console.log(`[LFOProcessor] set_frozen_state: Frozen: ${this._isFrozen}, Phase: ${this._phase}`);
      } else if (data.type === "reset_phase") {
        const targetPhase = typeof data.phase === "number" ? data.phase : 0;
        this._phase = Math.max(0, Math.min(1, targetPhase));
        this._previousPhaseForRunUntilCheck = this._phase;
        // console.log(`[LFOProcessor] reset_phase: Phase set to: ${this._phase}`);
      } else if (data.type === "run_until_and_freeze") {
        if (typeof data.targetPhase === "number") {
          this._runUntilTargetPhase = Math.max(
            0,
            Math.min(1, data.targetPhase),
          );
          this._isRunUntilActive = true; // Activate run_until mode
          this._isFrozen = false; // Ensure LFO is running to reach the target
          this._previousPhaseForRunUntilCheck = this._phase;
          console.log(
            `[LFO_PROC] run_until_and_freeze received: TargetPhase=${this._runUntilTargetPhase}, CurrentPhase=${this._phase.toFixed(4)}, IsFrozen=${this._isFrozen}`,
          );
        }
      }
    };
  }

  static get parameterDescriptors() {
    return [
      {
        name: "rate",
        defaultValue: 1.0,
        minValue: 0.001,
        maxValue: 100,
        automationRate: "a-rate",
      },
      {
        name: "amplitudeFactor",
        defaultValue: 1.0,
        minValue: 0,
        maxValue: 1.0,
        automationRate: "a-rate",
      },
      {
        name: "offset",
        defaultValue: 0.0,
        minValue: -1.0,
        maxValue: 1.0,
        automationRate: "a-rate",
      },
    ];
  }

  process(inputs, outputs, parameters) {
    const outputChannel = outputs[0][0];
    const rateValues = parameters.rate;
    const ampFactorValues = parameters.amplitudeFactor;
    const offsetValues = parameters.offset;

    for (let i = 0; i < outputChannel.length; i++) {
      let rawLfoValue = 0;
      const currentRate = rateValues.length > 1 ? rateValues[i] : rateValues[0];
      const currentAmpFactor =
        ampFactorValues.length > 1 ? ampFactorValues[i] : ampFactorValues[0];
      const currentOffset =
        offsetValues.length > 1 ? offsetValues[i] : offsetValues[0];

      let phaseForCalc = this._isFrozen ? this._frozenPhase : this._phase;

      // CRITICAL FIX: Ensure frozenPhase is not lost during wrapping
      if (this._isFrozen && this._frozenPhase === 1.0) {
        phaseForCalc = 1.0; // Force use of exact 1.0 for calculations when frozen at 1.0
      }

      if (
        phaseForCalc === 0.0 ||
        phaseForCalc === 1.0 ||
        Math.abs(phaseForCalc - 1.0) < 0.0001
      ) {
        rawLfoValue = 0.0;
      } else {
        rawLfoValue = (1 - Math.cos(phaseForCalc * 2 * Math.PI)) / 2;
      }

      if (!this._isFrozen) {
        const phaseIncrement = currentRate / this._sampleRate;
        this._phase += phaseIncrement;

        if (this._isRunUntilActive) {
          const target = this._runUntilTargetPhase;
          const prev = this._previousPhaseForRunUntilCheck;
          const currentPhaseAfterIncrement = this._phase; // This is the phase *after* increment for this sample

          // console.log(`[LFO_PROC] process run_until: Prev=${prev.toFixed(4)}, CurrAdv=${currentPhaseAfterIncrement.toFixed(4)}, Target=${target.toFixed(4)}, PhaseInc=${phaseIncrement.toFixed(6)}`);

          let crossedOrReachedTarget = false;
          // Handle normal case and wrap-around for target near 0 and phase crossing 1
          if (phaseIncrement > 0) {
            // Advancing phase
            if (prev < target && currentPhaseAfterIncrement >= target) {
              // Simple cross or reach
              crossedOrReachedTarget = true;
            } else if (prev > currentPhaseAfterIncrement) {
              // Wrapped around 1.0
              if (
                (prev <= target && target < 1.0) ||
                (0 <= target && currentPhaseAfterIncrement >= target)
              ) {
                // Target was in [prev, 1) or [0, currentPhaseAfterIncrement]
                crossedOrReachedTarget = true;
              }
            } else if (
              prev === target &&
              currentPhaseAfterIncrement === target
            ) {
              // Started at target and stayed
              crossedOrReachedTarget = true;
            }
          }
          // Note: Could add similar logic for negative rates if ever needed.

          if (crossedOrReachedTarget) {
            this._phase = target;
            this._frozenPhase = target;
            this._isFrozen = true;
            this._isRunUntilActive = false;
            console.log(
              `[LFO_PROC] Reached target ${target.toFixed(4)}. Freezing. Phase set to ${this._phase.toFixed(4)}, FrozenPhase set to ${this._frozenPhase.toFixed(4)}`,
            );
            this.port.postMessage({ type: "frozen_at_target", phase: target });
            console.log(
              `[LFO_PROC] Sent 'frozen_at_target' message for phase ${target.toFixed(4)}`,
            );
            phaseForCalc = this._frozenPhase; // Use the target phase for this sample's output

            // Store the original rawLfoValue before recalculation for logging
            const rawLfoBeforeRecalc = rawLfoValue;

            // Recalculate LFO value for this sample based on the frozen phase
            if (
              phaseForCalc === 0.0 ||
              phaseForCalc === 1.0 ||
              Math.abs(phaseForCalc - 1.0) < 0.0001
            ) {
              rawLfoValue = 0.0;
            } else {
              rawLfoValue = (1 - Math.cos(phaseForCalc * 2 * Math.PI)) / 2;
            }
          }
        }
        // Ensure phase wraps around [0, 1) after advancing and potential run_until freeze
        // CRITICAL FIX: Don't wrap phase if we're frozen at exactly 1.0 or very close to it
        if (
          !(
            this._isFrozen &&
            (this._phase === 1.0 || Math.abs(this._phase - 1.0) < 0.0001)
          )
        ) {
          while (this._phase >= 1.0) this._phase -= 1.0;
        }
        // while (this._phase < 0.0) this._phase += 1.0; // Should not happen with positive rate

        // Update _previousPhaseForRunUntilCheck with the phase value at the end of this processing block
        this._previousPhaseForRunUntilCheck = this._phase;
      }
      const finalOutputValue = rawLfoValue * currentAmpFactor + currentOffset;
      // Conditional logging for output to avoid flooding, e.g., only when run_until was active in this block or recently completed
      // if (this._isRunUntilActive || (crossedOrReachedTarget && !this._isRunUntilActive)) { // This logic is tricky here due to scope of crossedOrReachedTarget
      // For now, log if recently became frozen due to run_until OR if run_until is active
      if (
        (this._isFrozen &&
          !this._isRunUntilActive &&
          this._phase === this._runUntilTargetPhase &&
          this._phase === this._frozenPhase) ||
        this._isRunUntilActive
      ) {
        if (i % 128 === 0) {
          // Log approx every few ms to reduce noise
          console.log(
            `[LFO_PROC] Output sample ${i}: phaseForCalc=${phaseForCalc.toFixed(4)}, rawLfo=${rawLfoValue.toFixed(4)}, ampFactor=${currentAmpFactor.toFixed(4)}, offset=${currentOffset.toFixed(4)}, finalOut=${finalOutputValue.toFixed(4)}, IsFrozen=${this._isFrozen}`,
          );
        }
      }
      outputChannel[i] = finalOutputValue;
      // outputChannel[i] = 0;
    }
    return true;
  }
}

registerProcessor("unipolar-lfo-processor", UnipolarLFOProcessor);
