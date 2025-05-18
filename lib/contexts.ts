/** @jsx h */
// Preact Context definitions
import { createContext, h, ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { Signal } from "@preact/signals";
import type { SynthClient } from "./types/client.ts";

// Type for the client manager context value
export interface ClientManagerContextValue {
  // Client state
  clients: Signal<Map<string, SynthClient>>;
  connectedClientsCount: Signal<number>;
  connectedClients: Signal<Map<string, SynthClient>>;
  
  // Client management methods
  addClient: (clientId: string) => void;
  removeClient: (clientId: string) => void;
  connectToClient: (clientId: string) => Promise<void>;
  disconnectFromClient: (clientId: string) => void;
  
  // Synth parameter management
  updateClientSynthParam: (clientId: string, param: string, value: unknown) => void;
  
  // Communication methods
  broadcastMessage: (message: string) => void;
  
  // Connection management
  startPinging: (intervalMs?: number) => void;
  stopPinging: () => void;
  pingClient: (clientId: string) => Promise<{ clientId: string; latency: number; success: boolean }>;
  
  // WebRTC signaling handlers
  handleClientOffer: (msg: { source: string; data: RTCSessionDescriptionInit; type: "offer" }) => void;
  handleAnswerFromClient: (msg: { source: string; data: RTCSessionDescriptionInit; type: "answer" }) => void;
  handleIceCandidateFromClient: (msg: { source: string; data: RTCIceCandidateInit; type: "ice-candidate" }) => void;
}

// Create the context with null as default value
export const ClientManagerContext = createContext<ClientManagerContextValue | null>(null);

// Provider component for easier usage
interface ClientManagerProviderProps {
  value: ClientManagerContextValue | null;
  children: ComponentChildren;
}

export function ClientManagerProvider(props: ClientManagerProviderProps) {
  return h(ClientManagerContext.Provider, { value: props.value }, props.children);
}

// Custom hook to use the client manager context
export function useClientManagerContext() {
  const context = useContext(ClientManagerContext);
  if (context === null) {
    throw new Error("useClientManagerContext must be used within a ClientManagerProvider");
  }
  return context;
}