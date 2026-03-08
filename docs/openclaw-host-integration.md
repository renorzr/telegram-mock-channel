# OpenClaw Host Integration (telegram-mock)

This document describes how to wire this standalone plugin into the OpenClaw main runtime so mock traffic uses the same Telegram processing path.

## Target behavior

- Inbound mock events become Telegram updates and enter Telegram inbound handling.
- Outbound Telegram Bot API calls are mirrored into mock outbound queue.
- Gateway lifecycle controls mock HTTP service lifecycle (already handled by channel gateway start/abort).

Important: mock inbound endpoints require bridge installation. If bridge is not installed, inbound calls return `MOCK_HANDLER_FAILURE`.

## Hook points in openclaw/openclaw

Based on current upstream layout:

- Telegram channel plugin entry: `extensions/telegram/index.ts`
- Telegram channel implementation: `extensions/telegram/src/channel.ts`
- Telegram runtime bridge: `extensions/telegram/src/runtime.ts`

The integration should happen where Telegram updates are consumed and where Bot API methods are sent.

## 1) Inbound bridge wiring

Install bridge once during plugin registration/activation:

```ts
import { installTelegramMockBridge } from "telegram-mock-channel";

installTelegramMockBridge(async ({ accountId, update }) => {
  await telegramRuntime.handleUpdate({ accountId, update });
});
```

`handleUpdate` should be your existing Telegram inbound entrypoint (or an adapter that calls it).

## 2) Outbound capture wiring

At the Telegram Bot API call boundary (where `sendMessage`, `editMessageText`, `answerCallbackQuery` payloads are known), call recorder:

```ts
import { createTelegramOutboundRecorder } from "telegram-mock-channel";

const recordTelegramCall = createTelegramOutboundRecorder({
  fallbackAccountId: "default",
});

recordTelegramCall({
  accountId,
  method: "sendMessage",
  payload,
});
```

Recorder returns `false` for unsupported methods and does nothing.

## 3) Account mapping rules

- Prefer explicit `accountId` from runtime call context.
- If absent, use deterministic fallback (for example `default`).
- Do not infer from `chat_id`.

## 4) Error handling contract

- If inbound bridge is not installed, mock inbound API returns `MOCK_HANDLER_FAILURE`.
- Outbound recorder is best-effort; unsupported methods are ignored.
- Preserve mock API envelope shape:
  - success: `{ "ok": true, ... }`
  - error: `{ "ok": false, "error": { "code", "message" } }`

## 5) Verification checklist

After host wiring, validate:

1. Inject `inbound/message` and confirm Telegram handler receives update.
2. Trigger outbound `sendMessage`; confirm event appears in `/outbound`.
3. Trigger callback flow; confirm `answerCallbackQuery` and `editMessageText` appear.
4. Stop gateway; confirm mock API is no longer reachable.

## 6) Suggested host-side test

- Arrange: start gateway with `telegram-mock` account.
- Act:
  - POST `inbound/callback_query`
  - run agent flow that edits message and answers callback.
- Assert:
  - `/outbound?after_seq=0` contains ordered events:
    - `answerCallbackQuery`
    - `editMessageText`
  - `seq` is monotonic for account.
