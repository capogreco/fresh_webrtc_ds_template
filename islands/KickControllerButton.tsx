import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface KickControllerButtonProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
  clientId: string; // Client ID of this controller
  activeControllerClientId: string; // Client ID of the active controller
}

export default function KickControllerButton(
  { _user, clientId, _activeControllerClientId }: KickControllerButtonProps,
) {
  // Progress state (0-100)
  const kickProgress = useSignal(0);
  const isKicking = useSignal(false);
  const pressStartTime = useSignal<number | null>(null);
  const kickTimer = useSignal<number | null>(null);
  const kickResult = useSignal<{ success: boolean; message: string } | null>(
    null,
  );

  const KICK_DURATION = 5000; // 5 seconds in milliseconds

  // Handle button press start - more reliable than mousedown/touchstart
  function handleButtonPress() {
    // Only start if not already kicking
    if (isKicking.value) return;

    // Reset progress and start kicking
    kickProgress.value = 0;
    isKicking.value = true;
    kickResult.value = null;
    pressStartTime.value = Date.now();

    // Clear any existing timer
    if (kickTimer.value !== null) {
      clearInterval(kickTimer.value);
    }

    // Start interval to update progress
    kickTimer.value = globalThis.setInterval(() => {
      if (pressStartTime.value === null) return;

      const elapsed = Date.now() - pressStartTime.value;
      const progress = Math.min(100, (elapsed / KICK_DURATION) * 100);
      kickProgress.value = progress;

      // If we've reached 100%, execute the kick
      if (progress >= 100) {
        globalThis.clearInterval(kickTimer.value!);
        kickTimer.value = null;
        pressStartTime.value = null;
        executeKick();
      }
    }, 50);
  }

  // Handle button press cancel
  function handleButtonCancel() {
    // Don't cancel if we completed the kick
    if (kickProgress.value >= 100) return;

    if (kickTimer.value !== null) {
      globalThis.clearInterval(kickTimer.value);
      kickTimer.value = null;
    }
    pressStartTime.value = null;
    kickProgress.value = 0;
    isKicking.value = false;
  }

  // Function to execute the kick
  async function executeKick() {
    try {
      // 1. Force the deactivation of the current controller
      const kickResponse = await fetch("/api/controller/active", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: true,
          controllerClientId: "force-deactivate", // Special value to force deactivation
          newControllerClientId: clientId, // Pass our client ID to notify the kicked controller
        }),
      });

      if (!kickResponse.ok) {
        const kickData = await kickResponse.json();
        kickResult.value = {
          success: false,
          message: kickData.error || "Failed to deactivate current controller",
        };
        return;
      }

      // 2. Register as the new active controller
      const activateResponse = await fetch("/api/controller/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controllerClientId: clientId,
        }),
      });

      const activateData = await activateResponse.json();

      if (!activateData.success) {
        kickResult.value = {
          success: false,
          message: activateData.error || "Failed to activate as new controller",
        };
        return;
      }

      // 3. Success - redirect to the controller page with a special force parameter
      kickResult.value = {
        success: true,
        message: "Successfully took control! Redirecting...",
      };

      // Give a moment to see the success message
      setTimeout(() => {
        // Add timestamp to bust cache
        globalThis.location.href = `/ctrl?active=true&clientId=${
          encodeURIComponent(clientId)
        }&t=${Date.now()}`;
      }, 1000);
    } catch (error) {
      console.error("Error during controller kick:", error);
      kickResult.value = {
        success: false,
        message: error instanceof Error
          ? error.message
          : "An unexpected error occurred",
      };
    } finally {
      isKicking.value = false;
    }
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (kickTimer.value !== null) {
        globalThis.clearInterval(kickTimer.value);
        kickTimer.value = null;
      }
    };
  }, []);

  return (
    <div class="kick-controller-container">
      {kickResult.value
        ? (
          <div
            class={`kick-result ${
              kickResult.value.success ? "kick-success" : "kick-error"
            }`}
          >
            <p>{kickResult.value.message}</p>
            {!kickResult.value.success && (
              <button
                type="button"
                class="retry-button"
                onClick={() => kickResult.value = null}
              >
                Try Again
              </button>
            )}
          </div>
        )
        : (
          <button
            type="button"
            class={`kick-controller-button ${isKicking.value ? "kicking" : ""}`}
            onPointerDown={handleButtonPress}
            onPointerUp={handleButtonCancel}
            onPointerLeave={handleButtonCancel}
            onPointerCancel={handleButtonCancel}
            disabled={isKicking.value && kickProgress.value >= 100}
          >
            <span>
              {isKicking.value
                ? kickProgress.value < 30
                  ? "Keep holding to kick..."
                  : kickProgress.value < 70
                  ? "Almost there..."
                  : "Kicking active controller..."
                : "Hold to Kick Active Controller"}
            </span>
            {isKicking.value && (
              <div class="kick-progress-bar">
                <div
                  class="kick-progress-fill"
                  style={{ width: `${kickProgress.value}%` }}
                >
                </div>
              </div>
            )}
          </button>
        )}
    </div>
  );
}
