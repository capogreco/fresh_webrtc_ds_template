/**
 * Euclidean Rhythm Generator
 *
 * Implementation of the Euclidean algorithm for generating rhythmic patterns
 * by distributing pulses evenly across steps. This creates musically pleasing
 * patterns found in many world music traditions.
 *
 * Based on the work of Godfried Toussaint:
 * "The Euclidean Algorithm Generates Traditional Musical Rhythms"
 */

/**
 * Generate a Euclidean rhythm pattern
 *
 * @param pulses Number of active pulses (beats)
 * @param steps Total number of steps in the pattern
 * @param rotation Optional rotation of the pattern (default: 0)
 * @returns Array of 1s and 0s representing the rhythm pattern
 */
export function generateEuclideanRhythm(
  pulses: number,
  steps: number,
  rotation: number = 0,
): number[] {
  // Ensure valid inputs
  pulses = Math.max(0, Math.min(pulses, steps));
  steps = Math.max(1, steps);

  // Handle edge cases
  if (pulses === 0) return Array(steps).fill(0);
  if (pulses === steps) return Array(steps).fill(1);

  // Implement Bjorklund's algorithm (a version of the Euclidean algorithm)
  // This algorithm distributes pulses as evenly as possible
  const pattern: number[][] = Array(pulses).fill([1]).concat(
    Array(steps - pulses).fill([0]),
  );

  let counts: number[] = [];
  let remainders: number[] = [];

  let divisor = steps - pulses;
  remainders.push(pulses);
  let level = 0;

  // Main Euclidean calculation
  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level += 1;
  }

  counts.push(divisor);

  // Build the pattern by concatenating groups
  let index = 0;

  // First pass builds the pattern from the counts
  for (let i = 0; i < counts.length; i++) {
    const count = counts[i];
    const remainder = remainders[i];

    for (let j = 0; j < remainder; j++) {
      const patternPart = pattern[index];
      index++;

      for (let k = 0; k < count; k++) {
        // Append the next element to the current pattern part
        if (index < pattern.length) {
          pattern[index - 1] = patternPart.concat(pattern[index]);
          pattern.splice(index, 1);
        }
      }
    }
  }

  // Flatten the nested arrays into a single array of 1s and 0s
  let result = pattern[0];

  // Apply rotation if specified
  if (rotation !== 0) {
    const normalizedRotation = ((rotation % steps) + steps) % steps;
    if (normalizedRotation > 0) {
      result = [
        ...result.slice(normalizedRotation),
        ...result.slice(0, normalizedRotation),
      ];
    }
  }

  return result;
}

/**
 * Generate a Euclidean rhythm pattern as a string of binary digits
 *
 * @param pulses Number of active pulses (beats)
 * @param steps Total number of steps in the pattern
 * @param rotation Optional rotation of the pattern (default: 0)
 * @returns String of 1s and 0s representing the rhythm pattern
 */
export function euclideanRhythmString(
  pulses: number,
  steps: number,
  rotation: number = 0,
): string {
  return generateEuclideanRhythm(pulses, steps, rotation).join("");
}

/**
 * Get the indexes of active pulses in a Euclidean rhythm
 *
 * @param pulses Number of active pulses (beats)
 * @param steps Total number of steps in the pattern
 * @param rotation Optional rotation of the pattern (default: 0)
 * @returns Array of indices where pulses occur
 */
export function getEuclideanPulseIndices(
  pulses: number,
  steps: number,
  rotation: number = 0,
): number[] {
  const pattern = generateEuclideanRhythm(pulses, steps, rotation);
  return pattern.reduce((indices, value, index) => {
    if (value === 1) indices.push(index);
    return indices;
  }, [] as number[]);
}

/**
 * Test if a specific step in a Euclidean pattern would be active
 *
 * @param step The step to test (0-indexed)
 * @param pulses Number of active pulses (beats)
 * @param steps Total number of steps in the pattern
 * @param rotation Optional rotation of the pattern (default: 0)
 * @returns True if the step would be active, false otherwise
 */
export function isEuclideanPulseActive(
  step: number,
  pulses: number,
  steps: number,
  rotation: number = 0,
): boolean {
  // Handle invalid step
  if (step < 0 || step >= steps) return false;

  // Normalize step index with modulo
  const normalizedStep = step % steps;

  // Generate the pattern
  const pattern = generateEuclideanRhythm(pulses, steps, rotation);

  // Check if the step is active
  return pattern[normalizedStep] === 1;
}

/**
 * Get timing ratios for each pulse in a Euclidean pattern
 *
 * @param pulses Number of active pulses (beats)
 * @param steps Total number of steps in the pattern
 * @param rotation Optional rotation of the pattern (default: 0)
 * @returns Array of ratios (0.0-1.0) representing when each pulse occurs
 */
export function getEuclideanTimingRatios(
  pulses: number,
  steps: number,
  rotation: number = 0,
): number[] {
  const indices = getEuclideanPulseIndices(pulses, steps, rotation);

  // Convert indices to ratios (0.0 to 1.0)
  return indices.map((index) => index / steps);
}
