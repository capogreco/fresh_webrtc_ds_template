import { Handlers } from "$fresh/server.ts"
import { ulid } from "https://deno.land/x/ulid@v0.3.0/mod.ts"

// Open the KV store
const kv = await Deno.openKv()

// Connection tracking with Deno KV
// Using prefixes for string debugging, but we'll use arrays for actual keys
const CONNECTIONS_PREFIX = "webrtc:connections:"
const MESSAGES_PREFIX = "webrtc:messages:"
const QUEUE_TTL_MS = 1000 * 60 * 5 // 5 minutes TTL for message queues
const CLIENT_TTL_MS = 1000 * 60 * 10 // 10 minutes TTL for client records

// Key prefixes for Deno KV (as arrays)
const CONNECTION_KEY_PREFIX = ["webrtc", "connections"]
const MESSAGE_KEY_PREFIX = ["webrtc", "messages"]

// Active WebSocket connections (in-memory per instance)
const activeConnections = new Map<string, WebSocket>()

// Keep track of message polling intervals
const pollingIntervals = new Map<string, number>()

// Track active controllers
const activeControllers = new Set<string>()

// Track clients with active WebRTC connections (controlled by controller)
// Map of controller ID -> Set of client IDs with active connections
const activeWebRTCConnections = new Map<string, Set<string>>()

// Helper to get the connection key - ensure all parts are proper key types
const getConnectionKey = (id: string) => CONNECTION_KEY_PREFIX.concat([id])

// Helper to get the message queue key - ensure all parts are proper key types
const getMessagesKey = (id: string) => MESSAGE_KEY_PREFIX.concat([id])

// Store a message in the recipient's queue
async function queueMessage(targetId: string, message: any) {
  const messageId = ulid()
  const messagesKey = getMessagesKey(targetId)
  
  // Store the message in the queue with TTL
  // messageId needs to be added to the key
  await kv.set([...messagesKey, messageId], message, { 
    expireIn: QUEUE_TTL_MS 
  })
  
  console.log(`Message queued for ${targetId}`)
}

// Retrieve and process pending messages for a client
async function processMessages(clientId: string, socket: WebSocket) {
  try {
    // Get the message key prefix for this client
    const messageKeyPrefix = getMessagesKey(clientId)
    
    // Get all pending messages for this client
    const messages = kv.list({ prefix: messageKeyPrefix })
    
    let messageCount = 0
    for await (const entry of messages) {
      const message = entry.value
      messageCount++
      
      // Send the message to the client
      socket.send(JSON.stringify(message))
      console.log(`Delivered message to ${clientId}`)
      
      // Delete the message from the queue
      await kv.delete(entry.key)
    }
    
    if (messageCount > 0) {
      console.log(`Processed ${messageCount} messages for client ${clientId}`)
    }
  } catch (error) {
    console.error("Error processing messages:", error)
  }
}

// Controller-related constants and state
const ACTIVE_CONTROLLER_KEY = ["webrtc", "active", "controller"]
const CONTROLLER_PREFIX = "controller-"

// Check if a client ID is a controller
function isController(id: string): boolean {
  return id.startsWith(CONTROLLER_PREFIX)
}

// Set the active controller
async function setActiveController(controllerId: string | null) {
  if (controllerId) {
    // Store the active controller with timestamp in KV
    await kv.set(ACTIVE_CONTROLLER_KEY, { 
      id: controllerId,
      timestamp: Date.now(),
      instanceId: Deno.env.get("DENO_DEPLOYMENT_ID") || "local"
    })
    console.log(`Set active controller: ${controllerId} (instance: ${Deno.env.get("DENO_DEPLOYMENT_ID") || "local"})`)
  } else {
    // Remove the active controller
    await kv.delete(ACTIVE_CONTROLLER_KEY)
    console.log("Cleared active controller")
  }
}

// Get the active controller
async function getActiveController(): Promise<string | null> {
  const controller = await kv.get(ACTIVE_CONTROLLER_KEY)
  return controller.value ? controller.value.id : null
}

// Function to check if a client has any active WebRTC connections with any controller
function hasActiveWebRTCConnection(clientId: string): boolean {
  // Check all controllers for this client
  for (const [_, connectedClients] of activeWebRTCConnections.entries()) {
    if (connectedClients.has(clientId)) {
      return true;
    }
  }
  return false;
}

// Function to clean up based on WebRTC connections
async function cleanupBasedOnWebRTCConnections() {
  console.log("===== CLEANING UP CLIENTS WITHOUT WEBRTC CONNECTIONS =====");
  
  // First gather all clients with active WebRTC connections from all controllers
  const clientsWithActiveConnections = new Set<string>();
  for (const [controllerId, connections] of activeWebRTCConnections.entries()) {
    console.log(`Controller ${controllerId} has connections to:`, Array.from(connections));
    connections.forEach(clientId => clientsWithActiveConnections.add(clientId));
  }
  
  console.log("Clients with active WebRTC connections:", Array.from(clientsWithActiveConnections));
  
  const clientsToRemove = []; // Track clients for cleanup
  let totalClients = 0;
  
  try {
    // Use the CONNECTION_KEY_PREFIX array for proper KV listing
    const connectionEntries = kv.list({ prefix: CONNECTION_KEY_PREFIX });
    
    // Find all non-controller clients
    for await (const entry of connectionEntries) {
      totalClients++;
      
      // The last element of the key array is the client ID
      const id = entry.key[entry.key.length - 1];
      
      // Skip controllers (making sure id is a string)
      const clientId = id.toString();
      if (isController(clientId)) {
        console.log(`Found controller ${clientId} - skipping cleanup`);
        continue;
      }
      
      console.log(`Checking synth client: ${clientId}`);
      
      // IMPORTANT: Only keep clients with active WebRTC connections to controllers
      if (!clientsWithActiveConnections.has(clientId)) {
        console.log(`Synth client ${clientId} has NO WebRTC connections - WILL REMOVE`);
        clientsToRemove.push({
          key: entry.key,
          id: clientId
        });
      } else {
        console.log(`Synth client ${clientId} has active WebRTC connection - keeping`);
      }
    }
    
    console.log(`Found total of ${totalClients} clients, ${clientsToRemove.length} to remove`);
    
    // Clean up all inactive synth clients
    if (clientsToRemove.length > 0) {
      console.log(`Cleaning up ${clientsToRemove.length} clients without WebRTC connections`);
      
      for (const client of clientsToRemove) {
        try {
          console.log(`Removing client: ${client.id}`);
          // Perform the actual deletion from KV store
          await kv.delete(client.key);
          
          // Notify controllers about this client disconnection
          notifyControllers('client-disconnected', {
            clientId: client.id
          });
        } catch (error) {
          console.error(`Error removing client ${client.id}:`, error);
        }
      }
      
      console.log(`Cleanup completed - removed ${clientsToRemove.length} clients`);
      return clientsToRemove.length;
    }
    
    console.log("No clients without WebRTC connections to clean up");
    return 0;
  } catch (error) {
    console.error("Error during client cleanup:", error);
    return 0;
  }
}

// Legacy function - now we use cleanupBasedOnWebRTCConnections instead
async function cleanupInactiveClients() {
  return cleanupBasedOnWebRTCConnections();
}

// Get a list of all connected clients (for controllers)
async function getConnectedClients() {
  const clients = []
  const now = Date.now()
  const staleClientKeys = [] // Track stale clients for cleanup
  
  // Use the CONNECTION_KEY_PREFIX array for proper KV listing
  const connectionEntries = kv.list({ prefix: CONNECTION_KEY_PREFIX })
  
  // Gather entries
  for await (const entry of connectionEntries) {
    // The last element of the key array is the client ID
    const id = entry.key[entry.key.length - 1]
    
    // Skip controllers (making sure id is a string)
    const clientId = id.toString()
    if (isController(clientId)) {
      continue
    }
    
    // Check if this client is stale (not seen in a while)
    const lastSeen = entry.value.lastSeen || 0
    const timeSinceLastSeen = now - lastSeen
    
    // We'll accept all clients here, no automatic cleanup during regular client listing
    console.log(`Found client: ${clientId}, last seen ${timeSinceLastSeen}ms ago`)
    
    // Add to client list
    clients.push({
      id: clientId,
      connected: false, // Will be set correctly by the controller's own tracking
      lastSeen: lastSeen
    })
  }
  
  console.log(`Returning ${clients.length} clients: ${clients.map(c => c.id).join(', ')}`)
  return clients
}

// Register a new connection
async function registerConnection(id: string, socket: WebSocket) {
  const connectionKey = getConnectionKey(id)
  const isControllerClient = isController(id)
  
  // Store instance ID - we just need to know the connection exists
  const instanceId = Deno.env.get("DENO_DEPLOYMENT_ID") || "local"
  await kv.set(connectionKey, {
    instanceId,
    lastSeen: Date.now(),
    isController: isControllerClient
  }, { expireIn: CLIENT_TTL_MS })
  
  // Store in local memory
  activeConnections.set(id, socket)
  
  // If it's a controller, add to our controller set and store in KV
  if (isControllerClient) {
    // Add to local set
    activeControllers.add(id)
    
    // Also store in KV so other instances know about this controller
    const controllerKey = ["webrtc", "controllers", id]
    await kv.set(controllerKey, {
      instanceId,
      lastSeen: Date.now()
    }, { expireIn: CLIENT_TTL_MS })
    
    console.log(`Registered controller ${id} in KV for cross-instance visibility`)
  } else {
    // Notify all controllers about the new client
    await notifyControllers('client-connected', {
      client: {
        id,
        connected: false,
        lastSeen: Date.now()
      }
    })
  }
  
  // Set up polling for messages
  if (!pollingIntervals.has(id)) {
    const intervalId = setInterval(() => {
      processMessages(id, socket)
    }, 500) // Poll every 500ms
    
    pollingIntervals.set(id, intervalId)
  }
}

// Unregister a connection
async function unregisterConnection(id: string) {
  if (!id) return
  
  console.log(`Unregistering connection for ${id}`)
  
  const connectionKey = getConnectionKey(id)
  const isControllerClient = isController(id)
  
  try {
    // Remove from KV
    await kv.delete(connectionKey)
    
    // Remove from local memory
    activeConnections.delete(id)
    
    // If it's a controller, remove from our controller set and KV
    if (isControllerClient) {
      // Remove from local set
      activeControllers.delete(id)
      
      // Also remove from KV
      const controllerKey = ["webrtc", "controllers", id]
      await kv.delete(controllerKey)
      
      console.log(`Removed controller ${id} from local set and KV`)
    } else {
      // Notify all controllers about the client disconnection
      console.log(`Broadcasting client disconnection: ${id}`)
      await notifyControllers('client-disconnected', {
        clientId: id
      })
    }
    
    // Clear polling interval
    const intervalId = pollingIntervals.get(id)
    if (intervalId) {
      clearInterval(intervalId)
      pollingIntervals.delete(id)
    }
    
    console.log(`Successfully unregistered: ${id}`)
  } catch (error) {
    console.error(`Error unregistering connection ${id}:`, error)
  }
}

// Send a notification to all active controllers
async function notifyControllers(type: string, data: any) {
  // Create the message
  const message = {
    type,
    ...data
  }
  
  try {
    // Get all active controllers from KV to ensure we notify controllers on all instances
    const controllerKey = ["webrtc", "controllers"];
    const controllersData = kv.list({ prefix: controllerKey });
    
    // Local tracking of notified controllers to avoid duplicates
    const notifiedControllers = new Set<string>();
    
    // First notify controllers connected to this instance directly
    for (const controllerId of activeControllers) {
      const socket = activeConnections.get(controllerId);
      
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        console.log(`Notified controller ${controllerId} directly`);
      } else {
        await queueMessage(controllerId, message);
        console.log(`Queued notification for controller ${controllerId}`);
      }
      
      notifiedControllers.add(controllerId);
    }
    
    // Then check KV for controllers on other instances
    for await (const entry of controllersData) {
      const controllerId = entry.key[entry.key.length - 1].toString();
      
      // Skip if we've already notified this controller
      if (notifiedControllers.has(controllerId)) {
        continue;
      }
      
      // Queue message for controllers on other instances
      await queueMessage(controllerId, message);
      console.log(`Queued notification for controller ${controllerId} (other instance)`);
    }
  } catch (error) {
    console.error("Error notifying controllers:", error);
  }
}

export const handler: Handlers = {
  GET: async (req) => {
    const url = new URL(req.url)
    const upgrade = req.headers.get("upgrade") || ""
    
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 })
    }
    
    const { socket, response } = Deno.upgradeWebSocket(req)
    
    let clientId: string | null = null
    
    socket.onopen = () => {
      console.log("WebSocket connection opened")
    }
    
    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data)
        
        // Update the lastSeen timestamp for this client whenever we receive a message
        if (clientId) {
          const connectionKey = getConnectionKey(clientId)
          const existingData = await kv.get(connectionKey)
          
          if (existingData.value) {
            // Update the lastSeen timestamp
            await kv.set(connectionKey, {
              ...existingData.value,
              lastSeen: Date.now()
            }, { expireIn: CLIENT_TTL_MS })
          }
        }
        
        switch (message.type) {
          case 'register':
            clientId = message.id
            await registerConnection(clientId, socket)
            console.log(`Client registered with ID: ${clientId}`)
            
            // Process any pending messages right away
            await processMessages(clientId, socket)
            
            // Handle different client types
            if (isController(clientId)) {
              // If this is a controller, send the list of clients right away
              const clients = await getConnectedClients()
              socket.send(JSON.stringify({
                type: 'client-list',
                clients
              }))
            } else {
              // Regular client - check if there's an active controller
              const activeControllerId = await getActiveController()
              if (activeControllerId) {
                // Send the active controller ID to the client
                socket.send(JSON.stringify({
                  type: 'active-controller',
                  controllerId: activeControllerId
                }))
              }
            }
            break
            
          case 'controller-heartbeat':
            // Controller is requesting updates - send client list
            if (clientId && isController(clientId)) {
              // First cleanup inactive clients to provide a clean list
              console.log("Controller heartbeat - refreshing client list");
              await cleanupInactiveClients();
              
              // Send the clean list
              const clients = await getConnectedClients();
              socket.send(JSON.stringify({
                type: 'client-list',
                clients
              }));
              console.log(`Sent refreshed client list to controller: ${clients.length} clients`);
            }
            break
            
          case 'controller-activate':
            // Controller is activating - set as active controller
            if (clientId && isController(clientId)) {
              console.log("=== CONTROLLER ACTIVATION ===");
              console.log(`Controller ${clientId} activating - current active connections:`, Array.from(activeConnections.keys()));
              
              await setActiveController(clientId);
              
              // Clean up inactive clients when a controller becomes active
              console.log("Initiating cleanup of inactive clients");
              const removedCount = await cleanupInactiveClients();
              console.log(`Cleanup completed - removed ${removedCount} inactive clients`);
              
              // Force the controller to request an updated client list
              socket.send(JSON.stringify({
                type: 'client-list',
                clients: await getConnectedClients()
              }));
              console.log("Sent updated client list to controller");
              
              // Get the clean list of clients for notifications
              const regularClients = await getConnectedClients();
              console.log(`After cleanup: ${regularClients.length} active clients remaining`);
              
              // Notify all regular clients about the new controller
              for (const client of regularClients) {
                if (client.id) {
                  const targetSocket = activeConnections.get(client.id);
                  if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                    targetSocket.send(JSON.stringify({
                      type: 'active-controller',
                      controllerId: clientId
                    }));
                    console.log(`Notified client ${client.id} about controller activation (direct)`);
                  } else {
                    await queueMessage(client.id, {
                      type: 'active-controller',
                      controllerId: clientId
                    });
                    console.log(`Queued notification for client ${client.id} about controller activation`);
                  }
                }
              }
            }
            break
            
          case 'controller-deactivate':
            // Controller is deactivating
            if (clientId && isController(clientId)) {
              // Check if this is the current active controller
              const activeController = await getActiveController()
              if (activeController === clientId) {
                await setActiveController(null)
                
                // Notify all clients that no controller is active
                const regularClients = await getConnectedClients()
                for (const client of regularClients) {
                  if (client.id) {
                    const targetSocket = activeConnections.get(client.id)
                    if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                      targetSocket.send(JSON.stringify({
                        type: 'active-controller',
                        controllerId: null
                      }))
                    } else {
                      await queueMessage(client.id, {
                        type: 'active-controller',
                        controllerId: null
                      })
                    }
                  }
                }
              }
            }
            break
            
          case 'controller-connections':
            // Controller is reporting its active WebRTC connections
            if (clientId && isController(clientId)) {
              const connections = message.connections || [];
              console.log(`Controller ${clientId} reported ${connections.length} active WebRTC connections:`, connections);
              
              // Store the controller's active connections
              activeWebRTCConnections.set(clientId, new Set(connections));
              
              // Now clean up any inactive clients (those not connected to any controller)
              await cleanupBasedOnWebRTCConnections();
            }
            break
            
          case 'heartbeat':
            // Client is sending a heartbeat to keep the connection alive
            if (clientId) {
              // Update the lastSeen timestamp
              const connectionKey = getConnectionKey(clientId)
              const existingData = await kv.get(connectionKey)
              
              if (existingData.value) {
                // Update the lastSeen timestamp
                await kv.set(connectionKey, {
                  ...existingData.value,
                  lastSeen: Date.now()
                }, { expireIn: CLIENT_TTL_MS })
                
                console.log(`Updated heartbeat for client ${clientId}`)
              }
            }
            break
            
          case 'offer':
          case 'answer':
          case 'ice-candidate':
            if (!clientId) {
              console.error("Client not registered")
              return
            }
            
            const targetId = message.target
            
            // Try local delivery first (if target is connected to this instance)
            const targetSocket = activeConnections.get(targetId)
            if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
              targetSocket.send(JSON.stringify({
                type: message.type,
                data: message.data,
                source: clientId
              }))
              console.log(`Direct delivery to ${targetId}`)
            } else {
              // Otherwise, queue the message in KV
              await queueMessage(targetId, {
                type: message.type,
                data: message.data,
                source: clientId
              })
            }
            break
            
          default:
            console.log(`Unknown message type: ${message.type}`)
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error)
      }
    }
    
    socket.onclose = async () => {
      await unregisterConnection(clientId)
      console.log(`Client disconnected: ${clientId}`)
    }
    
    return response
  }
}