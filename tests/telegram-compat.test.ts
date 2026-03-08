import test from "node:test";
import assert from "node:assert/strict";
import {
  mapTelegramMethodToOutboundEvent,
  toTelegramCallbackUpdate,
  toTelegramMessageUpdate,
} from "../src/telegram-compat.js";

test("message update conversion keeps core telegram fields", () => {
  const update = toTelegramMessageUpdate({
    updateId: 7,
    input: {
      chat_id: 100,
      from: { id: 42, username: "alice" },
      text: "hello",
      message_id: 8,
      date: 123,
    },
  });
  assert.equal(update.update_id, 7);
  assert.equal(update.message?.chat.id, 100);
  assert.equal(update.message?.from.id, 42);
  assert.equal(update.message?.text, "hello");
});

test("callback update conversion keeps callback data", () => {
  const update = toTelegramCallbackUpdate({
    updateId: 9,
    input: {
      chat_id: -100123,
      message_id: 21,
      from: { id: 3 },
      data: "confirm",
      id: "cbq-1",
    },
  });
  assert.equal(update.callback_query?.id, "cbq-1");
  assert.equal(update.callback_query?.message.chat.id, -100123);
  assert.equal(update.callback_query?.data, "confirm");
});

test("method mapping captures mvp outbound events", () => {
  const send = mapTelegramMethodToOutboundEvent({
    method: "sendMessage",
    payload: { chat_id: 1, text: "x" },
  });
  const edit = mapTelegramMethodToOutboundEvent({
    method: "editMessageText",
    payload: { chat_id: 1, message_id: 2, text: "y" },
  });
  const answer = mapTelegramMethodToOutboundEvent({
    method: "answerCallbackQuery",
    payload: { callback_query_id: "abc", text: "ok" },
  });
  assert.equal(send?.type, "sendMessage");
  assert.equal(edit?.type, "editMessageText");
  assert.equal(answer?.type, "answerCallbackQuery");
});
