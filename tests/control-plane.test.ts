import test from "node:test";
import assert from "node:assert/strict";
import { createTelegramMockClient, TelegramMockClientError } from "../src/control-plane-sdk.js";
import { MockHttpService } from "../src/http-service.js";
import { MockStateStore } from "../src/state-store.js";

test("control plane supports inbound and outbound workflows", async () => {
  const state = new MockStateStore();
  state.ensureAccount("loomplus");

  const seenMessages: Array<{ accountId: string; text: string }> = [];
  const seenCallbacks: Array<{ accountId: string; data: string }> = [];

  const service = new MockHttpService({
    config: { mockBind: "127.0.0.1:0", mockApiKey: "test-key" },
    state,
    dispatcher: {
      dispatchMessage: async (accountId, input) => {
        seenMessages.push({ accountId, text: input.text });
      },
      dispatchCallbackQuery: async (accountId, input) => {
        seenCallbacks.push({ accountId, data: input.data });
      },
    },
  });

  await service.start();
  const addr = service.getAddress();
  assert.ok(addr);
  const client = createTelegramMockClient({
    baseUrl: `http://127.0.0.1:${addr!.port}/v1/mock/telegram`,
    account: "loomplus",
    apiKey: "test-key",
  });

  const inboundMessageJson = await client.inboundMessage({
    chat_id: 123,
    from: { id: 99, username: "alice" },
    text: "hello mock",
    message_id: 7,
  });
  assert.equal(inboundMessageJson.ok, true);
  assert.equal(inboundMessageJson.accepted, true);
  assert.equal(typeof inboundMessageJson.update_id, "string");
  assert.deepEqual(seenMessages, [{ accountId: "loomplus", text: "hello mock" }]);

  const inboundCallbackJson = await client.inboundCallbackQuery({
    chat_id: 123,
    message_id: 7,
    from: { id: 99 },
    data: "confirm",
    id: "cbq-100",
  });
  assert.equal(inboundCallbackJson.ok, true);
  assert.equal(inboundCallbackJson.accepted, true);
  assert.equal(inboundCallbackJson.update_id, "cbq-100");
  assert.deepEqual(seenCallbacks, [{ accountId: "loomplus", data: "confirm" }]);

  state.recordOutbound("loomplus", {
    type: "sendMessage",
    chat_id: 123,
    text: "bot-reply",
    message_id: 900,
  });
  state.recordOutbound("loomplus", {
    type: "editMessageText",
    chat_id: 123,
    text: "bot-reply-edited",
    message_id: 900,
  });

  const outboundJson = await client.listOutbound({ afterSeq: 0, limit: 10 });
  assert.equal(outboundJson.ok, true);
  assert.equal(outboundJson.events.length, 2);
  assert.equal(outboundJson.events[0]?.type, "sendMessage");
  assert.equal(outboundJson.events[1]?.type, "editMessageText");
  assert.equal(outboundJson.next_after_seq, 2);

  const drainJson = await client.drainOutbound({ limit: 1 });
  assert.equal(drainJson.ok, true);
  assert.equal(drainJson.drained_count, 1);
  assert.equal(drainJson.remaining, 1);
  assert.equal(drainJson.events[0]?.seq, 1);

  const resetJson = await client.reset({ inbound: true, outbound: true });
  assert.equal(resetJson.ok, true);
  assert.equal(resetJson.reset, true);

  const healthJson = await client.health();
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.queue_size, 0);

  const accountState = state.getAccount("loomplus");
  assert.equal(accountState?.inboundLog.length, 0);
  assert.equal(accountState?.outboundQueue.length, 0);

  await service.stop();
});

test("control plane sdk surfaces auth errors", async () => {
  const state = new MockStateStore();
  state.ensureAccount("loomplus");

  const service = new MockHttpService({
    config: { mockBind: "127.0.0.1:0", mockApiKey: "real-key" },
    state,
    dispatcher: {
      dispatchMessage: async () => {},
      dispatchCallbackQuery: async () => {},
    },
  });

  await service.start();
  const addr = service.getAddress();
  assert.ok(addr);

  const client = createTelegramMockClient({
    baseUrl: `http://127.0.0.1:${addr!.port}/v1/mock/telegram`,
    account: "loomplus",
    apiKey: "wrong-key",
  });

  await assert.rejects(
    async () => {
      await client.health();
    },
    (error: unknown) => {
      assert.equal(error instanceof TelegramMockClientError, true);
      if (error instanceof TelegramMockClientError) {
        assert.equal(error.code, "MOCK_AUTH_INVALID");
        assert.equal(error.status, 401);
      }
      return true;
    },
  );

  await service.stop();
});
