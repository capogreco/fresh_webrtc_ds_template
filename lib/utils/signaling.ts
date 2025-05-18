/// <reference lib="deno.unstable" />
/**
 * Signaling utilities for message queuing and delivery
 */
// Message queue TTL in milliseconds (default 5 minutes)
export const MESSAGE_TTL_MS = 1000 * 60 * 5;

// Key prefix for storing queued messages in KV
export const MESSAGE_KEY_PREFIX = ["webrtc", "messages"];

/**
 * Queue a message for a peer that is currently offline
 * @param kv KV namespace
 * @param targetId The client ID to queue message for
 * @param message The message object to queue
 */
export async function queueMessage(
  kv: Deno.Kv,
  targetId: string,
  message: unknown,
) {
  const messageId = Date.now().toString(36) +
    Math.random().toString(36).substring(2);
  const messagesKey = [...MESSAGE_KEY_PREFIX, targetId, messageId];
  await kv.set(messagesKey, message, { expireIn: MESSAGE_TTL_MS });
}

/**
 * Deliver any queued messages for a peer that just connected
 * @param kv KV namespace
 * @param clientId The client ID who just connected
 * @param socket The WebSocket-like object with send() and readyState
 */
export async function deliverQueuedMessages(
  kv: Deno.Kv,
  clientId: string,
  socket: { send: (data: string) => void; readyState: number },
) {
  const prefix = [...MESSAGE_KEY_PREFIX, clientId];
  for await (const entry of kv.list({ prefix })) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(entry.value));
    }
    await kv.delete(entry.key);
  }
}
