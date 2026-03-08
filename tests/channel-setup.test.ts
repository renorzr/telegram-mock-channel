import test from "node:test";
import assert from "node:assert/strict";
import { telegramMockPlugin } from "../src/channel.js";

test("setup applyAccountConfig stores token and webhook path for account", () => {
  const apply = telegramMockPlugin.setup?.applyAccountConfig;
  assert.ok(apply);

  const cfg = apply({
    cfg: {},
    accountId: "loomplus",
    input: { token: "secret", webhookPath: "/v1/mock/telegram" },
  }) as { channels?: Record<string, unknown> };

  const section = cfg.channels?.["telegram-mock"] as {
    enabled?: boolean;
    accounts?: Record<string, { mock_api_key?: string; webhook_path?: string; enabled?: boolean }>;
  };

  assert.equal(section?.enabled, true);
  assert.equal(section?.accounts?.loomplus?.enabled, true);
  assert.equal(section?.accounts?.loomplus?.mock_api_key, "secret");
  assert.equal(section?.accounts?.loomplus?.webhook_path, "/v1/mock/telegram");
});

test("setup applyAccountConfig keeps accounts isolated", () => {
  const apply = telegramMockPlugin.setup?.applyAccountConfig;
  assert.ok(apply);

  const seeded = {
    channels: {
      "telegram-mock": {
        enabled: true,
        accounts: {
          default: { mock_api_key: "default-key", enabled: true },
        },
      },
    },
  };

  const next = apply({
    cfg: seeded,
    accountId: "loomplus",
    input: { token: "loomplus-key" },
  }) as {
    channels?: {
      "telegram-mock"?: {
        accounts?: Record<string, { mock_api_key?: string }>;
      };
    };
  };

  assert.equal(next.channels?.["telegram-mock"]?.accounts?.default?.mock_api_key, "default-key");
  assert.equal(next.channels?.["telegram-mock"]?.accounts?.loomplus?.mock_api_key, "loomplus-key");
});
