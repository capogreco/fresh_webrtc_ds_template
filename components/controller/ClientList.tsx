// Preact component
import { h } from "preact";
import type { SynthClient } from "../../lib/types/client.ts";
import { SynthControls } from "./SynthControls.tsx";
import { useClientManagerContext } from "../../lib/contexts.ts";

// We still accept props as fallback for when context is not available
interface ClientListProps {
  clients: Map<string, SynthClient>;
  onConnect: (clientId: string) => void;
  onDisconnect: (clientId: string) => void;
  onSynthParamChange: (clientId: string, param: string, value: unknown) => void;
}

export function ClientList(props: ClientListProps) {
  // Try to use context, fall back to props if not available
  let clientManager;
  try {
    clientManager = useClientManagerContext();
  } catch (error) {
    // Context not available, use props
    clientManager = null;
  }
  
  // Use context values if available, otherwise use props
  const clients = clientManager?.clients.value || props.clients;
  const onConnect = clientManager?.connectToClient || props.onConnect;
  const onDisconnect = clientManager?.disconnectFromClient || props.onDisconnect;
  const onSynthParamChange = clientManager?.updateClientSynthParam || props.onSynthParamChange;
  const clientsArray = Array.from(clients.entries());

  if (clientsArray.length === 0) {
    return (
      <div class="client-list-container">
        <h2>Connected Clients</h2>
        <p>No clients connected. Add a client ID below to connect.</p>
      </div>
    );
  }

  return (
    <div class="client-list-container">
      <h2>Connected Clients</h2>
      <div class="client-list">
        {clientsArray.map(([clientId, client]) => (
          <div key={clientId} class="client-item">
            <div class="client-header">
              <div class="client-info">
                <div class="client-id">{clientId}</div>
                <div
                  class={`client-status ${
                    client.connected ? "connected" : "disconnected"
                  }`}
                >
                  {client.connected ? "Connected" : "Disconnected"}
                </div>
                {client.latency !== undefined && (
                  <div class="client-latency">
                    {client.latency >= 0
                      ? `Latency: ${client.latency}ms`
                      : "No ping response"}
                  </div>
                )}
              </div>
              <div class="client-actions">
                {!client.connected
                  ? (
                    <button
                      type="button"
                      onClick={() => onConnect(clientId)}
                      class="btn btn-connect"
                    >
                      Connect
                    </button>
                  )
                  : (
                    <button
                      type="button"
                      onClick={() => onDisconnect(clientId)}
                      class="btn btn-disconnect"
                    >
                      Disconnect
                    </button>
                  )}
              </div>
            </div>
            {client.connected && client.synthParams && (
              <div class="client-controls">
                <SynthControls
                  clientId={clientId}
                  params={client.synthParams}
                  onParamChange={(param, value) =>
                    onSynthParamChange(clientId, param, value)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
