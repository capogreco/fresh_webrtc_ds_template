/**
 * SINResolver - Stochastic Integer Notation Resolver
 *
 * A utility class to manage SIN-controlled parameters with different resolution modes:
 * - static: Uses one value consistently
 * - random: Picks a random value each time
 * - shuffle: Iterates through values in randomized order
 * - ascend: Iterates through values in ascending order
 * - descend: Iterates through values in descending order
 */

import { parseSIN } from "./sin_parser.ts";

/**
 * Resolution modes for SIN parameters
 */
export type ResolutionMode =
  | "static" // Always returns the same value (usually the first value)
  | "random" // Returns a random value from the list each time
  | "shuffle" // Returns values in a randomized order, cycling through all values
  | "ascend" // Returns values in ascending order, cycling when reaching the end
  | "descend"; // Returns values in descending order, cycling when reaching the beginning

/**
 * Helper class for managing and resolving SIN parameters
 */
export class SINResolver {
  private values: number[] = [];
  private mode: ResolutionMode = "static";
  private index = 0;
  private shuffledIndices: number[] = [];

  /**
   * Create a new SINResolver
   * @param sinString Initial SIN string to parse
   * @param mode Resolution mode to use
   */
  constructor(sinString: string = "", mode: ResolutionMode = "static") {
    this.setValues(sinString);
    this.setMode(mode);
  }

  /**
   * Update the SIN values used by this resolver
   * @param sinString New SIN string to parse
   */
  setValues(sinString: string): void {
    this.values = parseSIN(sinString);
    this.resetState();
  }

  /**
   * Update the resolution mode used by this resolver
   * @param mode New resolution mode
   */
  setMode(mode: ResolutionMode): void {
    this.mode = mode;
    this.resetState();
  }

  /**
   * Reset the internal state of the resolver
   */
  private resetState(): void {
    this.index = 0;

    // For shuffle mode, randomize the order of indices
    if (this.mode === "shuffle") {
      this.initializeShuffledIndices();
    }
  }

  /**
   * Initialize the shuffled indices array for shuffle mode
   */
  private initializeShuffledIndices(): void {
    // Create an array of indices
    this.shuffledIndices = Array.from(
      { length: this.values.length },
      (_, i) => i,
    );

    // Shuffle the indices using Fisher-Yates algorithm
    for (let i = this.shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledIndices[i], this.shuffledIndices[j]] = [
        this.shuffledIndices[j],
        this.shuffledIndices[i],
      ];
    }
  }

  /**
   * Get the next value based on the current resolution mode
   * @returns The resolved value, or undefined if no values exist
   */
  next(): number | undefined {
    console.log(
      `SIN Resolver [next]: Mode=${this.mode}, Values=${this.values.join(",")}`,
    );

    if (this.values.length === 0) {
      console.warn("SIN Resolver: No values available, returning undefined");
      return undefined;
    }

    // For single-value lists, always return that value
    if (this.values.length === 1) {
      console.log(`SIN Resolver: Single value, returning ${this.values[0]}`);
      return this.values[0];
    }

    let result: number;

    switch (this.mode) {
      case "static":
        // Always return the first value
        result = this.values[0];
        console.log(`SIN Resolver [static]: Returning first value ${result}`);
        break;

      case "random":
        // Return a random value each time
        const randomIndex = Math.floor(Math.random() * this.values.length);
        result = this.values[randomIndex];
        console.log(
          `SIN Resolver [random]: Chose index ${randomIndex}, value ${result}`,
        );
        break;

      case "shuffle":
        // Return the next value in the shuffled order
        result = this.values[this.shuffledIndices[this.index]];
        console.log(
          `SIN Resolver [shuffle]: Using shuffled index ${this.index}, value ${result}`,
        );
        this.index = (this.index + 1) % this.shuffledIndices.length;

        // Reshuffle when we've used all values
        if (this.index === 0) {
          console.log("SIN Resolver [shuffle]: Reshuffling indices");
          this.initializeShuffledIndices();
        }
        break;

      case "ascend":
        // Return values in ascending sorted order
        const sortedAscending = [...this.values].sort((a, b) => a - b);
        result = sortedAscending[this.index];
        console.log(
          `SIN Resolver [ascend]: Using index ${this.index}, value ${result}`,
        );
        this.index = (this.index + 1) % sortedAscending.length;
        break;

      case "descend":
        // Return values in descending sorted order
        const sortedDescending = [...this.values].sort((a, b) => b - a);
        result = sortedDescending[this.index];
        console.log(
          `SIN Resolver [descend]: Using index ${this.index}, value ${result}`,
        );
        this.index = (this.index + 1) % sortedDescending.length;
        break;

      default:
        result = this.values[0];
        console.log(
          `SIN Resolver [default]: Using fallback, first value ${result}`,
        );
    }

    return result;
  }

  /**
   * Get the current set of values
   * @returns Array of current values
   */
  getValues(): number[] {
    return [...this.values];
  }

  /**
   * Get the current resolution mode
   * @returns Current resolution mode
   */
  getMode(): ResolutionMode {
    return this.mode;
  }

  /**
   * Convert to string representation
   * @returns String representation of the resolver
   */
  toString(): string {
    return `SINResolver(values=[${this.values.join(", ")}], mode=${this.mode})`;
  }
}

/**
 * Create a SINResolver with bounds checking
 */
export class BoundedSINResolver extends SINResolver {
  private min: number;
  private max: number;

  /**
   * Create a new bounded SIN resolver
   * @param sinString Initial SIN string
   * @param mode Resolution mode
   * @param min Minimum allowed value
   * @param max Maximum allowed value
   */
  constructor(
    sinString: string = "",
    mode: ResolutionMode = "static",
    min: number = 0,
    max: number = 100,
  ) {
    super(sinString, mode);
    this.min = min;
    this.max = max;

    // Apply bounds to initial values
    this.setValues(sinString);
  }

  /**
   * Update the SIN values, applying bounds
   * @param sinString New SIN string
   */
  setValues(sinString: string): void {
    const rawValues = parseSIN(sinString);
    const boundedValues = rawValues.map(
      (value) => Math.max(this.min, Math.min(this.max, value)),
    );

    // Use the parent class to store and manage these values
    super.setValues(boundedValues.join(" / "));
  }

  /**
   * Update the bounds for this resolver
   * @param min New minimum value
   * @param max New maximum value
   */
  setBounds(min: number, max: number): void {
    this.min = min;
    this.max = max;

    // Re-apply bounds to existing values
    this.setValues(this.getValues().join(" / "));
  }

  /**
   * Get the current bounds
   * @returns Object containing min and max values
   */
  getBounds(): { min: number; max: number } {
    return { min: this.min, max: this.max };
  }
}
