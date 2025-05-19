/**
 * Test utility for the noise LFO functionality in Default Mode
 *
 * This utility allows testing different HRS parameters for the noise LFO
 * and visualizes the expected behavior.
 */

import { HRSResolver } from "./hrs_resolver.ts";

/**
 * Test and visualize noise LFO behavior with different HRS settings
 * @param duration Duration to simulate in seconds
 * @param cpm Cycles per minute
 * @param numeratorSIN SIN string for rate numerator
 * @param numeratorMode Resolution mode for numerator
 * @param denominatorSIN SIN string for rate denominator
 * @param denominatorMode Resolution mode for denominator
 */
export function testNoiseLFO(
  duration: number,
  cpm: number,
  numeratorSIN: string,
  numeratorMode: "static" | "random" | "shuffle" | "ascend" | "descend",
  denominatorSIN: string,
  denominatorMode: "static" | "random" | "shuffle" | "ascend" | "descend",
): void {
  // Create an HRS resolver with the provided settings
  const hrs = new HRSResolver(
    numeratorSIN,
    numeratorMode,
    denominatorSIN,
    denominatorMode,
  );

  console.log(`=== NOISE LFO TEST ===`);
  console.log(`Numerator SIN: "${numeratorSIN}" (${numeratorMode})`);
  console.log(`Denominator SIN: "${denominatorSIN}" (${denominatorMode})`);
  console.log(`CPM: ${cpm}`);
  console.log(`Simulating ${duration} seconds...`);
  console.log("----------------------------------");

  // Simulate the LFO behavior over time
  const samples = 10 * duration; // 10 samples per second
  const sampleTime = duration / samples;
  const results: Array<{
    time: number;
    num: number;
    denom: number;
    freq: number;
    period: number;
    amplitude: number;
  }> = [];

  // Get base frequency from CPM
  const cpmFrequency = cpm / 60; // Convert CPM to Hz

  let totalTime = 0;
  for (let i = 0; i < samples; i++) {
    // Get the HRS ratio at this point
    const { numerator, denominator } = hrs.next();

    // Calculate LFO frequency and period
    const freq = cpmFrequency * (numerator / denominator);
    const period = 1 / freq;

    // Calculate the amplitude at this point in time (simulating a sine wave)
    const amplitude = 0.5 + 0.5 * Math.sin(2 * Math.PI * freq * totalTime);

    results.push({
      time: totalTime,
      num: numerator,
      denom: denominator,
      freq: freq,
      period: period,
      amplitude: amplitude,
    });

    totalTime += sampleTime;
  }

  // Log the results
  console.table(results.filter((_, i) => i % 10 === 0)); // Show every 10th sample

  // Create a simple ASCII visualization of the LFO
  console.log("\nLFO Amplitude Visualization:");
  console.log("-----------------------------");

  const graphHeight = 10;
  const graphWidth = 60;
  const samplesPerLine = Math.floor(samples / graphWidth);

  for (let line = 0; line < graphHeight; line++) {
    let graphLine = "";

    for (let col = 0; col < graphWidth; col++) {
      const sampleIndex = col * samplesPerLine;
      if (sampleIndex < results.length) {
        const amplitude = results[sampleIndex].amplitude;
        const position = Math.floor(amplitude * graphHeight);

        if (position === line) {
          graphLine += "●";
        } else if (line === Math.floor(graphHeight / 2)) {
          graphLine += "―";
        } else {
          graphLine += " ";
        }
      }
    }

    console.log(graphLine);
  }

  console.log("----------------------------------");
  console.log(`=== TEST COMPLETE ===`);
}

// Example usage:
// testNoiseLFO(30, 30, "1", "static", "4 / 8", "random");
