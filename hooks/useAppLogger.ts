// fresh_webrtc_ds_template/hooks/useAppLogger.ts

import { useSignal, type Signal } from "@preact/signals";
import { useRef, useCallback, useEffect } from "preact/hooks";

/**
 * Formats the current time as HH:MM:SS.
 * @returns {string} The formatted time string.
 */
function formatTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// Configuration constants
const MAX_LOG_ENTRIES = 0;        // No logs stored in UI to prevent render loops
const UPDATE_INTERVAL_MS = 0;     // No UI updates
const VERBOSE_LOGGING = false;    // Set to false to reduce log volume
const DISABLE_UI_LOGGING = true;  // Completely disable UI logging

/**
 * Defines the return type for the useAppLogger hook.
 */
export interface UseAppLoggerReturn {
  logsSignal: Signal<string[]>;
  addLog: (text: string, level?: "info" | "warn" | "error") => void;
}

/**
 * A Preact custom hook for managing application logs.
 * This version has been modified to completely bypass UI logging to prevent render loops.
 * It still logs to the console but doesn't update UI state.
 *
 * @returns {UseAppLoggerReturn} An object containing:
 *  - logsSignal: A Preact signal holding an array of log strings (empty).
 *  - addLog: A function that only logs to console, not to UI.
 */
export default function useAppLogger(): UseAppLoggerReturn {
  // Signal to store log entries - will remain empty
  const logsSignal = useSignal<string[]>([]);
  
  /**
   * Simplified addLog function that only logs to console, not to UI
   * @param {string} text - The message to log.
   * @param {string} level - Log level (info, warn, error)
   */
  const addLog = useCallback((text: string, level: "info" | "warn" | "error" = "info"): void => {
    // Console logging only
    if (level === "error") console.error(text);
    else if (level === "warn") console.warn(text);
    else if (VERBOSE_LOGGING) console.log(text);
    
    // No UI updates at all
  }, []);

  return {
    logsSignal,
    addLog,
  };
}

// This hook has been modified to disable UI logging completely
// Only console logs are preserved to prevent render loops
// To restore UI logging, set DISABLE_UI_LOGGING to false and restore the original implementation