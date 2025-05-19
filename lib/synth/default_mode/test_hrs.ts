/**
 * Simple test utility for the HRS (Harmonic Ratio System) resolver
 *
 * This utility can be imported in a browser console to test the behavior
 * of the HRS resolver.
 */

import { HRSResolver } from "./hrs_resolver.ts";
import { getSubdivisionMs } from "./defaults.ts";

/**
 * Run a test simulation of the HRS resolver
 * @param numCycles Number of cycles to simulate
 * @param cpm Cycles per minute
 * @param numeratorSIN SIN string for numerator
 * @param numeratorMode Resolution mode for numerator
 * @param denominatorSIN SIN string for denominator
 * @param denominatorMode Resolution mode for denominator
 */
export function testHRS(
  numCycles: number,
  cpm: number,
  numeratorSIN: string,
  numeratorMode: "static" | "random" | "shuffle" | "ascend" | "descend",
  denominatorSIN: string,
  denominatorMode: "static" | "random" | "shuffle" | "ascend" | "descend",
): void {
  const hrs = new HRSResolver(
    numeratorSIN,
    numeratorMode,
    denominatorSIN,
    denominatorMode,
  );

  console.log(`=== HRS TEST ===`);
  console.log(`Numerator SIN: "${numeratorSIN}" (${numeratorMode})`);
  console.log(`Denominator SIN: "${denominatorSIN}" (${denominatorMode})`);
  console.log(`CPM: ${cpm}`);
  console.log(`Testing ${numCycles} cycles...`);
  console.log("----------------------------------");

  let totalDuration = 0;
  const results: Array<{ num: number; denom: number; ms: number }> = [];

  for (let i = 0; i < numCycles; i++) {
    const { numerator, denominator } = hrs.next();
    const durationMs = getSubdivisionMs(numerator, denominator, cpm);

    results.push({
      num: numerator,
      denom: denominator,
      ms: durationMs,
    });

    totalDuration += durationMs;
  }

  // Print the results
  console.table(results);

  console.log("----------------------------------");
  console.log(`Total duration: ${totalDuration}ms (${totalDuration / 1000}s)`);
  console.log(`Average duration per cycle: ${totalDuration / numCycles}ms`);
  console.log(`=== TEST COMPLETE ===`);
}

// Example usage:
// testHRS(10, 30, "1", "static", "8 / 16", "random");
