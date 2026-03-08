import test from "node:test";
import assert from "node:assert/strict";
import { createDispatcher, setTelegramMockBridge } from "../src/bridge.js";
import {
  createTelegramOutboundRecorder,
  installTelegramMockBridge,
  recordTelegramOutboundCall,
} from "../src/openclaw-integration.js";

test("installTelegramMockBridge forwards updates with account", async () => {
  const seen: Array<{ accountId: string; updateId: number }> = [];
  installTelegramMockBridge(async ({ accountId, update }) => {
    seen.push({ accountId, updateId: update.update_id });
  });

  const dispatcher = createDispatcher();
  await dispatcher.dispatchMessage("acc1", {
    chat_id: 1,
    from: { id: 2 },
    text: "hi",
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.accountId, "acc1");
  assert.ok((seen[0]?.updateId ?? 0) > 0);
});

test("recordTelegramOutboundCall maps supported telegram methods", () => {
  const records: Array<{ account: string; type: string }> = [];
  const result = recordTelegramOutboundCall({
    accountId: "acc2",
    method: "editMessageText",
    payload: { chat_id: 11, message_id: 22, text: "edited" },
    recordEvent: (account, event) => {
      records.push({ account, type: event.type });
    },
  });

  assert.equal(result, true);
  assert.deepEqual(records, [{ account: "acc2", type: "editMessageText" }]);
});

test("recordTelegramOutboundCall ignores unsupported methods", () => {
  const records: Array<{ account: string; type: string }> = [];
  const result = recordTelegramOutboundCall({
    accountId: "acc3",
    method: "deleteMessage",
    payload: { chat_id: 11, message_id: 22 },
    recordEvent: (account, event) => {
      records.push({ account, type: event.type });
    },
  });

  assert.equal(result, false);
  assert.equal(records.length, 0);
});

test("dispatcher fails clearly when bridge is unset", async () => {
  setTelegramMockBridge({});
  const dispatcher = createDispatcher();
  await assert.rejects(
    async () => {
      await dispatcher.dispatchCallbackQuery("acc", {
        chat_id: 1,
        message_id: 2,
        from: { id: 3 },
        data: "tap",
      });
    },
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      if (error && typeof error === "object") {
        const code = (error as { code?: string }).code;
        assert.equal(code, "MOCK_HANDLER_FAILURE");
      }
      return true;
    },
  );
});

test("createTelegramOutboundRecorder applies fallback account", () => {
  const records: Array<{ account: string; type: string }> = [];
  const record = createTelegramOutboundRecorder({
    fallbackAccountId: "default",
    recordEvent: (account, event) => {
      records.push({ account, type: event.type });
    },
  });

  const ok = record({
    method: "sendMessage",
    payload: { chat_id: 7, text: "hi" },
  });

  assert.equal(ok, true);
  assert.deepEqual(records, [{ account: "default", type: "sendMessage" }]);
});
