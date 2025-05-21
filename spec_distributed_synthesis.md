# Distributed Synthesis System Specification

**Version:** 1.0
**Date:** 2024-07-30

## 1. Introduction & Goals

The Distributed Synthesis system aims to create a collaborative digital musical instrument by leveraging the collective processing power and audio output capabilities of multiple participant devices (Synth Clients). A central control interface (`ctrl` Client) allows a conductor or performer to manage and modulate the sounds produced by the array of Synth Clients. Each Synth Client synthesizes audio locally, with parameters and control signals originating from the `ctrl` Client.

**Key Goals:**

*   Enable large-scale polyphonic and timbrally diverse soundscapes.
*   Provide a real-time, interactive musical experience for participants and a central controller.
*   Utilize standard web technologies (WebRTC, Web Audio, WebSockets) for broad accessibility.
*   Design a modular system where input, control routing, and output (DSP) are extensible.

## 2. System Architecture

The system consists of three primary components interacting via a signaling server, with Deno KV used for shared state management:

*   **Synth Client:** A web application running on participant devices (e.g., smartphones). Each Synth Client acts as an individual voice or sound-producing unit.
*   **`ctrl` Client:** A web application serving as the central control interface, typically used by a conductor or performer.
*   **Signaling Server:** A WebSocket-based server responsible for facilitating the discovery and connection handshake (WebRTC) between `ctrl` Clients and Synth Clients.
*   **WebRTC Data Channels:** Once a peer-to-peer connection is established, communication primarily occurs over two WebRTC data channels: one reliable and ordered (`reliable_control`) for critical state and commands, and one unreliable and potentially unordered (`streaming_updates`) for high-frequency, loss-tolerant data.
*   **Deno KV:** A key-value store used by the Signaling Server and `ctrl` Client for persistent state, such as active controller registration and message queuing.

**Conceptual Diagram:**

```
[Synth Client 1] ----(WebRTC Data)---- [ctrl Client] ----(WebRTC Data)---- [Synth Client N]
      |                     /|\              |               /|\                    |
      |                      |               |                |                     |
(WebSocket Signaling) ------+----- [Signaling Server] ------+---- (WebSocket Signaling)
                                          |
                                          |
                                     [Deno KV]
                               (Active Controller,
                                Message Queues)
```

## 3. Core Technologies Used

*   **Runtime:** Deno
*   **Web Framework:** Fresh
*   **Frontend UI:** Preact (with Signals for state management)
*   **Language:** TypeScript
*   **Signaling:** WebSockets
*   **Peer-to-Peer Communication:** WebRTC (RTCPeerConnection, RTCDataChannel)
*   **Audio Synthesis:** Web Audio API (primarily on Synth Clients)
*   **Persistent State:** Deno KV

## 4. Component Specifications

### 4.1. Synth Client

*   **URL:** Base URL of the application (e.g., `/`).
*   **Responsibilities:**
    *   Local audio synthesis and playback.
    *   Receiving control parameters from the `ctrl` Client.
    *   Potentially sending local interaction data (e.g., panning from touch input) to the `ctrl` Client, though this is not a primary design focus. The main control flow is from `ctrl` Client to Synth Client.
*   **Initialization:**
    1.  Generates a unique client ID (random string).
    2.  Establishes a WebSocket connection to the Signaling Server (`/api/signal`).
    3.  Sends a `register` message with its client ID over WebSocket.
*   **Controller Discovery:**
    1.  Sends a `get-controller` message to the Signaling Server via WebSocket.
    2.  Receives a `controller-info` message from the Signaling Server containing the active `ctrl` Client's ID.
    3.  Stores the `ctrl` Client ID as `targetId` / `activeController`.
*   **WebRTC Connection:**
    *   **Client-Initiated (Primary):**
        1.  Once `targetId` (controller's ID) is known, initiates a WebRTC connection.
        2.  Fetches ICE server configurations (e.g., via `fetchIceServers()` or uses defaults).
        3.  Creates an `RTCPeerConnection`.
        4.  Negotiates the opening of two `RTCDataChannel` instances with the `ctrl` Client:
            *   `reliable_control`: Configured for ordered, reliable delivery. Used for critical state and commands.
            *   `streaming_updates`: Configured for unordered, unreliable delivery (e.g., `maxRetransmits: 0`). Used for high-frequency, loss-tolerant data streams from the `ctrl` Client.
        5.  Creates an SDP Offer (which includes information about the requested data channels).
        6.  Sends the SDP Offer to the `targetId` via the Signaling Server (WebSocket message type: `offer`).
        7.  Handles `onicecandidate` events by sending ICE candidates to the `targetId` via the Signaling Server (WebSocket message type: `ice-candidate`).
        8.  Upon receiving an SDP Answer from the `ctrl` Client (via Signaling Server), sets it as the remote description.
    *   **Controller-Initiated (Supported):**
        1.  If an SDP Offer is received from a `ctrl` Client via the Signaling Server:
        2.  Creates an `RTCPeerConnection` (if one doesn't exist for this controller).
        3.  Sets up `ondatachannel` to receive the data channel from the controller.
        4.  Sets the received Offer as the remote description.
        5.  Creates an SDP Answer.
        6.  Sends the SDP Answer to the `ctrl` Client (source of the offer) via the Signaling Server.
        7.  Handles `onicecandidate` events by sending candidates to the controller.
*   **Data Channel Communication (with `ctrl` Client):** All JSON keys use `snake_case`.
    *   **Receives on `reliable_control` channel:**
        *   `{type: "set_instrument_definition", definition: InstrumentDefinitionObject}`: Receives the full definition for an instrument, including its `instrument_id`, `synth_engine`, `global_settings`, and `parameters`. Parameters within the definition specify their `is_resolved` status, `value` (which can be a literal or a rule object), and `update_channel` preference.
        *   `{type: "update_instrument_definition_partial", path: string, new_value: any}`: (Optional, for granular reliable updates) Updates a specific part of the current instrument definition.
        *   `{type: "instrument_command", payload: {instrument_id: string, command_name: string, command_args?: object}}`: Receives commands specific to an instrument (e.g., `synchronise_phases`, `desynchronise_phases`, `arm_event`).
        *   `{type: "ping", timestamp: number}`: Responds with a `pong` message.
    *   **Receives on `streaming_updates` channel:**
        *   `{type: "streamed_resolved_param_update", p: "param_name", v: any, t: number}`: Receives high-frequency updates for an `is_resolved: true` parameter that is marked for streaming. `t` is a timestamp or sequence number for discarding stale updates.
    *   **Sends on `reliable_control` channel:**
        *   `{type: "audio_state", is_muted: boolean, audio_context_state: string, pending_note_active: boolean, current_instrument_id: string}`: Reports its audio status.
        *   `{type: "pong", timestamp: number}`: Response to a `ping`.
        *   `{type: "request_instrument_definition"}`: (Optional) Sent on connection or if state is ambiguous.
        *   `{type: "instrument_specific_feedback", instrument_id: string, feedback_data: object}`: For sending data like panning, if the active instrument defines such an interaction.
*   **Audio Engine (`useAudioEngine` Hook):**
    *   Manages the Web Audio API graph (OscillatorNode, GainNode, StereoPannerNode, BiquadFilterNode, etc.).
    *   Synthesizes sound locally (e.g., sine wave, with envelope, filter, vibrato, portamento capabilities).
    *   Applies parameters received from the `ctrl` Client to the audio graph.
    *   Handles note on/off logic, including envelope shaping (Attack/Release).
    *   Outputs final audio through the device's speakers.
    *   Manages `AudioContext` lifecycle: initialization requires a user gesture (e.g., "Enable Audio" button click).
    *   Implements a volume check procedure (e.g., playing pink noise) upon initial audio enabling.
*   **User Interface (Preact):**
    *   "Enable Audio" button to initiate `AudioContext`.
    *   Volume adjustment interface during initial setup.
    *   Touch-sensitive area for controlling panning (sends `synth_param` updates).
    *   Displays connection status, current mode, client ID.
    *   Log display for diagnostics.
*   **State Management:** Preact Signals.
*   **Error Handling & Reconnection:**
    *   Attempts to reconnect WebSocket if the connection drops.
    *   Periodically checks WebRTC connection status and attempts to reconnect to the active controller if disconnected.
    *   Manages screen wake lock to prevent device from sleeping.

### 4.2. `ctrl` Client

*   **URL:** `/ctrl` (main controller), `/ctrl/dev` (development controller).
*   **Responsibilities:**
    *   Centralized control and orchestration of all connected Synth Clients.
    *   Distribution of synthesis parameters and musical commands.
    *   Monitoring the status of Synth Clients.
*   **Initialization:**
    1.  User authentication (e.g., Google OAuth, restricted by `ALLOWED_EMAIL`).
    2.  Generates a unique `clientId` (prefixed with `controller-`).
    3.  Interacts with Deno KV to manage the active controller "lock" (`ACTIVE_CTRL_CLIENT_ID` key). Prevents multiple `ctrl` Clients from being active simultaneously or provides a mechanism to take over.
    4.  Establishes a WebSocket connection to the Signaling Server.
    5.  Sends a `register` message (Signaling Server identifies it as a controller due to ID prefix and updates Deno KV).
*   **WebRTC Connection Management (`WebRTCService` via `useClientManager` Hook):**
    *   Manages a map of `RTCPeerConnection` objects, one for each connected Synth Client.
    *   When establishing a connection (either controller-initiated or by accepting a client's offer):
        1.  Negotiates the opening of two `RTCDataChannel` instances with each Synth Client:
            *   `reliable_control`: Configured for ordered, reliable delivery.
            *   `streaming_updates`: Configured for unordered, unreliable delivery.
        2.  The `WebRTCService` will handle sending/receiving messages over the appropriate channel based on `ctrl` client logic.
    *   Handles SDP Offers/Answers and ICE candidates as previously described.
    *   Handles ICE candidates received from/sent to Synth Clients via Signaling Server.
    *   Utilizes STUN servers (e.g., `stun:stun.l.google.com:19302`) for NAT traversal.
*   **Data Channel Communication (with Synth Clients):** All JSON keys use `snake_case`.
    *   **Sends on `reliable_control` channel:**
        *   `{type: "set_instrument_definition", definition: InstrumentDefinitionObject}`: Sends the full definition for an instrument to a Synth Client (or all clients).
        *   `{type: "update_instrument_definition_partial", path: string, new_value: any}`: (Optional) Sends granular reliable updates to an instrument definition.
        *   `{type: "instrument_command", payload: {instrument_id: string, command_name: string, command_args?: object}}`: Sends commands specific to an instrument (e.g., `synchronise_phases`). Targeted or broadcast.
        *   `{type: "ping", timestamp: number}`: Periodically sent to check liveness and RTT.
    *   **Sends on `streaming_updates` channel:**
        *   `{type: "streamed_resolved_param_update", p: "param_name", v: any, t: number}`: Sends high-frequency updates for an `is_resolved: true` parameter marked in its `instrument_definition` for streaming. `t` is a timestamp or sequence number.
    *   **Receives on `reliable_control` channel:**
        *   `{type: "audio_state", is_muted: boolean, audio_context_state: string, pending_note_active: boolean, current_instrument_id: string}`: Receives audio status from Synth Clients.
        *   `{type: "pong", timestamp: number}`: Response to its `ping`.
        *   `{type: "request_instrument_definition"}`: (Optional) Synth Client may request the full definition. `ctrl` Client responds with `set_instrument_definition`.
        *   `{type: "instrument_specific_feedback", instrument_id: string, feedback_data: object}`: Receives data like panning, if defined by the instrument.
*   **User Interface (Preact):**
    *   Login page (if not authenticated).
    *   Page indicating if another controller is active (with option to "kick" or take over, potentially redirecting existing clients).
    *   Main control panel displaying:
        *   List of connected Synth Clients (ID, status, latency).
        *   Global controls for synthesis parameters, organized by controller mode (e.g., "Default Mode", "Ikeda Mode").
        *   UI to trigger notes or send specific commands to individual or all clients.
        *   Mode selection interface.
        *   Form to send broadcast messages.
        *   Log display for diagnostics.
*   **State Management:** Preact Signals, utilizing `useClientManager` (manages `WebRTCService`) and `useWebSocketSignaling` custom hooks.
*   **Error Handling:** Manages screen wake lock. Handles WebSocket and WebRTC disconnections.

### 4.3. Signaling Server

*   **Endpoint:** `/api/signal` (WebSocket).
*   **Responsibilities:**
    *   Facilitate discovery of the active `ctrl` Client.
    *   Relay WebRTC signaling messages (SDP Offers/Answers, ICE candidates) between clients.
    *   Manage active controller registration using Deno KV.
    *   Queue messages in Deno KV for temporarily disconnected clients.
*   **Operations:**
    1.  **WebSocket Connection Handling:** Upgrades HTTP GET requests to WebSocket.
    2.  **Client Registration (`register` message):**
        *   Client sends `{type: "register", id: string}`.
        *   Server stores `clientId` and `WebSocket` object in a local in-memory map (`activeConnections`).
        *   If `clientId` indicates a controller (e.g., starts with `controller-`), sets `CONTROLLER_KEY` in Deno KV to this `clientId`.
        *   Retrieves and sends any messages previously queued for this `clientId` from Deno KV (via `deliverQueuedMessages`).
    3.  **Controller Discovery (`get-controller` message):**
        *   Synth Client sends `{type: "get-controller"}`.
        *   Server retrieves the active `ctrl` Client's ID from `CONTROLLER_KEY` in Deno KV.
        *   Server responds to requester with `{type: "controller-info", controllerId: string | null}`.
    4.  **WebRTC Message Relaying (`offer`, `answer`, `ice-candidate` messages):**
        *   Client A sends `{type: "...", target: string, data: any}`.
        *   Server reformats to `{type: "...", source: string (Client A's ID), data: any}`.
        *   If `target`'s WebSocket is in `activeConnections` (local to this server instance), relays message directly.
        *   Else, queues the message in Deno KV, keyed by `target` ID (via `queueMessage`).
    5.  **Heartbeat (`heartbeat` message):**
        *   Client sends `{type: "heartbeat"}`.
        *   Server takes no action other than keeping the WebSocket connection alive.
    6.  **Controller Kicked (`controller-kicked` message):**
        *   A new controller might send this to ensure an old one is notified.
        *   Relays or queues for the `target` (old controller).
    7.  **Connection Close (`socket.onclose`):**
        *   Removes client from local `activeConnections`.
        *   If the disconnected client was the active controller, its entry for `CONTROLLER_KEY` in Deno KV is removed (`unregisterController`).

## 5. Communication Protocols

Messages are JSON objects sent over WebSockets (for signaling) or WebRTC Data Channels.

### 5.1. WebSocket Signaling Messages

*   **Client -> Server:**
    *   `{type: "register", id: string}`
    *   `{type: "get-controller"}`
    *   `{type: "heartbeat"}`
    *   `{type: "offer", target: string, data: RTCSessionDescriptionInit}`
    *   `{type: "answer", target: string, data: RTCSessionDescriptionInit}`
    *   `{type: "ice-candidate", target: string, data: RTCIceCandidateInit}`
    *   `{type: "controller-kicked", target: string, newControllerId: string}` (from new controller to old)
*   **Server -> Client:**
    *   `{type: "controller-info", controllerId: string | null}`
    *   `{type: "offer", source: string, data: RTCSessionDescriptionInit}`
    *   `{type: "answer", source: string, data: RTCSessionDescriptionInit}`
    *   `{type: "ice-candidate", source: string, data: RTCIceCandidateInit}`
    *   `{type: "controller-kicked", newControllerId: string, source: string}` (to the kicked controller)
    *   `{type: "error", message: string, details?: string}`

### 5.2. WebRTC Data Channel Messages

*   **`ctrl` Client -> Synth Client:**
    *   `{type: "synth_param", param: string, value: any}`
    *   `{type: "synth_params_full", params: Record<string, any>}`
    *   `{type: "note_on", frequency: number, [other_params...]} `
    *   `{type: "note_off"}`
    *   `{type: "controller_mode", mode: string, initialParams?: Record<string, any>}`
    *   `{type: "ping", timestamp: number}`
    *   `{type: "broadcast", message: string, source: string}`
    *   `{type: "controller_handoff", newControllerId: string}`
*   **Synth Client -> `ctrl` Client:**
    *   `{type: "synth_param", param: string, value: any}` (e.g., `{param: "panning", value: {x: number, y: number}}`)
    *   `{type: "audio_state", isMuted: boolean, audioState: string ("suspended" | "running" | "closed" | "disabled"), pendingNote: boolean, controllerMode: string}`
    *   `{type: "pong", timestamp: number}`
    *   `{type: "request_controller_mode"}`
    *   (Potentially `request_current_state` - though controller sends full state on connect)

## 6. Key Workflows

### 6.1. Synth Client Joins and Connects (Client-Initiated Offer)

1.  **Synth Client:** Loads page, generates `synthId`.
2.  **Synth Client -> WS Server:** `{type: "register", id: synthId}`.
3.  **WS Server:** Stores `synthId` and WebSocket.
4.  **Synth Client -> WS Server:** `{type: "get-controller"}`.
5.  **WS Server:** Reads `ctrlClientId` from Deno KV.
6.  **WS Server -> Synth Client:** `{type: "controller-info", controllerId: ctrlClientId}`.
7.  **Synth Client:** Sets `targetId = ctrlClientId`. Creates `RTCPeerConnection`, `RTCDataChannel`. Creates SDP Offer.
8.  **Synth Client -> WS Server:** `{type: "offer", target: ctrlClientId, data: sdpOffer}`.
9.  **WS Server -> `ctrl` Client:** `{type: "offer", source: synthId, data: sdpOffer}`.
10. **`ctrl` Client (`WebRTCService`):** Receives Offer. Creates `RTCPeerConnection` for `synthId`. Sets remote description. Creates SDP Answer.
11. **`ctrl` Client -> WS Server:** `{type: "answer", target: synthId, data: sdpAnswer}`.
12. **WS Server -> Synth Client:** `{type: "answer", source: ctrlClientId, data: sdpAnswer}`.
13. **Synth Client:** Sets remote description.
14. **Both Clients:** Exchange ICE candidates via WS Server:
    *   Client -> WS: `{type: "ice-candidate", target: peerId, data: candidate}`.
    *   WS -> Peer: `{type: "ice-candidate", source: clientId, data: candidate}`.
15. **WebRTC Connection Established.** Data Channel opens.
16. **Synth Client (on data channel open):** Sends `request_controller_mode` and its `audio_state`.
17. **`ctrl` Client (on data channel open):** Sends `controller_mode` and `synth_params_full`.

### 6.2. `ctrl` Client Sends Parameter Update

1.  **`ctrl` Client UI:** User changes a synth parameter (e.g., global filter cutoff).
2.  **`ctrl` Client (`useClientManager`):** Calls `broadcastGlobalSynthParam("filterCutoff", newValue)` OR `updateClientSynthParam(targetSynthId, "frequency", newFreq)`.
3.  **`ctrl` Client (`WebRTCService`):** Sends `{type: "synth_param", param: "filterCutoff", value: newValue}` over the RTCDataChannel to all/specific connected Synth Clients.
4.  **Synth Client:** Receives message on Data Channel.
5.  **Synth Client (`useAudioEngine`):** Updates the corresponding Web Audio API parameter (e.g., `BiquadFilterNode.frequency.value`). Audio output changes.

### 6.3. Synth Client Sends Panning Update (Illustrative Example of Data Flow)

This workflow illustrates the technical capability for a Synth Client to send data to the `ctrl` Client. However, the primary design philosophy emphasizes control from the `ctrl` Client to the Synth Clients ("instrumentalizing" them) rather than extensive performative input from individual Synth Clients.

1.  **Synth Client UI:** User interacts with touch area, generating panning values (e.g., `x: 0.5, y: 0.0`).
2.  **Synth Client:** Sends `{type: \"synth_param\", param: \"panning\", value: {x: 0.5, y: 0.0}}` over RTCDataChannel to `ctrl` Client.
3.  **`ctrl` Client (`WebRTCService` via `useClientManager`):** Receives message.
4.  **`ctrl` Client:** Updates its internal state for this Synth Client. This data is primarily for monitoring or visualization on the `ctrl` Client side, as audio panning is handled locally on the Synth Client.

## 7. Error Handling & Reconnection Strategies

*   **Synth Client:**
    *   Attempts to reconnect WebSocket on disconnection.
    *   Periodically checks WebRTC connection status and attempts to re-establish connection with the active `ctrl` Client if lost.
    *   Requests active controller info if connection details are lost.
*   **`ctrl` Client:**
    *   Uses Deno KV to manage the "active controller" lock, preventing multiple instances from controlling Synth Clients simultaneously unless a handoff is performed.
    *   Handles individual Synth Client WebRTC disconnections gracefully, removing them from the active list.
*   **Signaling Server:**
    *   Uses Deno KV for message queuing, allowing messages to be delivered even if a client reconnects to a different server instance (in a scaled deployment) or after a transient disconnection. Messages have a Time-To-Live (TTL).

## 8. Security Considerations

*   **`ctrl` Client Access:** Authenticated via Google OAuth, with access restricted to predefined email addresses (`ALLOWED_EMAIL` environment variable).
*   **Communication Encryption:** Assumes deployment over HTTPS/WSS, ensuring encryption for WebSocket signaling and initial page loads. WebRTC encrypts data channel communication (DTLS-SRTP) by default.
*   **Input Validation:** Server-side validation of message formats and client IDs is important.

## 9. Scalability Notes

*   The Signaling Server's use of Deno KV for `CONTROLLER_KEY` and message queuing allows for stateless instances of the signaling server, enabling horizontal scaling.
*   The number of Synth Clients is limited by the `ctrl` Client's browser capabilities (CPU, memory for managing WebRTC connections) and network bandwidth.
*   WebRTC peer-to-peer connections reduce load on a central media server but still require signaling.