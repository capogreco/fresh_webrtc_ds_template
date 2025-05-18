import { Signal, useSignal } from "@preact/signals";
import { h } from "preact";
import { useCallback, useEffect } from "preact/hooks";
import { useAudioEngine } from "../../islands/hooks/useAudioEngine.ts";
import { useWebRTCConnection } from "../../islands/hooks/useWebRTCConnection.ts";
import { useWebSocketSignaling } from "../../islands/hooks/useWebSocketSignaling.ts";

interface SimpleWebRTCProps {
  id?: string;
}

export default function SimpleWebRTC(props: SimpleWebRTCProps) {
  // Local ID for this client
  const localId = useSignal(
    props.id || Math.random().toString(36).substring(2, 8),
  );

  // Logs for the UI
  const logs = useSignal<string[]>([]);

  // Message to send
  const message = useSignal("");

  // Target peer ID
  const targetPeerId = useSignal("");

  // Add a log entry
  const addLog = useCallback((text: string) => {
    logs.value = [...logs.value, `${new Date().toISOString()}: ${text}`];
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector(".log-container");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 0);
  }, []);

  // Initialize our hooks
  const audio = useAudioEngine(addLog);

  const webrtc = useWebRTCConnection(localId, addLog);

  const signaling = useWebSocketSignaling({
    localId,
    addLog,
    onSignalingMessage: webrtc.handleSignalingMessage,
    onServerError: (errorMessage) => {
      addLog(`Server error: ${errorMessage}`);
    },
  });

  // Handle sending WebRTC signaling messages through the WebSocket
  useEffect(() => {
    // Connect to signaling server when component mounts
    signaling.connect().catch((error) => {
      addLog(`Failed to connect to signaling server: ${error.message}`);
    });

    // Cleanup on unmount
    return () => {
      signaling.disconnect();
    };
  }, []);

  // Handle received data channel messages - check for synth parameter updates
  useEffect(() => {
    const lastMessage = webrtc.lastReceivedMessage.value;
    if (!lastMessage) return;

    try {
      // Handle synth parameter updates
      if (lastMessage.type === "synth_param") {
        const { param, value } = lastMessage;
        if (param && value !== undefined) {
          audio.updateSynthParam(param, value);
          addLog(`Received parameter update: ${param} = ${value}`);
        }
      }

      // Handle note_on messages
      if (lastMessage.type === "note_on" && lastMessage.frequency) {
        audio.playNote(lastMessage.frequency);
        addLog(`Playing note: ${lastMessage.frequency}Hz`);
      }

      // Handle note_off messages
      if (lastMessage.type === "note_off") {
        audio.stopNote();
        addLog("Note stopped");
      }
    } catch (error) {
      console.error("Error handling received message:", error);
    }
  }, [webrtc.lastReceivedMessage.value]);

  // Handle connecting to a peer
  const connectToPeer = useCallback(async () => {
    if (!targetPeerId.value) {
      addLog("Please enter a target peer ID");
      return;
    }

    addLog(`Connecting to peer: ${targetPeerId.value}`);
    const offer = await webrtc.connect(targetPeerId.value);

    if (offer) {
      // Send the offer through the signaling server
      signaling.sendMessage(offer);
      addLog("Sent connection offer");
    }
  }, [targetPeerId.value, webrtc, signaling]);

  // Handle sending a message
  const sendMessage = useCallback(() => {
    if (!message.value) return;

    const success = webrtc.sendMessage({
      type: "chat",
      text: message.value,
      timestamp: Date.now(),
    });

    if (success) {
      message.value = ""; // Clear the input
    } else {
      addLog("Failed to send message: not connected");
    }
  }, [message.value, webrtc]);

  // Initialize audio when the user clicks the button
  const handleEnableAudio = useCallback(async () => {
    try {
      addLog("Initializing audio...");
      await audio.initializeAudioContext();

      if (audio.audioContextReady.value) {
        addLog("Audio enabled successfully");

        // Start pink noise for volume check
        audio.startPinkNoise(0.2);
      } else {
        addLog(`Audio initialization issue: ${audio.audioContextState.value}`);
      }
    } catch (error) {
      addLog(
        `Failed to enable audio: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [audio]);

  // Handle volume check completion
  const handleVolumeCheckDone = useCallback(() => {
    audio.handleVolumeCheckDone();
  }, [audio]);

  // Play a test note
  const playTestNote = useCallback(() => {
    audio.playNote(440); // A4
    addLog("Playing test note (A4)");
  }, [audio]);

  // Stop the current note
  const stopTestNote = useCallback(() => {
    audio.stopNote();
    addLog("Stopped test note");
  }, [audio]);

  // Disconnect from peer
  const disconnect = useCallback(() => {
    webrtc.closePeerConnection();
    addLog("Disconnected from peer");
  }, [webrtc]);

  return (
    <div class="simple-webrtc">
      <h2>Simple WebRTC Component</h2>

      <div class="client-info">
        <div>
          <strong>Your ID:</strong> {localId.value}
        </div>
        <div>
          <strong>Connection Status:</strong> {webrtc.connectionStatus.value}
        </div>
        <div>
          <strong>Audio Status:</strong>{" "}
          {audio.audioContextState.value || "Not initialized"}
          (Muted: {audio.isMuted.value ? "Yes" : "No"})
        </div>
      </div>

      <div class="connection-controls">
        <h3>Connection</h3>
        <div class="control-row">
          <input
            type="text"
            placeholder="Enter target peer ID"
            value={targetPeerId.value}
            onInput={(e) =>
              targetPeerId.value = (e.target as HTMLInputElement).value}
          />
          <button
            onClick={connectToPeer}
            disabled={webrtc.isConnected.value || !signaling.isConnected.value}
          >
            Connect
          </button>
          <button
            onClick={disconnect}
            disabled={!webrtc.isConnected.value}
          >
            Disconnect
          </button>
        </div>
      </div>

      <div class="audio-controls">
        <h3>Audio</h3>
        {!audio.audioReady.value
          ? <button onClick={handleEnableAudio}>Enable Audio</button>
          : audio.pinkNoiseActive.value
          ? (
            <div>
              <p>Adjust your volume to a comfortable level, then click:</p>
              <button onClick={handleVolumeCheckDone}>Volume Check Done</button>
            </div>
          )
          : (
            <div class="control-row">
              <button onClick={playTestNote}>Play Test Note</button>
              <button onClick={stopTestNote}>Stop Note</button>
              <button onClick={() => audio.toggleMute()}>
                {audio.isMuted.value ? "Unmute" : "Mute"}
              </button>
            </div>
          )}
      </div>

      {webrtc.isConnected.value && (
        <div class="messaging">
          <h3>Messaging</h3>
          <div class="control-row">
            <input
              type="text"
              placeholder="Type a message"
              value={message.value}
              onInput={(e) =>
                message.value = (e.target as HTMLInputElement).value}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}

      <div class="log-section">
        <h3>Log</h3>
        <div class="log-container">
          {logs.value.map((log, i) => <div key={i} class="log-entry">{log}
          </div>)}
        </div>
      </div>

      <style>
        {`
        .simple-webrtc {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        
        .client-info {
          background: #f0f0f0;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
        }
        
        .control-row {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        
        input {
          flex: 1;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        
        button {
          padding: 8px 16px;
          background: #0070f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        button:hover {
          background: #0060df;
        }
        
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .log-container {
          height: 200px;
          overflow-y: auto;
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 10px;
          font-family: monospace;
          font-size: 14px;
          background: #f8f8f8;
        }
        
        .log-entry {
          margin-bottom: 4px;
          border-bottom: 1px solid #eee;
          padding-bottom: 4px;
        }
        
        h3 {
          margin-bottom: 10px;
        }
      `}
      </style>
    </div>
  );
}
