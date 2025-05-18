import { assertEquals } from "./asserts.ts";
import {
  deliverQueuedMessages,
  MESSAGE_KEY_PREFIX,
  queueMessage,
} from "../lib/utils/signaling.ts";

// Simplified fake KV class for testing
class FakeKV {
  private store = new Map<string, { value: unknown; opts?: unknown }>();

  set(key: unknown[], value: unknown, opts?: unknown) {
    const k = JSON.stringify(key);
    this.store.set(k, { value, opts });
    return Promise.resolve({ ok: true });
  }

  get(key: unknown[]): Promise<{ value: unknown }> {
    const k = JSON.stringify(key);
    return Promise.resolve({ value: this.store.get(k)?.value });
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

  delete(key: unknown[]) {
    this.store.delete(JSON.stringify(key));
    return Promise.resolve({ ok: true });
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
  const kv = new FakeKV() as unknown as Deno.Kv;
  await queueMessage(kv, "client1", { foo: "bar" });
  const entries = (kv as unknown as FakeKV).entries();
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
  assertEquals((stored.value as { foo: string }).foo, "bar");
});

Deno.test("deliverQueuedMessages sends queued messages and deletes them", async () => {
  const kv = new FakeKV() as unknown as Deno.Kv;
  const socket = new FakeSocket();
  // Pre-populate two messages
  await queueMessage(kv, "cliA", { a: 1 });
  await queueMessage(kv, "cliA", { b: 2 });
  // Deliver
  await deliverQueuedMessages(kv, "cliA", socket);
  // Two messages should be sent
  assertEquals(socket.sent.length, 2);
  // After delivery, KV should be empty for that prefix
  const remaining = (kv as unknown as FakeKV).entries().filter(([k]) => {
    const keyArr = JSON.parse(k);
    return keyArr[0] === MESSAGE_KEY_PREFIX[0] &&
      keyArr[1] === MESSAGE_KEY_PREFIX[1];
  });
  assertEquals(remaining.length, 0);
});
