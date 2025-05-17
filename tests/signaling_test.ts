import { assertEquals } from "./asserts.ts";
import {
  queueMessage,
  deliverQueuedMessages,
  MESSAGE_KEY_PREFIX,
} from "../lib/utils/signaling.ts";

// Fake KV namespace for testing
class FakeKV {
  private store = new Map<string, any>();
  async set(key: unknown[], value: unknown, opts?: any) {
    const k = JSON.stringify(key);
    this.store.set(k, { value, opts });
  }
  async *list({ prefix }: { prefix: unknown[] }) {
    for (const [k, v] of this.store.entries()) {
      const keyArr = JSON.parse(k);
      // check prefix
      if (
        prefix.every((p, i) => keyArr[i] === p)
      ) {
        yield { key: keyArr, value: v.value };
      }
    }
  }
  async delete(key: unknown[]) {
    this.store.delete(JSON.stringify(key));
  }
  // helper to inspect internal store for tests
  entries() {
    return Array.from(this.store.entries());
  }
}

// Fake WebSocket-like object
class FakeSocket {
  sent: string[] = [];
  readyState = WebSocket.OPEN;
  send(data: string) {
    this.sent.push(data);
  }
}

Deno.test("queueMessage stores message in KV with proper key prefix", async () => {
  const kv = new FakeKV();
  await queueMessage(kv, "client1", { foo: "bar" });
  const entries = kv.entries();
  // Expect one entry
  assertEquals(entries.length, 1);
  const [keyStr, stored] = entries[0];
  const keyArr = JSON.parse(keyStr);
  // Key should start with MESSAGE_KEY_PREFIX and client1
  assertEquals(keyArr[0], MESSAGE_KEY_PREFIX[0]);
  assertEquals(keyArr[1], MESSAGE_KEY_PREFIX[1]);
  assertEquals(keyArr[2], "client1");
  // Message value matches
  // Use property check since assertEquals does strict comparison
  assertEquals((stored.value as any).foo, "bar");
});

Deno.test("deliverQueuedMessages sends queued messages and deletes them", async () => {
  const kv = new FakeKV();
  const socket = new FakeSocket();
  // Pre-populate two messages
  await queueMessage(kv, "cliA", { a: 1 });
  await queueMessage(kv, "cliA", { b: 2 });
  // Deliver
  await deliverQueuedMessages(kv, "cliA", socket);
  // Two messages should be sent
  assertEquals(socket.sent.length, 2);
  // After delivery, KV should be empty for that prefix
  const remaining = kv.entries().filter(([k]) => {
    const keyArr = JSON.parse(k);
    return keyArr[0] === MESSAGE_KEY_PREFIX[0] && keyArr[1] === MESSAGE_KEY_PREFIX[1];
  });
  assertEquals(remaining.length, 0);
});