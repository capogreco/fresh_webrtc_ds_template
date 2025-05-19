/**
 * HRSResolver - Harmonic Ratio System Resolver
 *
 * A utility class to manage Harmonic Ratio System parameters
 * which consist of a numerator and denominator, each governed by their own
 * Stochastic Integer Notation (SIN) and resolution mode.
 */

import { ResolutionMode, SINResolver } from "./sin_resolver.ts";

/**
 * Class that manages a numerator and denominator pair using SIN notation
 * and resolution modes.
 */
export class HRSResolver {
  /** SIN resolver for the numerator values */
  private numeratorResolver: SINResolver;

  /** SIN resolver for the denominator values */
  private denominatorResolver: SINResolver;

  /**
   * Create a new HRS resolver
   * @param numeratorSIN SIN string for numerator values
   * @param numeratorMode Resolution mode for numerator
   * @param denominatorSIN SIN string for denominator values
   * @param denominatorMode Resolution mode for denominator
   */
  constructor(
    numeratorSIN: string = "1",
    numeratorMode: ResolutionMode = "static",
    denominatorSIN: string = "1",
    denominatorMode: ResolutionMode = "static",
  ) {
    this.numeratorResolver = new SINResolver(numeratorSIN, numeratorMode);
    this.denominatorResolver = new SINResolver(denominatorSIN, denominatorMode);
  }

  /**
   * Update the numerator SIN values
   * @param sinString New SIN string for numerator
   */
  setNumeratorValues(sinString: string): void {
    this.numeratorResolver.setValues(sinString);
  }

  /**
   * Update the numerator resolution mode
   * @param mode New resolution mode for numerator
   */
  setNumeratorMode(mode: ResolutionMode): void {
    this.numeratorResolver.setMode(mode);
  }

  /**
   * Update the denominator SIN values
   * @param sinString New SIN string for denominator
   */
  setDenominatorValues(sinString: string): void {
    this.denominatorResolver.setValues(sinString);
  }

  /**
   * Update the denominator resolution mode
   * @param mode New resolution mode for denominator
   */
  setDenominatorMode(mode: ResolutionMode): void {
    this.denominatorResolver.setMode(mode);
  }

  /**
   * Get the next ratio by resolving both numerator and denominator
   * @returns Object containing the resolved numerator and denominator values
   */
  next(): { numerator: number; denominator: number } {
    const numerator = this.numeratorResolver.next() ?? 1;
    const denominator = this.denominatorResolver.next() ?? 1;

    console.log(
      `HRS Resolver [next]: Resolved ratio ${numerator}/${denominator}`,
    );

    return { numerator, denominator };
  }

  /**
   * Get the next ratio value as a decimal
   * @returns The ratio as a decimal number
   */
  nextValue(): number {
    const { numerator, denominator } = this.next();

    // Prevent division by zero
    if (denominator === 0) {
      console.warn("HRS Resolver: Denominator resolved to 0, using 1 instead");
      return numerator;
    }

    return numerator / denominator;
  }

  /**
   * Convert to string representation
   * @returns String representation of the resolver
   */
  toString(): string {
    return `HRSResolver(num=${this.numeratorResolver.toString()}, denom=${this.denominatorResolver.toString()})`;
  }
}
