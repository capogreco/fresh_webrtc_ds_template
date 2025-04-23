/**
 * Utility for managing screen wake lock to prevent device from sleeping
 * during WebRTC sessions
 */

// Type for the wake lock sentinel
interface WakeLockSentinel extends EventTarget {
  release(): Promise<void>;
  type: string;
  onrelease: ((this: WakeLockSentinel, ev: Event) => any) | null;
}

// Type for the wake lock navigator API
interface WakeLockNavigator extends Navigator {
  wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinel>;
  };
}

// Add wake lock types to the global object
declare global {
  interface Navigator extends WakeLockNavigator {}
}

/**
 * Request a screen wake lock to prevent device from sleeping
 * @returns WakeLockSentinel if successful, null if wake lock is not supported or fails
 */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if (!("wakeLock" in navigator)) {
    console.warn("Wake Lock API is not supported in this browser");
    return null;
  }

  try {
    const wakeLockSentinel = await (navigator as WakeLockNavigator).wakeLock
      ?.request("screen");
    console.log("Wake lock acquired");
    return wakeLockSentinel || null;
  } catch (err) {
    console.error(`Failed to acquire wake lock: ${err}`);
    return null;
  }
}

/**
 * Release an active wake lock
 * @param wakeLockSentinel The active wake lock to release
 * @returns Promise that resolves when lock is released
 */
export async function releaseWakeLock(
  wakeLockSentinel: WakeLockSentinel | null,
): Promise<void> {
  if (!wakeLockSentinel) {
    return;
  }

  try {
    await wakeLockSentinel.release();
    console.log("Wake lock released");
  } catch (err) {
    console.error(`Failed to release wake lock: ${err}`);
  }
}

/**
 * Setup event listeners to handle wake lock reacquisition when page visibility changes
 * @param getWakeLock Function that returns the current wake lock
 * @param setWakeLock Function to update the wake lock reference
 */
export function setupWakeLockListeners(
  getWakeLock: () => WakeLockSentinel | null,
  setWakeLock: (lock: WakeLockSentinel | null) => void,
): void {
  // Reacquire wake lock when page becomes visible again
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && getWakeLock() === null) {
      const newWakeLock = await requestWakeLock();
      setWakeLock(newWakeLock);
    }
  });

  // Handle wake lock release event
  const handleWakeLockRelease = async () => {
    setWakeLock(null);
    // Try to reacquire if page is visible
    if (document.visibilityState === "visible") {
      const newWakeLock = await requestWakeLock();
      setWakeLock(newWakeLock);
    }
  };

  // Create a cleanup function for event listeners
  return () => {
    document.removeEventListener("visibilitychange", handleWakeLockRelease);
  };
}
