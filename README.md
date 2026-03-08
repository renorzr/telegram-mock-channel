# telegram-mock-channel

`telegram-mock-channel` is an OpenClaw plugin that provides a mock Telegram channel for local and CI tests.

It is designed for integration flows where you need Telegram-like semantics (inbound message/callback and outbound events) without real Telegram network dependencies.

## What is implemented

- OpenClaw plugin entrypoint and manifest (`index.ts`, `openclaw.plugin.json`).
- In-process HTTP control plane with per-account isolated state.
- Mock inbound APIs:
  - `POST /v1/mock/telegram/{account}/inbound/message`
  - `POST /v1/mock/telegram/{account}/inbound/callback_query`
- Mock outbound/state APIs:
  - `GET /v1/mock/telegram/{account}/outbound`
  - `POST /v1/mock/telegram/{account}/outbound/drain`
  - `POST /v1/mock/telegram/{account}/reset`
  - `GET /v1/mock/telegram/{account}/health`
- Per-account monotonic outbound `seq` with at-least-once pull semantics.
- OpenClaw host integration helpers:
  - `installTelegramMockBridge(...)`
  - `recordTelegramOutboundCall(...)`
  - `createTelegramOutboundRecorder(...)`
- Node.js control-plane SDK helper:
  - `createTelegramMockClient(...)`

## Naming map (important)

- npm package name: `telegram-mock-channel`
- plugin id (for `plugins.entries.<id>`): `telegram-mock-channel`
- channel id (for `channels.<id>` / `openclaw channels add --channel ...`): `telegram-mock`

Do not mix plugin id and channel id.

## Local development

```bash
npm install
npm run build
npm run typecheck
npm run test:src
```

## Install into OpenClaw CLI

Install from local path:

```bash
npm run build
openclaw plugins install /absolute/path/to/telegram-mock-channel
```

Verify:

```bash
openclaw plugins list
openclaw plugins info telegram-mock-channel
openclaw plugins doctor
```

## Configure account with CLI

`telegram-mock` now supports `openclaw channels add`:

```bash
openclaw channels add --channel telegram-mock --account loomplus --token <mock-api-key>
```

- `--token` is mapped to `mock_api_key`
- `--webhook-path` is mapped to `webhook_path`

Example generated config shape:

```json5
{
  channels: {
    "telegram-mock": {
      enabled: true,
      accounts: {
        loomplus: {
          enabled: true,
          mock_api_key: "<mock-api-key>",
          webhook_path: "/v1/mock/telegram"
        }
      }
    }
  }
}
```

## Control plane usage (test program)

Important: before using `inbound/message` or `inbound/callback_query`, you must install a bridge with `installTelegramMockBridge(...)` in your host process. Otherwise inbound requests fail with `MOCK_HANDLER_FAILURE` ("Telegram mock bridge is not configured ...").

Minimal no-op bridge (for control-plane smoke tests only):

```ts
import { installTelegramMockBridge } from "telegram-mock-channel";

installTelegramMockBridge(async () => {
  // no-op: accepts inbound without forwarding into Telegram runtime
});
```

Assume plugin account `loomplus` is configured and server binds to `127.0.0.1:18790`.

Set auth header when `mock_api_key` is configured:

```bash
export MOCK_BASE="http://127.0.0.1:18790/v1/mock/telegram/loomplus"
export MOCK_AUTH="Authorization: Bearer <mock-api-key>"
```

Inject inbound message:

```bash
curl -sS -X POST "$MOCK_BASE/inbound/message" \
  -H "Content-Type: application/json" \
  -H "$MOCK_AUTH" \
  -d '{"chat_id":123,"from":{"id":42},"text":"hello"}'
```

Inject callback query:

```bash
curl -sS -X POST "$MOCK_BASE/inbound/callback_query" \
  -H "Content-Type: application/json" \
  -H "$MOCK_AUTH" \
  -d '{"chat_id":123,"message_id":7,"from":{"id":42},"data":"confirm"}'
```

Pull outbound events:

```bash
curl -sS "$MOCK_BASE/outbound?after_seq=0&limit=100" -H "$MOCK_AUTH"
```

Drain outbound queue:

```bash
curl -sS -X POST "$MOCK_BASE/outbound/drain" \
  -H "Content-Type: application/json" \
  -H "$MOCK_AUTH" \
  -d '{"limit":50}'
```

Reset inbound/outbound state:

```bash
curl -sS -X POST "$MOCK_BASE/reset" \
  -H "Content-Type: application/json" \
  -H "$MOCK_AUTH" \
  -d '{"inbound":true,"outbound":true}'
```

Node.js SDK example (test program):

```ts
import { createTelegramMockClient } from "telegram-mock-channel";

const client = createTelegramMockClient({
  baseUrl: "http://127.0.0.1:18790/v1/mock/telegram",
  account: "loomplus",
  apiKey: "<mock-api-key>",
});

const inboundResult = await client.inboundMessage({
  chat_id: 123,
  from: { id: 42, username: "alice" },
  text: "hello from test",
});

const outbound = await client.listOutbound({ afterSeq: 0, limit: 100 });
const drained = await client.drainOutbound({ limit: 50 });
const health = await client.health();
const reset = await client.reset({ inbound: true, outbound: true });

console.log(inboundResult.ok, outbound.events.length, drained.drained_count, health.queue_size, reset.reset);
```

SDK methods throw `TelegramMockClientError` when API returns `{ ok: false, error: ... }`.

Low-level HTTP via `curl`/`fetch` is still supported for debugging.

## Bridge into OpenClaw Telegram runtime

In host integration, wire mock inbound updates into the same Telegram inbound path:

```ts
import {
  installTelegramMockBridge,
  recordTelegramOutboundCall,
} from "telegram-mock-channel";

installTelegramMockBridge(async ({ accountId, update }) => {
  await telegramRuntime.handleUpdate({ accountId, update });
});

function onTelegramApiCall(accountId: string, method: string, payload: Record<string, unknown>) {
  recordTelegramOutboundCall({ accountId, method, payload });
}
```

Why this is required:

- `gateway.startAccount` starts the mock HTTP service lifecycle.
- `installTelegramMockBridge(...)` binds inbound mock updates to your Telegram runtime handler.
- Keeping this explicit avoids false-positive tests where inbound is accepted but never processed by business logic.

See `docs/openclaw-host-integration.md` for recommended patch points.

## Security defaults

- Default bind is loopback (`127.0.0.1:18790`).
- Optional Bearer auth via `mock_api_key`.
- Account state is isolated in memory.

## Design doc

See `telegram-mock-channel-design.md` for API contract and MVP scope.
