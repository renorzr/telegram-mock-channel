import { MockError } from "./errors.js";
import { toTelegramCallbackUpdate, toTelegramMessageUpdate, type TelegramMockUpdate } from "./telegram-compat.js";
import type { InboundCallbackInput, InboundMessageInput, MockInboundDispatcher } from "./types.js";

type TelegramMockBridge = {
  dispatchUpdate?: (account: string, update: TelegramMockUpdate) => Promise<void>;
  dispatchMessage?: (account: string, input: InboundMessageInput) => Promise<void>;
  dispatchCallbackQuery?: (account: string, input: InboundCallbackInput) => Promise<void>;
};

let bridge: TelegramMockBridge = {};
let updateCounter = 0;

function nextUpdateId(): number {
  updateCounter += 1;
  return updateCounter;
}

export function setTelegramMockBridge(next: TelegramMockBridge): void {
  bridge = next;
}

export function createDispatcher(): MockInboundDispatcher {
  return {
    dispatchMessage: async (account, input) => {
      if (bridge.dispatchMessage) {
        await bridge.dispatchMessage(account, input);
        return;
      }
      if (bridge.dispatchUpdate) {
        await bridge.dispatchUpdate(account, toTelegramMessageUpdate({ updateId: nextUpdateId(), input }));
        return;
      }
      throw new MockError("MOCK_HANDLER_FAILURE", "Telegram mock bridge is not configured for message");
    },
    dispatchCallbackQuery: async (account, input) => {
      if (bridge.dispatchCallbackQuery) {
        await bridge.dispatchCallbackQuery(account, input);
        return;
      }
      if (bridge.dispatchUpdate) {
        await bridge.dispatchUpdate(account, toTelegramCallbackUpdate({ updateId: nextUpdateId(), input }));
        return;
      }
      throw new MockError(
        "MOCK_HANDLER_FAILURE",
        "Telegram mock bridge is not configured for callback_query",
      );
    },
  };
}
