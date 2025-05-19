// Preact component
import { h } from "preact";
import type { SynthClient } from "../../lib/types/client.ts";
import { SynthControls } from "./SynthControls.tsx";
import { useClientManagerContext } from "../../lib/contexts.ts";
import {
  SYNTH_PARAMS,
  SynthParamDescriptor,
} from "../../shared/synthParams.ts";
import {
  ControllerMode,
  KNOWN_CONTROLLER_MODES,
} from "../../shared/controllerModes.ts";

// We still accept props as fallback for when context is not available
interface ClientListProps {
  clients: Map<string, SynthClient>;
  onConnect: (clientId: string) => void;
  onDisconnect: (clientId: string) => void;
  onSynthParamChange: (clientId: string, param: string, value: unknown) => void;
  // New props for mode awareness
  paramDescriptors?: SynthParamDescriptor[];
  currentOperatingMode?: ControllerMode;
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
  const onDisconnect = clientManager?.disconnectFromClient ||
    props.onDisconnect;
  const onSynthParamChange = clientManager?.updateClientSynthParam ||
    props.onSynthParamChange;
  const clientsArray = Array.from(clients.entries());

  // Default to SYNTH mode if not specified
  const currentMode = props.currentOperatingMode || ControllerMode.SYNTH;

  // Use the provided paramDescriptors or fall back to standard SYNTH_PARAMS
  const paramDescriptors = props.paramDescriptors || SYNTH_PARAMS;

  // Check if we should show the per-client controls
  // (Don't show for Default Mode, only if we have descriptors for other modes)
  const shouldShowPerClientControls = currentMode !== ControllerMode.DEFAULT &&
    paramDescriptors &&
    paramDescriptors.length > 0;

  // Group parameters by their section prefix (for DEFAULT mode)
  const paramGroups = new Map<string, SynthParamDescriptor[]>();

  // Create parameter groups based on ID prefixes (global_, noise_, blips_, clicks_)
  paramDescriptors.forEach((param) => {
    const prefix = param.id.includes("_") ? param.id.split("_")[0] : "other";
    const groupName = prefix.charAt(0).toUpperCase() + prefix.slice(1);

    if (!paramGroups.has(groupName)) {
      paramGroups.set(groupName, []);
    }
    paramGroups.get(groupName)?.push(param);
  });

  // Convert map to array for rendering
  const paramGroupsArray = Array.from(paramGroups.entries());

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
            {client.connected && client.synthParams &&
              shouldShowPerClientControls && (
              <div class="client-controls">
                {/* If we're using parameter groups */}
                {paramGroupsArray.length > 1
                  ? (
                    // Render each parameter group in its own section
                    <div class="param-groups">
                      {paramGroupsArray.map(([groupName, params]) => (
                        <div key={groupName} class="param-group">
                          <h3 class="param-group-title">{groupName}</h3>
                          <SynthControls
                            idPrefix={`client_${clientId}`}
                            params={client.synthParams}
                            onParamChange={(param, value) =>
                              onSynthParamChange(clientId, param, value)}
                            paramDescriptors={params}
                          />
                        </div>
                      ))}
                    </div>
                  )
                  : (
                    // Standard SynthControls for simpler parameter sets
                    <SynthControls
                      idPrefix={`client_${clientId}`}
                      params={client.synthParams}
                      onParamChange={(param, value) =>
                        onSynthParamChange(clientId, param, value)}
                      paramDescriptors={paramDescriptors}
                    />
                  )}
              </div>
            )}
            {/* For Default Mode, just show minimal status */}
            {client.connected && client.synthParams &&
              !shouldShowPerClientControls && (
              <div class="client-minimal-status">
                <p>Client is receiving global Default Mode parameters</p>
                <p class="client-status-info">
                  Status:{" "}
                  {client.synthParams.oscillatorEnabled ? "Active" : "Standby"}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
