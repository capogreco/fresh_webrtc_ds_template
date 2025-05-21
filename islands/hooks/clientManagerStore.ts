import { signal, Signal } from "@preact/signals";
import type { WebRTCService } from "../../services/webrtcService.ts";
import type { SynthClient } from "../../lib/types/client.ts";

// Define the shape of the store
interface ClientManagerStore {
  clientsSignal: Signal<Map<string, SynthClient>> | null;
  webRTCServiceInstance: WebRTCService | null;
  onMessageFromClientCallback?: (clientId: string, messageString: string, channelLabel: string) => void;
  // Add other long-lived states if necessary
}

// Initialize the store
// This module-level variable will persist across hook re-initializations
// if the island itself is remounted by Fresh's dev server.
export const store: ClientManagerStore = {
  clientsSignal: null,
  webRTCServiceInstance: null,
  onMessageFromClientCallback: undefined,
};

// Getter for clientsSignal, initializes on first call
export function getClientsSignal(): Signal<Map<string, SynthClient>> {
  if (store.clientsSignal === null) {
    console.log("[ClientManagerStore] Initializing shared clientsSignal.");
    store.clientsSignal = signal(new Map<string, SynthClient>());
  }
  return store.clientsSignal;
}

// Function to get or create the WebRTCService instance
// WebRTCService requires controllerId and wsSignal which might come from hook props.
// The hook useClientManager will be responsible for calling this.
export async function getOrCreateWebRTCServiceInstance(
  // Arguments needed to create WebRTCService if it doesn't exist
  controllerIdSignal: Signal<string>,
  wsSignalWrapper: { sendMessage: (message: unknown) => void },
  callbacks: any, // Type this properly based on WebRTCServiceCallbacks
): Promise<WebRTCService> {
  if (store.webRTCServiceInstance === null) {
    console.log("[ClientManagerStore] Initializing shared WebRTCService instance.");
    // Dynamically import WebRTCService.
    // Ensure paths are correct relative to this file if WebRTCService is moved.
    const { WebRTCService: WebRTCService_class } = await import("../../services/webrtcService.ts");
    store.webRTCServiceInstance = new WebRTCService_class(
      controllerIdSignal,
      wsSignalWrapper,
      callbacks,
    );
  } else {
    // Potentially update callbacks or other non-static parts if needed on subsequent calls,
    // but the instance itself is preserved. For now, assume constructor sets it up.
    // console.log("[ClientManagerStore] Returning existing WebRTCService instance.");
  }
  return store.webRTCServiceInstance as WebRTCService; // Instance is guaranteed to be non-null here
}

// Function to clear the stored instances, e.g., on full controller disconnect or re-init
export function resetClientManagerStore() {
  console.log("[ClientManagerStore] Resetting shared store.");
  store.clientsSignal = null;
  store.webRTCServiceInstance = null;
}