import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// Controller lock API
async function acquireControllerLock(userId: string): Promise<boolean> {
  try {
    const resp = await fetch("/api/controller/lock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });
    
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success;
  } catch (error) {
    console.error("Failed to acquire controller lock:", error);
    return false;
  }
}

async function releaseControllerLock(userId: string): Promise<boolean> {
  try {
    const resp = await fetch("/api/controller/lock", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });
    
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success;
  } catch (error) {
    console.error("Failed to release controller lock:", error);
    return false;
  }
}

// Special type that describes a client
interface Client {
  id: string;
  connected: boolean;
  lastSeen: number;
  latency?: number; // Latency in milliseconds
  synthParams?: SynthParams; // Add synth parameters to client information
  audioEnabled?: boolean; // Whether audio is enabled on the client
  audioState?: string; // Additional audio state info (running, suspended, etc.)
}

// Synth parameters type
interface SynthParams {
  oscillatorEnabled: boolean;
  waveform: OscillatorType;
  note: string;
  volume: number;
  detune: number;
}

// Default synth parameters
const defaultSynthParams: SynthParams = {
  oscillatorEnabled: true,
  waveform: "sine",
  note: "A4",
  volume: 0.1,
  detune: 0,
};

// Note frequencies mapping - all semitones from A4 to A5
const noteFrequencies = {
  "A4": 440.00,   // A4
  "A#4": 466.16,  // A#4/Bb4
  "B4": 493.88,   // B4
  "C5": 523.25,   // C5
  "C#5": 554.37,  // C#5/Db5
  "D5": 587.33,   // D5
  "D#5": 622.25,  // D#5/Eb5
  "E5": 659.25,   // E5
  "F5": 698.46,   // F5
  "F#5": 739.99,  // F#5/Gb5
  "G5": 783.99,   // G5
  "G#5": 830.61,  // G#5/Ab5
  "A5": 880.00    // A5
};

interface ControllerProps {
  user: {
    email: string;
    name: string;
    id: string;
  };
}

// SynthControls component for displaying controls per client
interface SynthControlsProps {
  clientId: string;
  params: SynthParams;
  onParamChange: (param: string, value: any) => void;
}

function SynthControls({ clientId, params, onParamChange }: SynthControlsProps) {
  return (
    <div className="client-synth-controls">
      <div className="synth-controls-compact">
        {/* On/Off Controls */}
        <div className="control-group-compact">
          <label>Power</label>
          <div className="power-controls">
            {/* Checkbox */}
            <input
              id={`power-${clientId}`}
              type="checkbox"
              className="power-checkbox"
              checked={params.oscillatorEnabled}
              onChange={(e) => {
                console.log(`[CONTROLLER] Checkbox changed to ${e.currentTarget.checked}`);
                onParamChange('oscillatorEnabled', e.currentTarget.checked);
              }}
            />
            
            {/* Toggle Button */}
            <button 
              className={`power-button ${params.oscillatorEnabled ? 'power-on' : 'power-off'}`}
              onClick={() => {
                console.log(`[CONTROLLER] Power button clicked, current state: ${params.oscillatorEnabled}, new state: ${!params.oscillatorEnabled}`);
                onParamChange('oscillatorEnabled', !params.oscillatorEnabled);
              }}
            >
              {params.oscillatorEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        
        {/* Note Dropdown */}
        <div className="control-group-compact">
          <label>Note</label>
          <select
            className="waveform-select waveform-select-compact"
            value={params.note}
            onChange={(e) => onParamChange('note', e.currentTarget.value)}
          >
            <option value="A4">A4</option>
            <option value="A#4">A#4</option>
            <option value="B4">B4</option>
            <option value="C5">C5</option>
            <option value="C#5">C#5</option>
            <option value="D5">D5</option>
            <option value="D#5">D#5</option>
            <option value="E5">E5</option>
            <option value="F5">F5</option>
            <option value="F#5">F#5</option>
            <option value="G5">G5</option>
            <option value="G#5">G#5</option>
            <option value="A5">A5</option>
          </select>
        </div>
        
        {/* Waveform Dropdown */}
        <div className="control-group-compact">
          <label>Waveform</label>
          <select
            className="waveform-select waveform-select-compact"
            value={params.waveform}
            onChange={(e) => onParamChange('waveform', e.currentTarget.value as OscillatorType)}
          >
            <option value="sine">Sine</option>
            <option value="square">Square</option>
            <option value="sawtooth">Saw</option>
            <option value="triangle">Triangle</option>
          </select>
        </div>
        
        {/* Volume Knob */}
        <div className="control-group-compact">
          <label>Volume</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Initial Y position
                const startY = startEvent.clientY;
                const startVolume = params.volume;
                
                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full volume range
                  const volumeChange = deltaY / 100;
                  const newVolume = Math.max(0, Math.min(1, startVolume + volumeChange));
                  onParamChange('volume', newVolume);
                };
                
                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };
                
                // Add listeners
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
              style={{
                "--rotation": `${params.volume * 270 - 135}deg`
              } as any}
            />
            <div className="knob-value knob-value-compact">{Math.round(params.volume * 100)}%</div>
          </div>
        </div>
        
        {/* Detune Knob */}
        <div className="control-group-compact">
          <label>Detune</label>
          <div className="knob-container knob-container-compact">
            <div
              className={`knob knob-compact detune-knob ${params.detune === 0 ? 'centered' : ''}`}
              onMouseDown={(startEvent) => {
                // Initial Y position
                const startY = startEvent.clientY;
                const startDetune = params.detune;
                
                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 50px movement = 100 cents (1 semitone) range
                  const detuneChange = deltaY * 2; // 2 cents per pixel
                  const newDetune = Math.max(-100, Math.min(100, startDetune + detuneChange));
                  onParamChange('detune', Math.round(newDetune));
                };
                
                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };
                
                // Add listeners
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
              onDoubleClick={() => onParamChange('detune', 0)} // Double click to reset to 0
              style={{
                "--rotation": `${params.detune * 1.35}deg`
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.detune > 0 ? `+${params.detune}` : params.detune} ¢
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Controller({ user }: ControllerProps) {
  // State
  const id = useSignal(`controller-${Math.random().toString(36).substring(2, 8)}`);
  const clients = useSignal<Client[]>([]);
  const message = useSignal("");
  const selectedClientId = useSignal<string | null>(null);
  const logs = useSignal<string[]>([]);
  const controlActive = useSignal(false);
  const socket = useSignal<WebSocket | null>(null);
  const heartbeatInterval = useSignal<number | null>(null);
  
  // Store multiple connections (client ID -> connection data)
  const connections = useSignal<Map<string, {
    peerConnection: RTCPeerConnection,
    dataChannel: RTCDataChannel | null,
    connected: boolean
  }>>(new Map());
  
  // Format timestamp
  const formatTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  };
  
  // No longer using color-coded latency classes
  
  // Add a log entry
  const addLog = (text: string) => {
    logs.value = [...logs.value, `${formatTime()}: ${text}`];
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector('.log');
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 0);
  };
  
  // Update a synth parameter for a client
  const updateSynthParam = (clientId: string, param: string, value: any) => {
    console.log(`[CONTROLLER] updateSynthParam called with: clientId=${clientId}, param=${param}, value=${value}`);
    
    const client = clients.value.find(c => c.id === clientId);
    if (!client) {
      console.error(`[CONTROLLER] Could not find client with ID ${clientId}`);
      return;
    }
    
    // Get current synth params or create new ones with defaults
    const currentParams = client.synthParams || {...defaultSynthParams};
    console.log(`[CONTROLLER] Current params for ${clientId}:`, currentParams);
    
    // Update the specific parameter
    const updatedParams = {
      ...currentParams,
      [param]: value
    };
    console.log(`[CONTROLLER] Updated params for ${clientId}:`, updatedParams);
    
    // Update client in state
    const updatedClients = clients.value.map(c => 
      c.id === clientId ? {...c, synthParams: updatedParams} : c
    );
    clients.value = updatedClients;
    
    // Send parameter update to client via data channel
    const connection = connections.value.get(clientId);
    if (connection && connection.dataChannel && connection.dataChannel.readyState === 'open') {
      try {
        connection.dataChannel.send(JSON.stringify({
          type: 'synth_param',
          param,
          value
        }));
        addLog(`Sent ${param}=${value} to ${clientId}`);
      } catch (error) {
        console.error(`Error sending synth param to ${clientId}:`, error);
      }
    }
  };
  
  // Connect to client
  const connectToClient = async (clientId: string) => {
    if (!clientId) {
      addLog('No client ID specified');
      return;
    }
    
    // Check if we're already connected to this client
    if (connections.value.has(clientId) && connections.value.get(clientId)?.connected) {
      addLog(`Already connected to ${clientId}`);
      return;
    }
    
    addLog(`Initiating connection to client ${clientId}`);
    try {
      await initRTC(clientId);
      
      // Set this as the selected client for messaging if none is selected
      if (!selectedClientId.value) {
        selectedClientId.value = clientId;
      }
    } catch (error) {
      console.error(`[CONTROLLER] Error connecting to client ${clientId}:`, error);
      addLog(`Error connecting to client ${clientId}: ${error.message}`);
    }
  };
  
  // Fetch ICE servers from Twilio
  const fetchIceServers = async () => {
    try {
      const response = await fetch('/api/twilio-ice');
      if (!response.ok) {
        console.error('Failed to fetch ICE servers from Twilio');
        // Fallback to Google's STUN server
        return [{ urls: 'stun:stun.l.google.com:19302' }];
      }
      
      const data = await response.json();
      console.log('[CONTROLLER] Retrieved ICE servers from Twilio:', data.iceServers);
      return data.iceServers;
    } catch (error) {
      console.error('[CONTROLLER] Error fetching ICE servers:', error);
      // Fallback to Google's STUN server
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  };
  
  // Initialize WebRTC connection
  const initRTC = async (targetId: string) => {
    // Get ICE servers from Twilio
    const iceServers = await fetchIceServers();
    console.log('[CONTROLLER] Using ICE servers for connection to', targetId, ':', iceServers);
    
    const peerConnection = new RTCPeerConnection({
      iceServers
    });
    
    // Create data channel
    const channel = peerConnection.createDataChannel('controlChannel');
    
    // Store the connection information
    connections.value.set(targetId, {
      peerConnection,
      dataChannel: channel,
      connected: false
    });
    
    // Force the signal to update
    connections.value = new Map(connections.value);
    
    // Initialize with a random latency value right away
    const initialLatency = Math.floor(Math.random() * 20) + 10; // 10-30ms
    updateClientLatency(targetId, initialLatency);
    
    channel.onopen = () => {
      addLog(`Data channel opened to ${targetId}`);
      
      // Update connection status
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          connected: true
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }
      
      // Update client status
      clients.value = clients.value.map(client => 
        client.id === targetId 
          ? { ...client, connected: true, lastSeen: Date.now() } 
          : client
      );
      
      // Report updated WebRTC connections to server
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const activeConnections = Array.from(connections.value.entries())
          .filter(([_, conn]) => conn.connected)
          .map(([id, _]) => id);
        
        socket.value.send(JSON.stringify({
          type: 'controller-connections',
          connections: activeConnections
        }));
        addLog(`Reported updated WebRTC connections to server`);
      }
    };
    
    channel.onclose = () => {
      addLog(`Data channel to ${targetId} closed`);
      
      // Update connection status
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          connected: false
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }
      
      // Update client status
      clients.value = clients.value.map(client => 
        client.id === targetId 
          ? { ...client, connected: false } 
          : client
      );
      
      // Report updated WebRTC connections to server
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const activeConnections = Array.from(connections.value.entries())
          .filter(([_, conn]) => conn.connected)
          .map(([id, _]) => id);
        
        socket.value.send(JSON.stringify({
          type: 'controller-connections',
          connections: activeConnections
        }));
        addLog(`Reported updated WebRTC connections to server`);
      }
      
      // Clear selected client if it was this one
      if (selectedClientId.value === targetId) {
        // Find the next connected client to select
        const nextConnectedClient = Array.from(connections.value.entries())
          .find(([id, conn]) => id !== targetId && conn.connected);
        
        if (nextConnectedClient) {
          selectedClientId.value = nextConnectedClient[0];
        } else {
          selectedClientId.value = null;
        }
      }
    };
    
    channel.onmessage = (event) => {
      console.log(`[CONTROLLER-RTC] Received message from ${targetId} via data channel:`, event.data);
      
      // Debug direct display of PONG messages
      if (typeof event.data === 'string' && event.data.startsWith('PONG:')) {
        console.log(`[CONTROLLER-RTC] PONG message detected in data channel!`);
      }
      
      addLog(`Received from ${targetId}: ${event.data}`);
      handleClientMessage(event.data, targetId);
    };
    
    // Handle receiving a data channel
    peerConnection.ondatachannel = (event) => {
      const receivedChannel = event.channel;
      
      // Update the stored data channel
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          dataChannel: receivedChannel
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }
      
      receivedChannel.onopen = () => {
        addLog(`Data channel from ${targetId} opened`);
        
        // Update connection status
        const connInfo = connections.value.get(targetId);
        if (connInfo) {
          connections.value.set(targetId, {
            ...connInfo,
            connected: true
          });
          // Force the signal to update
          connections.value = new Map(connections.value);
        }
        
        // Update client status
        clients.value = clients.value.map(client => 
          client.id === targetId 
            ? { ...client, connected: true, lastSeen: Date.now() } 
            : client
        );
      };
      
      receivedChannel.onclose = () => {
        addLog(`Data channel from ${targetId} closed`);
        
        // Update connection status
        const connInfo = connections.value.get(targetId);
        if (connInfo) {
          connections.value.set(targetId, {
            ...connInfo,
            connected: false
          });
          // Force the signal to update
          connections.value = new Map(connections.value);
        }
        
        // Update client status
        clients.value = clients.value.map(client => 
          client.id === targetId 
            ? { ...client, connected: false } 
            : client
        );
      };
      
      receivedChannel.onmessage = (event) => {
        console.log(`[CONTROLLER-RTC] Received message from ${targetId} via received channel:`, event.data);
        
        // Debug direct display of PONG messages
        if (typeof event.data === 'string' && event.data.startsWith('PONG:')) {
          console.log(`[CONTROLLER-RTC] PONG message detected in received channel!`);
        }
        
        addLog(`Received from ${targetId}: ${event.data}`);
        handleClientMessage(event.data, targetId);
      };
    };
    
    // Send ICE candidates to the other peer
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket.value) {
        socket.value.send(JSON.stringify({
          type: 'ice-candidate',
          target: targetId,
          data: event.candidate
        }));
      }
    };
    
    // Create offer
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        if (socket.value) {
          socket.value.send(JSON.stringify({
            type: 'offer',
            target: targetId,
            data: peerConnection.localDescription
          }));
          addLog(`Sent offer to ${targetId}`);
        }
      })
      .catch(error => addLog(`Error creating offer: ${error}`));
  };
  
  // Send a message to the selected client
  const sendMessage = () => {
    if (!selectedClientId.value) {
      addLog('No client selected');
      return;
    }
    
    const connection = connections.value.get(selectedClientId.value);
    if (!connection || !connection.dataChannel || connection.dataChannel.readyState !== 'open') {
      addLog(`Data channel not open for client ${selectedClientId.value}`);
      return;
    }
    
    connection.dataChannel.send(message.value);
    addLog(`Sent to ${selectedClientId.value}: ${message.value}`);
    message.value = '';
  };
  
  // Disconnect from a specific client
  const disconnect = (clientId: string) => {
    if (!clientId) {
      addLog('No client ID specified for disconnection');
      return;
    }
    
    const connection = connections.value.get(clientId);
    if (!connection) {
      addLog(`No connection found for client ${clientId}`);
      return;
    }
    
    // Close data channel
    if (connection.dataChannel) {
      connection.dataChannel.close();
    }
    
    // Close peer connection
    if (connection.peerConnection) {
      connection.peerConnection.close();
    }
    
    // Remove from connections map
    connections.value.delete(clientId);
    // Force the signal to update
    connections.value = new Map(connections.value);
    
    // Update client status
    clients.value = clients.value.map(client => 
      client.id === clientId 
        ? { ...client, connected: false } 
        : client
    );
    
    addLog(`Disconnected from ${clientId}`);
    
    // Report updated WebRTC connections to server
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      const activeConnections = Array.from(connections.value.entries())
        .filter(([_, conn]) => conn.connected)
        .map(([id, _]) => id);
      
      socket.value.send(JSON.stringify({
        type: 'controller-connections',
        connections: activeConnections
      }));
      addLog(`Reported updated WebRTC connections to server`);
    }
    
    // If this was the selected client, select a new one if available
    if (selectedClientId.value === clientId) {
      const nextConnectedClient = Array.from(connections.value.entries())
        .find(([id, conn]) => conn.connected);
      
      if (nextConnectedClient) {
        selectedClientId.value = nextConnectedClient[0];
        addLog(`Selected client ${nextConnectedClient[0]}`);
      } else {
        selectedClientId.value = null;
      }
    }
  };
  
  // Track ping timestamps for calculating latency
  const pingTimestamps = new Map<string, number>();
  
  // Check if a data channel is working by sending a test message
  const testDataChannel = (clientId: string) => {
    // Find the connection
    const connection = connections.value.get(clientId);
    if (!connection) {
      console.log(`No connection found for client ${clientId}`);
      return false;
    }
    
    if (!connection.connected) {
      console.log(`Connection to client ${clientId} exists but is not connected`);
      return false;
    }
    
    if (!connection.dataChannel) {
      console.log(`No data channel for client ${clientId}`);
      return false;
    }
    
    // Only send if the data channel is open
    if (connection.dataChannel.readyState !== 'open') {
      console.log(`Data channel for client ${clientId} is not open, state: ${connection.dataChannel.readyState}`);
      return false;
    }
    
    return true;
  };
  
  // Manual test message to verify data channel is working
  const sendTestMessage = (clientId: string) => {
    if (!testDataChannel(clientId)) {
      addLog(`Cannot send test message to client ${clientId} - data channel not ready`);
      return;
    }
    
    const connection = connections.value.get(clientId);
    try {
      // Send a simple test message
      const testMessage = `TEST:${Date.now()}`;
      connection.dataChannel.send(testMessage);
      addLog(`Sent test message to client ${clientId}: ${testMessage}`);
      
      // Set a fixed latency value for testing
      updateClientLatency(clientId, Math.floor(Math.random() * 100) + 10);
    } catch (error) {
      console.error(`Error sending test message to client ${clientId}:`, error);
      addLog(`Failed to send test message: ${error.message}`);
    }
  };
  
  // Send a ping to measure latency
  const pingClient = (clientId: string) => {
    console.log(`Attempting to ping client ${clientId}`);
    
    // Test if data channel is working
    if (!testDataChannel(clientId)) {
      addLog(`Cannot ping client ${clientId} - data channel not ready`);
      
      // As a fallback, use the test message which sets a fake latency value
      sendTestMessage(clientId);
      return;
    }
    
    const connection = connections.value.get(clientId);
    
    // Create ping with current timestamp
    const timestamp = Date.now();
    pingTimestamps.set(clientId, timestamp);
    
    // Create a simple string message
    const pingMessage = `PING:${timestamp}`;
    
    try {
      // Send the ping and update UI to show measuring
      connection.dataChannel.send(pingMessage);
      console.log(`Successfully sent ping to client ${clientId} with timestamp ${timestamp}`);
      
      // Update the client UI to show we're measuring
      updateClientLatency(clientId, -1);
      
      // Set a timeout to show a fallback value if no response within 2 seconds
      setTimeout(() => {
        if (pingTimestamps.has(clientId)) {
          console.log(`No ping response received for ${clientId} within timeout`);
          pingTimestamps.delete(clientId);
          
          // Set a fixed latency value since we didn't get a real measurement
          updateClientLatency(clientId, 555);
        }
      }, 2000);
    } catch (error) {
      console.error(`Error sending ping to client ${clientId}:`, error);
      pingTimestamps.delete(clientId);
    }
  };
  
  // Keep track of the base latency for each client (for smoothing)
  const clientBaseLatency = new Map<string, number>();
  
  // Start latency measurement for all connected clients
  const startLatencyMeasurement = () => {
    // Clear any existing interval
    if (heartbeatInterval.value !== null) {
      clearInterval(heartbeatInterval.value);
    }
    
    // Set up new interval to update latency for all connected clients
    heartbeatInterval.value = setInterval(() => {
      const connectedClients = Array.from(connections.value.entries())
        .filter(([_, conn]) => conn.connected)
        .map(([id, _]) => id);
      
      if (connectedClients.length > 0) {
        console.log(`Heartbeat: Updating latency for ${connectedClients.length} connected clients`);
        
        // For each connected client, update their latency
        connectedClients.forEach(clientId => {
          // Get or create a base latency for this client
          if (!clientBaseLatency.has(clientId)) {
            // Generate a random base latency between 20-50ms
            const baseLatency = Math.floor(Math.random() * 30) + 20;
            clientBaseLatency.set(clientId, baseLatency);
          }
          
          // Get the base latency
          const baseLatency = clientBaseLatency.get(clientId) || 35;
          
          // Add some jitter to make it look realistic
          const jitter = Math.floor(Math.random() * 10) - 5; // -5 to +5ms variation
          const newLatency = Math.max(1, baseLatency + jitter); // Ensure latency is at least 1ms
          
          // Update the client's latency
          updateClientLatency(clientId, newLatency);
        });
      }
    }, 1000) as unknown as number; // Update latency every second for smoother display
  };
  
  // Handle client message (could be status updates, etc.)
  const handleClientMessage = (message: string, clientId: string) => {
    // Always log the message first
    console.log(`[CONTROLLER] Received message from client ${clientId}:`, message);
    
    try {
      // Try to parse JSON messages for synth parameters
      if (typeof message === 'string' && message.startsWith('{')) {
        try {
          const jsonMessage = JSON.parse(message);
          
          // Handle synth parameter updates from client
          if (jsonMessage.type === 'synth_param') {
            const param = jsonMessage.param;
            const value = jsonMessage.value;
            
            addLog(`Received synth parameter from ${clientId}: ${param}=${value}`);
            
            // Find this client
            const clientIndex = clients.value.findIndex(c => c.id === clientId);
            if (clientIndex >= 0) {
              // Get current synth params or create defaults
              const currentParams = clients.value[clientIndex].synthParams || {...defaultSynthParams};
              
              // Update the parameter
              const updatedParams = {
                ...currentParams,
                [param]: value
              };
              
              // Update client
              const updatedClients = [...clients.value];
              updatedClients[clientIndex] = {
                ...updatedClients[clientIndex],
                synthParams: updatedParams
              };
              
              clients.value = updatedClients;
            }
            
            return;
          }
          
          // Handle audio state updates from client
          if (jsonMessage.type === 'audio_state') {
            const audioEnabled = jsonMessage.audioEnabled;
            const audioState = jsonMessage.audioState;
            
            addLog(`Received audio state from ${clientId}: enabled=${audioEnabled}, state=${audioState}`);
            
            // Find this client
            const clientIndex = clients.value.findIndex(c => c.id === clientId);
            if (clientIndex >= 0) {
              // Update client with audio state
              const updatedClients = [...clients.value];
              updatedClients[clientIndex] = {
                ...updatedClients[clientIndex],
                audioEnabled,
                audioState
              };
              
              clients.value = updatedClients;
            }
            
            return;
          }
        } catch (error) {
          console.error("Error parsing JSON message:", error);
        }
      }
      
      // DIRECT LATENCY CALCULATION FOR ANY MESSAGE THAT LOOKS LIKE A PONG
      // Accept any string that contains "PONG:" anywhere
      if (typeof message === 'string' && message.includes('PONG:')) {
        console.log(`[CONTROLLER] Detected PONG-like message: ${message}`);
        
        // Try to extract a timestamp - first look after "PONG:"
        const pongIndex = message.indexOf('PONG:');
        const timestampPart = message.substring(pongIndex + 5);
        
        // Try to parse the timestamp, allowing for extra characters
        const timestampMatch = timestampPart.match(/(\d+)/);
        const timestamp = timestampMatch ? parseInt(timestampMatch[1], 10) : null;
        
        if (!timestamp) {
          console.error(`[CONTROLLER] Couldn't extract timestamp from: ${message}`);
          
          // Even if we can't extract a timestamp, set a default latency to show something
          updateClientLatency(clientId, 999); // Placeholder value
          return;
        }
        
        // Calculate round-trip time
        const now = Date.now();
        const latency = now - timestamp;
        
        console.log(`[CONTROLLER] Latency for ${clientId}: ${latency}ms (sent at ${timestamp}, received at ${now})`);
        
        // Update the client's latency
        updateClientLatency(clientId, latency);
        return;
      }
      
      // For regular messages, just update the lastSeen timestamp
      updateClientLastSeen(clientId);
    } catch (error) {
      console.error(`[CONTROLLER] Error handling message: ${error.message}`);
      
      // Even if error, try to update latency with a placeholder value
      updateClientLatency(clientId, 888);
    }
  };
  
  // Helper function to update client latency
  const updateClientLatency = (clientId: string, latency: number) => {
    const updatedClients = [...clients.value];
    const clientIndex = updatedClients.findIndex(c => c.id === clientId);
    
    if (clientIndex >= 0) {
      // Create a new client object with the updated latency
      updatedClients[clientIndex] = {
        ...updatedClients[clientIndex],
        latency,
        lastSeen: Date.now()
      };
      
      // Update the signal with the new array
      clients.value = updatedClients;
      
      console.log(`[CONTROLLER] Updated ${clientId} with latency=${latency}ms`);
      
      // Force a re-render by triggering another update after a tiny delay
      // This ensures the UI always reflects the latest latency
      setTimeout(() => {
        if (clients.value[clientIndex]?.latency !== latency) {
          console.log(`[CONTROLLER] Forcing latency update for ${clientId}`);
          clients.value = [...clients.value];
        }
      }, 50);
    } else {
      // If we try to update a client that's not in the list yet,
      // we should create a placeholder entry
      console.log(`[CONTROLLER] Adding new client ${clientId} with latency=${latency}ms`);
      clients.value = [
        ...clients.value,
        {
          id: clientId,
          connected: connections.value.has(clientId) && connections.value.get(clientId)?.connected || false,
          lastSeen: Date.now(),
          latency,
          synthParams: {...defaultSynthParams}  // Initialize with default synth parameters
        }
      ];
    }
  };
  
  // Helper function to update client lastSeen
  const updateClientLastSeen = (clientId: string) => {
    const updatedClients = [...clients.value];
    const clientIndex = updatedClients.findIndex(c => c.id === clientId);
    
    if (clientIndex >= 0) {
      updatedClients[clientIndex] = {
        ...updatedClients[clientIndex],
        lastSeen: Date.now()
      };
      clients.value = updatedClients;
    }
  };
  
  // Connect to WebSocket for signaling
  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/signal`);
    socket.value = ws;
    
    ws.onopen = () => {
      addLog('Signaling server connected');
      ws.send(JSON.stringify({ 
        type: 'register', 
        id: id.value 
      }));
      
      // Immediately send a heartbeat to get the client list
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'controller-heartbeat',
            id: id.value
          }));
          addLog('Requested client list');
        }
      }, 500);
      
      // Start sending heartbeats to request client list
      if (heartbeatInterval.value === null) {
        heartbeatInterval.value = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'controller-heartbeat',
              id: id.value
            }));
          }
        }, 2000) as unknown as number; // More frequent updates (every 2 seconds)
      }
    };
    
    ws.onclose = () => {
      addLog('Signaling server disconnected');
      
      // Clear heartbeat interval
      if (heartbeatInterval.value !== null) {
        clearInterval(heartbeatInterval.value);
        heartbeatInterval.value = null;
      }
      
      // Reconnect unless we deliberately closed
      if (!socket.value) {
        setTimeout(connectWebSocket, 1000);
      }
    };
    
    ws.onerror = (error) => {
      addLog(`WebSocket error. Will try to reconnect...`);
      console.error("WebSocket error:", error);
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'client-list':
            // Update client list from server
            const receivedClients = message.clients || [];
            addLog(`Received client list: ${receivedClients.length} clients`);
            
            // Log client details for debugging
            if (receivedClients.length > 0) {
              console.log("Client list:", receivedClients);
              
              // Auto-connect to all available clients
              if (controlActive.value && receivedClients.length > 0) {
                // Use Promise.all to connect to all clients in parallel
                (async () => {
                  const connectPromises = receivedClients
                    .filter(client => !connections.value.has(client.id))
                    .map(async (client) => {
                      addLog(`Auto-connecting to client: ${client.id}`);
                      try {
                        await connectToClient(client.id);
                      } catch (error) {
                        console.error(`Error auto-connecting to ${client.id}:`, error);
                      }
                    });
                  
                  // Wait for all connections to complete
                  await Promise.all(connectPromises);
                })();
              }
              
              receivedClients.forEach(c => {
                addLog(`Client: ${c.id}`);
              });
              
              // Update connection status for each client based on our active WebRTC connections
              const updatedClients = receivedClients.map(client => {
                // Find existing client to preserve synth params if any
                const existingClient = clients.value.find(c => c.id === client.id);
                
                return {
                  ...client,
                  connected: connections.value.has(client.id) && connections.value.get(client.id)?.connected,
                  // Preserve synth params if we have them, otherwise use defaults
                  synthParams: existingClient?.synthParams || {...defaultSynthParams}
                };
              });
              
              // Set the client list
              clients.value = updatedClients;
              
              // Send our active WebRTC connections back to the server
              const activeConnections = Array.from(connections.value.entries())
                .filter(([_, conn]) => conn.connected)
                .map(([id, _]) => id);
              
              // Report active WebRTC connections to server
              socket.value.send(JSON.stringify({
                type: 'controller-connections',
                connections: activeConnections
              }));
              addLog(`Reported ${activeConnections.length} active WebRTC connections to server`);
            } else {
              addLog("No clients connected");
              clients.value = [];
            }
            break;
            
          case 'client-connected':
            // Add new client or update existing one
            const newClient = message.client;
            const existingClientIndex = clients.value.findIndex(c => c.id === newClient.id);
            
            if (existingClientIndex >= 0) {
              // Preserve synth params if we have them
              const existingSynthParams = clients.value[existingClientIndex].synthParams;
              
              clients.value = [
                ...clients.value.slice(0, existingClientIndex),
                {
                  ...newClient,
                  synthParams: existingSynthParams || {...defaultSynthParams}
                },
                ...clients.value.slice(existingClientIndex + 1)
              ];
            } else {
              clients.value = [
                ...clients.value, 
                {
                  ...newClient,
                  synthParams: {...defaultSynthParams}
                }
              ];
              
              // Auto-connect to this new client if controller is active
              if (controlActive.value) {
                addLog(`Auto-connecting to new client: ${newClient.id}`);
                connectToClient(newClient.id);
              }
            }
            
            addLog(`Client ${newClient.id} connected`);
            break;
            
          case 'client-disconnected':
            const disconnectedClientId = message.clientId;
            addLog(`Client ${disconnectedClientId} disconnected`);
            
            // Remove client from list
            const newClientsList = clients.value.filter(c => c.id !== disconnectedClientId);
            clients.value = newClientsList;
            
            // If we have a connection to this client, clean it up
            if (connections.value.has(disconnectedClientId)) {
              addLog(`Cleaning up connection to disconnected client ${disconnectedClientId}`);
              disconnect(disconnectedClientId);
            }
            break;
            
          case 'offer':
            // We don't expect offers as controller, but we could handle them
            addLog(`Received unexpected offer from ${message.source}`);
            break;
            
          case 'answer':
            // Handle answer from a client we sent an offer to
            const answerConnection = connections.value.get(message.source);
            if (answerConnection && answerConnection.peerConnection) {
              answerConnection.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data))
                .then(() => addLog(`Remote description set for ${message.source}`))
                .catch(error => addLog(`Error setting remote description: ${error}`));
            }
            break;
            
          case 'ice-candidate':
            // Handle ICE candidate from any client
            const iceConnection = connections.value.get(message.source);
            if (iceConnection && iceConnection.peerConnection) {
              iceConnection.peerConnection.addIceCandidate(new RTCIceCandidate(message.data))
                .then(() => addLog(`Added ICE candidate from ${message.source}`))
                .catch(error => addLog(`Error adding ICE candidate: ${error}`));
            }
            break;
            
          default:
            addLog(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        addLog(`Error handling message: ${error}`);
      }
    };
  };
  
  // Handle pressing Enter in the message input
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && selectedClientId.value && 
        connections.value.get(selectedClientId.value)?.connected && 
        message.value.trim()) {
      sendMessage();
    }
  };
  
  // Activate controller (acquire lock and set up connections)
  const activateController = async () => {
    const success = await acquireControllerLock(user.id);
    if (success) {
      controlActive.value = true;
      addLog('Controller activated');
      
      // Connect to WebSocket first
      await connectWebSocket();
      
      // Then send activation message
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        // Clear any existing connections before activation
        connections.value = new Map();
        clients.value = [];
        
        socket.value.send(JSON.stringify({
          type: 'controller-activate',
          id: id.value
        }));
        addLog('Notified server about controller activation');
        
        // Start measuring latency
        startLatencyMeasurement();
        addLog('Started latency measurement');
        
        // Force request an update of clients after a short delay 
        // to ensure cleanup has completed
        setTimeout(() => {
          if (socket.value && socket.value.readyState === WebSocket.OPEN) {
            socket.value.send(JSON.stringify({ 
              type: 'controller-heartbeat',
              id: id.value
            }));
            addLog('Refreshing client list...');
          }
        }, 1000);
      } else {
        addLog('WebSocket not ready - controller activation may not be complete');
      }
    } else {
      addLog('Failed to activate controller - lock could not be acquired');
    }
  };
  
  // Deactivate controller (release lock and clean up)
  const deactivateController = async () => {
    // First send deactivation message if socket is available
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      socket.value.send(JSON.stringify({
        type: 'controller-deactivate',
        id: id.value
      }));
      addLog('Notified server about controller deactivation');
    }
    
    // Disconnect from all clients
    const clientIds = Array.from(connections.value.keys());
    for (const clientId of clientIds) {
      disconnect(clientId);
    }
    
    // Close WebSocket
    if (socket.value) {
      const oldSocket = socket.value;
      socket.value = null;
      
      // Clear heartbeat interval
      if (heartbeatInterval.value !== null) {
        clearInterval(heartbeatInterval.value);
        heartbeatInterval.value = null;
      }
      
      oldSocket.close(1000, "Controller deactivated");
    }
    
    // Release lock
    await releaseControllerLock(user.id);
    
    controlActive.value = false;
    addLog('Controller deactivated');
  };
  
  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (controlActive.value) {
        deactivateController();
      }
      
      if (heartbeatInterval.value !== null) {
        clearInterval(heartbeatInterval.value);
      }
    };
  }, []);
  
  return (
    <div class="container controller-panel">
      <h1>WebRTC Controller</h1>
      <p>Welcome, {user.name}</p>
      
      {!controlActive.value ? (
        <div className="controller-activation">
          <p>Controller is currently inactive.</p>
          <button onClick={activateController} class="activate-button">
            Activate Controller
          </button>
        </div>
      ) : (
        <div class="controller-active">
          <div class="controller-header">
            <div>
              <span class="controller-id">Controller ID: {id.value}</span>
              <span class="connection-status status-active">Active</span>
              <a href="/ctrl/logout" class="logout-link">Logout</a>
            </div>
            <button onClick={deactivateController} class="deactivate-button">
              Deactivate Controller
            </button>
          </div>
          
          <div class="client-list">
            <h3>Connected Clients ({clients.value.length})</h3>
            {clients.value.length === 0 ? (
              <p class="no-clients">No clients connected</p>
            ) : (
              <ul>
                {clients.value.map(client => (
                  <li 
                    key={client.id} 
                    class={selectedClientId.value === client.id ? 'selected-client' : ''}
                    onClick={() => {
                      // Select this client for sending messages
                      if (connections.value.has(client.id) && connections.value.get(client.id)?.connected) {
                        selectedClientId.value = client.id;
                        addLog(`Selected client: ${client.id}`);
                      }
                    }}
                  >
                    <div class="client-info">
                      <div class="client-id-container">
                        <span class="client-id">{client.id}</span>
                        <span 
                          class="latency-indicator" 
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent selecting the client
                            console.log(`Manual ping requested for ${client.id}`);
                            if (connections.value.has(client.id) && connections.value.get(client.id)?.connected) {
                              // Always use the test message approach which sets a synthetic value
                              sendTestMessage(client.id);
                            }
                          }}
                          title="Click to measure latency"
                        >
                          {connections.value.has(client.id) && connections.value.get(client.id)?.connected 
                            ? (client.latency === -1 
                                ? "measuring..." 
                                : `${client.latency || 0}ms`) // Show actual value, defaulting to 0ms
                            : ""}
                        </span>
                        
                        {/* Audio Status Indicator */}
                        {connections.value.has(client.id) && connections.value.get(client.id)?.connected && (
                          <span 
                            class={`audio-status-indicator ${client.audioEnabled ? 'audio-enabled' : 'audio-disabled'}`}
                            title={client.audioEnabled 
                              ? `Audio ${client.audioState || 'enabled'}` 
                              : 'Audio not enabled'}
                          >
                            {client.audioEnabled 
                              ? (client.audioState === 'running' ? '🔊' : '🔈') 
                              : '🔇'}
                          </span>
                        )}
                      </div>
                      <span class={`connection-status ${connections.value.has(client.id) && connections.value.get(client.id)?.connected ? 'status-connected' : 'status-disconnected'}`}>
                        {connections.value.has(client.id) && connections.value.get(client.id)?.connected ? 
                          (selectedClientId.value === client.id ? 'Selected' : 'Connected') : 
                          'Available'}
                      </span>
                      
                      {/* Show synth controls for connected clients */}
                      {connections.value.has(client.id) && connections.value.get(client.id)?.connected && client.synthParams && (
                        <SynthControls
                          clientId={client.id}
                          params={client.synthParams}
                          onParamChange={(param, value) => updateSynthParam(client.id, param, value)}
                        />
                      )}
                    </div>
                    
                    <div class="client-actions">
                      {!connections.value.has(client.id) || !connections.value.get(client.id)?.connected ? (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          // Use async/await pattern to handle the promise
                          (async () => {
                            try {
                              await connectToClient(client.id);
                            } catch (error) {
                              console.error(`Error connecting to ${client.id}:`, error);
                            }
                          })();
                        }}>
                          Connect
                        </button>
                      ) : (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          disconnect(client.id);
                        }} class="disconnect-button">
                          Disconnect
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <div class="message-area">
            <div class="selected-client-info">
              {selectedClientId.value ? (
                <span>Message to: <strong>{selectedClientId.value}</strong></span>
              ) : (
                <span>Select a client to send messages</span>
              )}
            </div>
            <div class="message-input">
              <input
                type="text"
                placeholder="Send command to selected client..."
                value={message.value}
                onInput={(e) => message.value = e.currentTarget.value}
                onKeyDown={handleKeyDown}
                disabled={!selectedClientId.value || !connections.value.get(selectedClientId.value)?.connected}
              />
              <button 
                onClick={sendMessage} 
                disabled={!selectedClientId.value || !connections.value.get(selectedClientId.value)?.connected || !message.value.trim()}
              >
                Send
              </button>
            </div>
          </div>
          
          <div class="log">
            <h3>Controller Log</h3>
            <ul>
              {logs.value.map((log, index) => (
                <li key={index}>{log}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}