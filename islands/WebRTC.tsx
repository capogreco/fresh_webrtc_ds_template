import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// Audio context for the synth
let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;

export default function WebRTC() {
  // State management
  const id = useSignal(Math.random().toString(36).substring(2, 8))
  const targetId = useSignal("")
  const connected = useSignal(false)
  const message = useSignal("")
  const logs = useSignal<string[]>([])
  const connection = useSignal<RTCPeerConnection | null>(null)
  const dataChannel = useSignal<RTCDataChannel | null>(null)
  const socket = useSignal<WebSocket | null>(null)
  const activeController = useSignal<string | null>(null)
  const autoConnectAttempted = useSignal(false)
  
  // Audio context state
  const audioEnabled = useSignal(false)
  const audioState = useSignal<string>("suspended")
  const showAudioButton = useSignal(true) // Start by showing the enable audio button
  
  // Synth parameters
  const frequency = useSignal(440) // A4 note
  const waveform = useSignal<OscillatorType>("sine")
  const volume = useSignal(0.1) // 0-1 range
  const oscillatorEnabled = useSignal(true) // On/off state for oscillator
  const detune = useSignal(0) // Detune value in cents (-100 to +100, represents -1 to +1 semitones)
  const currentNote = useSignal("A4") // Current note name
  
  // Format timestamp
  const formatTime = () => {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const seconds = now.getSeconds().toString().padStart(2, '0')
    const ms = now.getMilliseconds().toString().padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${ms}`
  }
  
  // Add a log entry
  const addLog = (text: string) => {
    logs.value = [...logs.value, `${formatTime()}: ${text}`]
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector('.log')
      if (logEl) logEl.scrollTop = logEl.scrollHeight
    }, 0)
  }
  
  // Connect to the target peer
  const connect = async () => {
    if (!targetId.value) {
      addLog('Please enter a target ID')
      return
    }
    
    await initRTC()
  }
  
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
      console.log('Retrieved ICE servers from Twilio:', data.iceServers);
      return data.iceServers;
    } catch (error) {
      console.error('Error fetching ICE servers:', error);
      // Fallback to Google's STUN server
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  };
  
  // Initialize the WebRTC connection
  const initRTC = async () => {
    // Get ICE servers from Twilio
    const iceServers = await fetchIceServers();
    console.log('Using ICE servers:', iceServers);
    
    const peerConnection = new RTCPeerConnection({
      iceServers
    });
    connection.value = peerConnection
    
    // Create data channel
    const channel = peerConnection.createDataChannel('dataChannel')
    dataChannel.value = channel
    
    channel.onopen = () => {
      addLog('Data channel opened')
      connected.value = true
      
      // Send current synth parameters to the controller
      if (audioEnabled.value) {
        try {
          // Send frequency
          channel.send(JSON.stringify({
            type: 'synth_param',
            param: 'frequency',
            value: frequency.value
          }));
          
          // Send waveform
          channel.send(JSON.stringify({
            type: 'synth_param',
            param: 'waveform',
            value: waveform.value
          }));
          
          // Send volume
          channel.send(JSON.stringify({
            type: 'synth_param',
            param: 'volume',
            value: volume.value
          }));
          
          // Send oscillator enabled state
          channel.send(JSON.stringify({
            type: 'synth_param',
            param: 'oscillatorEnabled',
            value: oscillatorEnabled.value
          }));
          
          // Send note
          channel.send(JSON.stringify({
            type: 'synth_param',
            param: 'note',
            value: currentNote.value
          }));
          
          // Send detune
          channel.send(JSON.stringify({
            type: 'synth_param',
            param: 'detune',
            value: detune.value
          }));
          
          // Send audio state
          channel.send(JSON.stringify({
            type: 'audio_state',
            audioEnabled: audioEnabled.value,
            audioState: audioState.value
          }));
          
          addLog('Sent synth parameters and audio state to controller');
        } catch (error) {
          console.error("Error sending synth parameters:", error);
        }
      } else {
        // Even if audio is not enabled, send the audio state
        try {
          channel.send(JSON.stringify({
            type: 'audio_state',
            audioEnabled: false,
            audioState: 'disabled'
          }));
          addLog('Sent audio state to controller (audio not enabled)');
        } catch (error) {
          console.error("Error sending audio state:", error);
        }
      }
    }
    
    channel.onclose = () => {
      addLog('Data channel closed')
      connected.value = false
    }
    
    channel.onmessage = (event) => {
      console.log("[CLIENT] Received message:", event.data);
      
      // Try to parse JSON messages
      if (typeof event.data === 'string' && event.data.startsWith('{')) {
        try {
          const message = JSON.parse(event.data);
          
          // Handle synth parameter update messages
          if (message.type === 'synth_param') {
            switch (message.param) {
              case 'frequency':
                updateFrequency(Number(message.value));
                addLog(`Frequency updated to ${message.value}Hz by controller`);
                break;
              case 'waveform':
                updateWaveform(message.value as OscillatorType);
                addLog(`Waveform updated to ${message.value} by controller`);
                break;
              case 'volume':
                updateVolume(Number(message.value));
                addLog(`Volume updated to ${message.value} by controller`);
                break;
              default:
                addLog(`Unknown synth parameter: ${message.param}`);
            }
            return;
          }
        } catch (error) {
          console.error("Error parsing JSON message:", error);
          // Continue with non-JSON message handling
        }
      }
      
      // SUPER SIMPLE PING HANDLING
      // Instead of any complex parsing, just send back exactly what we receive
      // with "PONG" instead of "PING"
      if (typeof event.data === 'string' && event.data.startsWith('PING:')) {
        console.log("[CLIENT] PING detected!");
        
        // Create pong response by replacing PING with PONG
        const pongMessage = event.data.replace('PING:', 'PONG:');
        console.log("[CLIENT] Sending PONG:", pongMessage);
        
        // Send the response immediately
        try {
          // Add a small delay to ensure message is processed
          setTimeout(() => {
            try {
              channel.send(pongMessage);
              console.log("[CLIENT] PONG sent successfully");
              addLog(`Responded with ${pongMessage}`);
            } catch (e) {
              console.error("[CLIENT] Failed to send delayed PONG:", e);
            }
          }, 10);
          
          // Also try sending immediately
          channel.send(pongMessage);
          console.log("[CLIENT] PONG sent immediately");
        } catch (error) {
          console.error("[CLIENT] Error sending PONG:", error);
          addLog(`Failed to respond to ping: ${error.message}`);
        }
        return;
      }
      
      // Also handle TEST messages for debug purposes
      if (typeof event.data === 'string' && event.data.startsWith('TEST:')) {
        console.log("[CLIENT] TEST message detected!");
        
        // Reply with the same test message
        try {
          // Echo back the test message
          channel.send(`ECHOED:${event.data}`);
          console.log("[CLIENT] Echoed test message");
          addLog(`Echoed test message`);
        } catch (error) {
          console.error("[CLIENT] Error echoing test message:", error);
          addLog(`Failed to echo test message: ${error.message}`);
        }
        return;
      }
      
      // Regular message
      addLog(`Received: ${event.data}`);
    }
    
    // Handle receiving a data channel
    peerConnection.ondatachannel = (event) => {
      const receivedChannel = event.channel
      dataChannel.value = receivedChannel
      
      receivedChannel.onopen = () => {
        addLog('Data channel opened (received)')
        connected.value = true
        
        // Send current synth parameters to the controller
        if (audioEnabled.value) {
          try {
            // Send frequency
            receivedChannel.send(JSON.stringify({
              type: 'synth_param',
              param: 'frequency',
              value: frequency.value
            }));
            
            // Send waveform
            receivedChannel.send(JSON.stringify({
              type: 'synth_param',
              param: 'waveform',
              value: waveform.value
            }));
            
            // Send volume
            receivedChannel.send(JSON.stringify({
              type: 'synth_param',
              param: 'volume',
              value: volume.value
            }));
            
            // Send oscillator enabled state
            receivedChannel.send(JSON.stringify({
              type: 'synth_param',
              param: 'oscillatorEnabled',
              value: oscillatorEnabled.value
            }));
            
            // Send note
            receivedChannel.send(JSON.stringify({
              type: 'synth_param',
              param: 'note',
              value: currentNote.value
            }));
            
            // Send detune
            receivedChannel.send(JSON.stringify({
              type: 'synth_param',
              param: 'detune',
              value: detune.value
            }));
            
            // Send audio state
            receivedChannel.send(JSON.stringify({
              type: 'audio_state',
              audioEnabled: audioEnabled.value,
              audioState: audioState.value
            }));
            
            addLog('Sent synth parameters and audio state to controller');
          } catch (error) {
            console.error("Error sending synth parameters:", error);
          }
        } else {
          // Even if audio is not enabled, send the audio state
          try {
            receivedChannel.send(JSON.stringify({
              type: 'audio_state',
              audioEnabled: false,
              audioState: 'disabled'
            }));
            addLog('Sent audio state to controller (audio not enabled)');
          } catch (error) {
            console.error("Error sending audio state:", error);
          }
        }
      }
      
      receivedChannel.onclose = () => {
        addLog('Data channel closed (received)')
        connected.value = false
      }
      
      receivedChannel.onmessage = (event) => {
        console.log("[CLIENT-RECEIVED] Received message:", event.data);
        
        // Try to parse JSON messages
        if (typeof event.data === 'string' && event.data.startsWith('{')) {
          try {
            const message = JSON.parse(event.data);
            
            // Handle synth parameter update messages
            if (message.type === 'synth_param') {
              switch (message.param) {
                case 'frequency':
                  updateFrequency(Number(message.value));
                  addLog(`Frequency updated to ${message.value}Hz by controller`);
                  break;
                case 'waveform':
                  updateWaveform(message.value as OscillatorType);
                  addLog(`Waveform updated to ${message.value} by controller`);
                  break;
                case 'volume':
                  updateVolume(Number(message.value));
                  addLog(`Volume updated to ${message.value} by controller`);
                  break;
                default:
                  addLog(`Unknown synth parameter: ${message.param}`);
              }
              return;
            }
          } catch (error) {
            console.error("Error parsing JSON message:", error);
            // Continue with non-JSON message handling
          }
        }
        
        // SUPER SIMPLE PING HANDLING
        // Instead of any complex parsing, just send back exactly what we receive
        // with "PONG" instead of "PING"
        if (typeof event.data === 'string' && event.data.startsWith('PING:')) {
          console.log("[CLIENT-RECEIVED] PING detected!");
          
          // Create pong response by replacing PING with PONG
          const pongMessage = event.data.replace('PING:', 'PONG:');
          console.log("[CLIENT-RECEIVED] Sending PONG:", pongMessage);
          
          // Send the response immediately
          try {
            // Add a small delay to ensure message is processed
            setTimeout(() => {
              try {
                receivedChannel.send(pongMessage);
                console.log("[CLIENT-RECEIVED] PONG sent successfully");
                addLog(`Responded with ${pongMessage}`);
              } catch (e) {
                console.error("[CLIENT-RECEIVED] Failed to send delayed PONG:", e);
              }
            }, 10);
            
            // Also try sending immediately
            receivedChannel.send(pongMessage);
            console.log("[CLIENT-RECEIVED] PONG sent immediately");
          } catch (error) {
            console.error("[CLIENT-RECEIVED] Error sending PONG:", error);
            addLog(`Failed to respond to ping: ${error.message}`);
          }
          return;
        }
        
        // Also handle TEST messages for debug purposes
        if (typeof event.data === 'string' && event.data.startsWith('TEST:')) {
          console.log("[CLIENT-RECEIVED] TEST message detected!");
          
          // Reply with the same test message
          try {
            // Echo back the test message
            receivedChannel.send(`ECHOED:${event.data}`);
            console.log("[CLIENT-RECEIVED] Echoed test message");
            addLog(`Echoed test message`);
          } catch (error) {
            console.error("[CLIENT-RECEIVED] Error echoing test message:", error);
            addLog(`Failed to echo test message: ${error.message}`);
          }
          return;
        }
        
        // Regular message
        addLog(`Received: ${event.data}`);
      }
    }
    
    // Send ICE candidates to the other peer
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket.value) {
        socket.value.send(JSON.stringify({
          type: 'ice-candidate',
          target: targetId.value,
          data: event.candidate
        }))
      }
    }
    
    // Create offer
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        if (socket.value) {
          socket.value.send(JSON.stringify({
            type: 'offer',
            target: targetId.value,
            data: peerConnection.localDescription
          }))
          addLog('Sent offer')
        }
      })
      .catch(error => addLog(`Error creating offer: ${error}`))
  }
  
  // Send a message through the data channel
  const sendMessage = () => {
    if (!dataChannel.value || dataChannel.value.readyState !== 'open') {
      addLog('Data channel not open')
      return
    }
    
    dataChannel.value.send(message.value)
    addLog(`Sent: ${message.value}`)
    message.value = ''
  }
  
  // Disconnect and clean up the connection
  const disconnect = () => {
    if (dataChannel.value) {
      dataChannel.value.close()
      dataChannel.value = null
    }
    
    if (connection.value) {
      connection.value.close()
      connection.value = null
    }
    
    // Close the websocket cleanly
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      // We'll set up a new socket after disconnecting
      const oldSocket = socket.value
      socket.value = null
      
      // Close the socket properly
      oldSocket.close(1000, "User initiated disconnect")
      
      // Reconnect to signaling server with a new WebSocket
      setTimeout(connectWebSocket, 500)
    }
    
    connected.value = false
    targetId.value = ""
    autoConnectAttempted.value = false
    addLog('Disconnected')
  }
  
  // Connect to the WebSocket signaling server
  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/signal`)
    socket.value = ws
    
    ws.onopen = () => {
      addLog('Signaling server connected')
      ws.send(JSON.stringify({ type: 'register', id: id.value }))
      
      // Start sending heartbeats to keep the connection alive
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'heartbeat',
            id: id.value
          }))
        }
      }, 30000) // Send heartbeat every 30 seconds
    }
    
    ws.onclose = () => {
      addLog('Signaling server disconnected')
      
      // Don't try to reconnect if we deliberately disconnected
      if (connection.value || !socket.value) {
        setTimeout(connectWebSocket, 1000) // Reconnect
      }
    }
    
    ws.onerror = (error) => {
      addLog(`WebSocket error. Will try to reconnect...`)
      console.error("WebSocket error:", error)
    }
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        switch (message.type) {
          case 'active-controller':
            // Server is notifying us about an active controller
            const controllerId = message.controllerId
            activeController.value = controllerId
            
            if (controllerId) {
              addLog(`Active controller detected: ${controllerId}`)
              
              // Auto-connect to controller if not already connected and not already attempted
              if (!connected.value && !autoConnectAttempted.value) {
                addLog('Auto-connecting to controller...')
                autoConnectAttempted.value = true
                targetId.value = controllerId
                // Use setTimeout to ensure this happens after all state updates
                setTimeout(() => connect(), 500)
              }
            } else {
              addLog('No active controller')
              // Reset auto-connect flag when controller deactivates
              autoConnectAttempted.value = false
            }
            break
            
          case 'offer':
            // Handle offer asynchronously
            handleOffer(message).catch(error => {
              console.error('Error handling offer:', error);
              addLog(`Error handling offer: ${error.message}`);
            })
            break
            
          case 'answer':
            handleAnswer(message)
            break
            
          case 'ice-candidate':
            handleIceCandidate(message)
            break
            
          default:
            addLog(`Unknown message type: ${message.type}`)
        }
      } catch (error) {
        addLog(`Error handling message: ${error}`)
      }
    }
  }
  
  // Handle an incoming offer
  const handleOffer = async (message: any) => {
    if (!connection.value) {
      // Get ICE servers from Twilio
      const iceServers = await fetchIceServers();
      console.log('Using ICE servers (handleOffer):', iceServers);
      
      const peerConnection = new RTCPeerConnection({
        iceServers
      })
      connection.value = peerConnection
      
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket.value) {
          socket.value.send(JSON.stringify({
            type: 'ice-candidate',
            target: message.source,
            data: event.candidate
          }))
        }
      }
      
      peerConnection.ondatachannel = (event) => {
        const receivedChannel = event.channel
        dataChannel.value = receivedChannel
        
        receivedChannel.onopen = () => {
          addLog('Data channel opened (received)')
          connected.value = true
          
          // Send current synth parameters to the controller
          if (audioEnabled.value) {
            try {
              // Send frequency
              receivedChannel.send(JSON.stringify({
                type: 'synth_param',
                param: 'frequency',
                value: frequency.value
              }));
              
              // Send waveform
              receivedChannel.send(JSON.stringify({
                type: 'synth_param',
                param: 'waveform',
                value: waveform.value
              }));
              
              // Send volume
              receivedChannel.send(JSON.stringify({
                type: 'synth_param',
                param: 'volume',
                value: volume.value
              }));
              
              // Send audio state
              receivedChannel.send(JSON.stringify({
                type: 'audio_state',
                audioEnabled: audioEnabled.value,
                audioState: audioState.value
              }));
              
              addLog('Sent synth parameters and audio state to controller');
            } catch (error) {
              console.error("Error sending synth parameters:", error);
            }
          } else {
            // Even if audio is not enabled, send the audio state
            try {
              receivedChannel.send(JSON.stringify({
                type: 'audio_state',
                audioEnabled: false,
                audioState: 'disabled'
              }));
              addLog('Sent audio state to controller (audio not enabled)');
            } catch (error) {
              console.error("Error sending audio state:", error);
            }
          }
        }
        
        receivedChannel.onclose = () => {
          addLog('Data channel closed (received)')
          connected.value = false
        }
        
        receivedChannel.onmessage = (event) => {
          console.log("[CLIENT-ALT] Received message:", event.data);
          
          // Try to parse JSON messages
          if (typeof event.data === 'string' && event.data.startsWith('{')) {
            try {
              const message = JSON.parse(event.data);
              
              // Handle synth parameter update messages
              if (message.type === 'synth_param') {
                switch (message.param) {
                  case 'frequency':
                    updateFrequency(Number(message.value));
                    addLog(`Frequency updated to ${message.value}Hz by controller`);
                    break;
                  case 'waveform':
                    updateWaveform(message.value as OscillatorType);
                    addLog(`Waveform updated to ${message.value} by controller`);
                    break;
                  case 'volume':
                    updateVolume(Number(message.value));
                    addLog(`Volume updated to ${message.value} by controller`);
                    break;
                  case 'oscillatorEnabled':
                    console.log(`[SYNTH] Received oscillatorEnabled parameter: ${message.value}, type: ${typeof message.value}`);
                    // Convert various types to boolean properly
                    const enabled = message.value === true || message.value === 'true' || message.value === 1;
                    console.log(`[SYNTH] Converted value to boolean: ${enabled}`);
                    toggleOscillator(enabled);
                    addLog(`Oscillator ${enabled ? 'enabled' : 'disabled'} by controller`);
                    break;
                  case 'note':
                    updateNote(message.value as string);
                    addLog(`Note changed to ${message.value} by controller`);
                    break;
                  case 'detune':
                    updateDetune(Number(message.value));
                    addLog(`Detune set to ${message.value} cents by controller`);
                    break;
                  default:
                    addLog(`Unknown synth parameter: ${message.param}`);
                }
                return;
              }
            } catch (error) {
              console.error("Error parsing JSON message:", error);
              // Continue with non-JSON message handling
            }
          }
          
          // Regular message
          addLog(`Received: ${event.data}`);
        }
      }
      
      peerConnection.setRemoteDescription(new RTCSessionDescription(message.data))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
          if (socket.value) {
            socket.value.send(JSON.stringify({
              type: 'answer',
              target: message.source,
              data: peerConnection.localDescription
            }))
            targetId.value = message.source
            addLog('Sent answer')
          }
        })
        .catch(error => addLog(`Error creating answer: ${error}`))
    }
  }
  
  // Handle an incoming answer
  const handleAnswer = (message: any) => {
    if (connection.value) {
      connection.value.setRemoteDescription(new RTCSessionDescription(message.data))
        .then(() => addLog('Remote description set'))
        .catch(error => addLog(`Error setting remote description: ${error}`))
    }
  }
  
  // Handle an incoming ICE candidate
  const handleIceCandidate = (message: any) => {
    if (connection.value) {
      connection.value.addIceCandidate(new RTCIceCandidate(message.data))
        .then(() => addLog('Added ICE candidate'))
        .catch(error => addLog(`Error adding ICE candidate: ${error}`))
    }
  }
  
  // Send audio state to controller
  const sendAudioState = () => {
    if (!dataChannel.value || dataChannel.value.readyState !== 'open') {
      return;
    }
    
    try {
      dataChannel.value.send(JSON.stringify({
        type: 'audio_state',
        audioEnabled: audioEnabled.value,
        audioState: audioState.value
      }));
      console.log("Sent audio state update:", audioEnabled.value, audioState.value);
    } catch (error) {
      console.error("Error sending audio state:", error);
    }
  };
  
  // Initialize audio context with user gesture
  const initAudioContext = () => {
    try {
      // Create audio context if it doesn't exist
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        addLog("Audio context created");
        
        // Create gain node for volume control
        gainNode = audioContext.createGain();
        gainNode.gain.value = volume.value;
        gainNode.connect(audioContext.destination);
        
        // Create oscillator if enabled
        if (oscillatorEnabled.value) {
          oscillator = audioContext.createOscillator();
          oscillator.type = waveform.value;
          oscillator.frequency.value = frequency.value;
          oscillator.detune.value = detune.value;
          oscillator.connect(gainNode);
          oscillator.start();
          
          addLog(`Oscillator started with note ${currentNote.value} (${frequency.value}Hz) using ${waveform.value} waveform, detune: ${detune.value} cents`);
        } else {
          addLog("Oscillator is disabled");
        }
      }
      
      // Resume the audio context (needed for browsers that suspend by default)
      if (audioContext.state !== "running") {
        audioContext.resume().then(() => {
          addLog(`Audio context resumed, state: ${audioContext.state}`);
          audioState.value = audioContext.state;
          sendAudioState(); // Send updated state to controller
        }).catch(err => {
          addLog(`Error resuming audio context: ${err.message}`);
        });
      } else {
        audioState.value = audioContext.state;
      }
      
      // Setup audio state change listener
      audioContext.onstatechange = () => {
        audioState.value = audioContext.state;
        addLog(`Audio context state changed to: ${audioContext.state}`);
        sendAudioState(); // Send updated state to controller
      };
      
      // Mark audio as enabled and hide the button
      audioEnabled.value = true;
      showAudioButton.value = false;
      
      // Send audio state to controller if connected
      sendAudioState();
    } catch (error) {
      addLog(`Error initializing audio context: ${error.message}`);
      console.error("Audio context initialization failed:", error);
    }
  };
  
  // Update oscillator frequency
  const updateFrequency = (newFrequency: number) => {
    if (oscillator && audioContext) {
      oscillator.frequency.setValueAtTime(newFrequency, audioContext.currentTime);
      frequency.value = newFrequency;
      
      // Send frequency update to controller if connected
      if (dataChannel.value && dataChannel.value.readyState === 'open') {
        try {
          dataChannel.value.send(JSON.stringify({
            type: 'synth_param',
            param: 'frequency',
            value: newFrequency
          }));
        } catch (error) {
          console.error("Error sending frequency update:", error);
        }
      }
    }
  };
  
  // Update oscillator waveform
  const updateWaveform = (newWaveform: OscillatorType) => {
    if (oscillator) {
      oscillator.type = newWaveform;
      waveform.value = newWaveform;
      addLog(`Waveform changed to ${newWaveform}`);
      
      // Send waveform update to controller if connected
      if (dataChannel.value && dataChannel.value.readyState === 'open') {
        try {
          dataChannel.value.send(JSON.stringify({
            type: 'synth_param',
            param: 'waveform',
            value: newWaveform
          }));
        } catch (error) {
          console.error("Error sending waveform update:", error);
        }
      }
    }
  };
  
  // Update volume
  const updateVolume = (newVolume: number) => {
    if (gainNode) {
      gainNode.gain.value = newVolume;
      volume.value = newVolume;
      
      // Send volume update to controller if connected
      if (dataChannel.value && dataChannel.value.readyState === 'open') {
        try {
          dataChannel.value.send(JSON.stringify({
            type: 'synth_param',
            param: 'volume',
            value: newVolume
          }));
        } catch (error) {
          console.error("Error sending volume update:", error);
        }
      }
    }
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
  
  // Update the note
  const updateNote = (note: string) => {
    if (note in noteFrequencies) {
      currentNote.value = note;
      const newFrequency = noteFrequencies[note as keyof typeof noteFrequencies];
      
      // Apply the base frequency (without detune)
      frequency.value = newFrequency;
      
      // Update oscillator if it exists
      if (oscillator && audioContext) {
        oscillator.frequency.setValueAtTime(newFrequency, audioContext.currentTime);
        
        // Apply detune separately
        oscillator.detune.setValueAtTime(detune.value, audioContext.currentTime);
      }
      
      addLog(`Note changed to ${note} (${newFrequency}Hz)`);
      
      // Send note update to controller if connected
      if (dataChannel.value && dataChannel.value.readyState === 'open') {
        try {
          dataChannel.value.send(JSON.stringify({
            type: 'synth_param',
            param: 'note',
            value: note
          }));
        } catch (error) {
          console.error("Error sending note update:", error);
        }
      }
    }
  };
  
  // Update detune value
  const updateDetune = (cents: number) => {
    detune.value = cents;
    
    // Update oscillator if it exists
    if (oscillator && audioContext) {
      oscillator.detune.setValueAtTime(cents, audioContext.currentTime);
      addLog(`Detune set to ${cents} cents`);
    }
    
    // Send detune update to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === 'open') {
      try {
        dataChannel.value.send(JSON.stringify({
          type: 'synth_param',
          param: 'detune',
          value: cents
        }));
      } catch (error) {
        console.error("Error sending detune update:", error);
      }
    }
  };
  
  // Toggle oscillator on/off
  const toggleOscillator = (enabled: boolean) => {
    console.log(`[SYNTH] toggleOscillator called with enabled=${enabled}, current value=${oscillatorEnabled.value}`);
    
    oscillatorEnabled.value = enabled;
    
    if (!audioContext) {
      console.warn("[SYNTH] Cannot toggle oscillator: audioContext is not initialized");
      return;
    }
    
    if (enabled) {
      // Turn oscillator on
      if (!oscillator) {
        console.log("[SYNTH] Creating and starting new oscillator");
        
        // Check if gainNode exists
        if (!gainNode) {
          console.error("[SYNTH] Error: gainNode is not initialized!");
          // Create it if missing
          gainNode = audioContext.createGain();
          gainNode.gain.value = volume.value;
          gainNode.connect(audioContext.destination);
          console.log("[SYNTH] Created missing gainNode");
        }
        
        oscillator = audioContext.createOscillator();
        oscillator.type = waveform.value;
        oscillator.frequency.value = frequency.value;
        oscillator.detune.value = detune.value;
        
        console.log("[SYNTH] Connecting oscillator to gainNode");
        oscillator.connect(gainNode);
        console.log("[SYNTH] Starting oscillator");
        oscillator.start();
        addLog(`Oscillator turned on: ${waveform.value} @ ${frequency.value}Hz (detune: ${detune.value} cents)`);
      } else {
        console.log("[SYNTH] Oscillator already exists, not creating a new one");
      }
    } else {
      // Turn oscillator off
      if (oscillator) {
        console.log("[SYNTH] Stopping and disconnecting oscillator");
        oscillator.stop();
        oscillator.disconnect();
        oscillator = null;
        addLog("Oscillator turned off");
      } else {
        console.log("[SYNTH] No oscillator to turn off");
      }
    }
    
    // Send oscillator state to controller if connected
    if (dataChannel.value && dataChannel.value.readyState === 'open') {
      try {
        dataChannel.value.send(JSON.stringify({
          type: 'synth_param',
          param: 'oscillatorEnabled',
          value: enabled
        }));
      } catch (error) {
        console.error("Error sending oscillator state:", error);
      }
    }
  };
  
  // Connect to the signaling server on mount and clean up on unmount
  useEffect(() => {
    // Connect to signaling server (but don't enable audio yet)
    connectWebSocket();
    
    // Cleanup function
    return () => {
      // Close connections
      if (socket.value) socket.value.close();
      if (connection.value) connection.value.close();
      
      // Stop audio and clean up audio nodes
      if (oscillator) {
        try {
          oscillator.stop();
          oscillator.disconnect();
          console.log("Oscillator stopped and disconnected");
        } catch (err) {
          console.error("Error stopping oscillator:", err);
        }
      }
      
      if (gainNode) {
        try {
          gainNode.disconnect();
          console.log("Gain node disconnected");
        } catch (err) {
          console.error("Error disconnecting gain node:", err);
        }
      }
      
      // Close audio context
      if (audioContext && audioEnabled.value) {
        audioContext.close().then(() => {
          addLog("Audio context closed");
        }).catch(err => {
          console.error("Error closing audio context:", err);
        });
      }
    };
  }, [])
  
  // Handle pressing Enter in the message input
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && connected.value && message.value.trim()) {
      sendMessage()
    }
  }

  return (
    <div class="container">
      {showAudioButton.value ? (
        // Show the Enable Audio button if audio is not yet enabled
        <div class="audio-enable">
          <h1>WebRTC Synth</h1>
          <p>Click the button below to enable audio.</p>
          <button 
            onClick={initAudioContext} 
            class="audio-button"
          >
            Enable Audio
          </button>
          
          {/* Show info about controller status in the background */}
          {activeController.value && (
            <div class="background-info">
              <p>Controller available - will auto-connect once audio is enabled.</p>
            </div>
          )}
        </div>
      ) : (
        // Show the full synth UI after audio is enabled
        <div class="synth-ui">
          <h1>WebRTC Synth</h1>
          
          <div class="status-bar">
            <div>
              <span class="id-display">ID: {id.value}</span>
              <span class={`connection-status ${connected.value ? 'status-connected' : 'status-disconnected'}`}>
                {connected.value ? 'Connected' : 'Disconnected'}
              </span>
              <span class={`audio-status audio-${audioState.value}`}>
                Audio: {audioState.value}
              </span>
            </div>
            
            {activeController.value && (
              <div class="controller-info">
                <span class="controller-badge">
                  {connected.value && targetId.value === activeController.value 
                    ? 'Connected to Controller' 
                    : 'Controller Available'}
                </span>
              </div>
            )}
          </div>
          
          <div class="synth-status">
            <div class="synth-info">
              <h3>Synth Status</h3>
              <div class="param-display">
                <p>Oscillator: <span class={oscillatorEnabled.value ? 'status-on' : 'status-off'}>
                  {oscillatorEnabled.value ? 'ON' : 'OFF'}
                </span></p>
                <p>Note: <span class="param-value">{currentNote.value}</span></p>
                <p>Waveform: <span class="param-value">{waveform.value}</span></p>
                <p>Detune: <span class="param-value">{detune.value > 0 ? `+${detune.value}` : detune.value} ¢</span></p>
                <p>Volume: <span class="param-value">{Math.round(volume.value * 100)}%</span></p>
              </div>
              <p class="control-info">Synth controls available in controller interface</p>
            </div>
          </div>
          
          <div class="connection-info">
            <input
              type="text"
              placeholder="Enter target ID"
              value={targetId.value}
              onInput={(e) => targetId.value = e.currentTarget.value}
              disabled={connected.value}
            />
            {connected.value ? (
              <button onClick={disconnect} class="disconnect-button">
                Disconnect
              </button>
            ) : (
              <button onClick={connect} disabled={!targetId.value.trim()}>
                Connect
              </button>
            )}
          </div>
          
          <div class="message-area">
            <input
              type="text"
              placeholder="Type a message"
              value={message.value}
              onInput={(e) => message.value = e.currentTarget.value}
              onKeyDown={handleKeyDown}
              disabled={!connected.value}
            />
            <button onClick={sendMessage} disabled={!connected.value || !message.value.trim()}>
              Send
            </button>
          </div>
          
          <div class="log">
            <h3>Connection Log</h3>
            <ul>
              {logs.value.map((log, index) => (
                <li key={index}>{log}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}