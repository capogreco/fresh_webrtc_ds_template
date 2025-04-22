import type { SynthParams } from "./synth.ts";

/**
 * SynthClient interface representing a WebRTC synthesizer client that can be controlled
 * Handles audio synthesis based on parameters sent from a controller
 */
export interface SynthClient {
  /** Unique identifier for the client */
  id: string;
  /** Whether the client is currently connected via WebRTC (controller-verified) */
  connected: boolean;
  /** Timestamp when the client was last seen */
  lastSeen: number;
  /** Latency in milliseconds between controller and client */
  latency?: number;
  /** Synthesizer parameters for audio configuration */
  synthParams?: SynthParams;
  /** Whether audio is muted on the client */
  isMuted?: boolean;
  /** Additional audio state info (running, suspended, etc.) */
  audioState?: string;
  /** Whether the connection has been verified by direct ping/pong */
  verifiedConnection?: boolean;
  /* Connection state is now verified directly by the controller */
}
