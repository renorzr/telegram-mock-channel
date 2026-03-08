import { setTelegramMockBridge } from "./bridge.js";
import { recordOutboundEvent } from "./runtime.js";
import { mapTelegramMethodToOutboundEvent, type TelegramMockUpdate } from "./telegram-compat.js";
import type { OutboundRecordInput } from "./types.js";

export type TelegramUpdateDeliverer = (params: {
  accountId: string;
  update: TelegramMockUpdate;
}) => Promise<void>;

export type TelegramApiCallInput = {
  method: string;
  payload: Record<string, unknown>;
  accountId?: string | null;
};

export function installTelegramMockBridge(deliverUpdate: TelegramUpdateDeliverer): void {
  setTelegramMockBridge({
    dispatchUpdate: async (account, update) => {
      await deliverUpdate({
        accountId: account,
        update,
      });
    },
  });
}

export function recordTelegramOutboundCall(params: {
  method: string;
  payload: Record<string, unknown>;
  accountId?: string | null;
  fallbackAccountId?: string;
  recordEvent?: (accountId: string, event: OutboundRecordInput) => void;
}): boolean {
  const mapped = mapTelegramMethodToOutboundEvent({
    method: params.method,
    payload: params.payload,
  });
  if (!mapped) {
    return false;
  }

  const accountId = params.accountId ?? params.fallbackAccountId ?? "default";
  const recorder = params.recordEvent ?? recordOutboundEvent;
  recorder(accountId, mapped);
  return true;
}

export function createTelegramOutboundRecorder(params?: {
  fallbackAccountId?: string;
  recordEvent?: (accountId: string, event: OutboundRecordInput) => void;
}): (input: TelegramApiCallInput) => boolean {
  return (input: TelegramApiCallInput) =>
    recordTelegramOutboundCall({
      method: input.method,
      payload: input.payload,
      accountId: input.accountId,
      fallbackAccountId: params?.fallbackAccountId,
      recordEvent: params?.recordEvent,
    });
}
