import test from "node:test";
import assert from "node:assert/strict";
import { MockHttpService } from "../src/http-service.js";
import { MockStateStore } from "../src/state-store.js";

test("health returns account not found for unknown account", async () => {
  const state = new MockStateStore();
  const service = new MockHttpService({
    config: { mockBind: "127.0.0.1:0" },
    state,
    dispatcher: {
      dispatchMessage: async () => {},
      dispatchCallbackQuery: async () => {},
    },
  });

  await service.start();
  const addr = service.getAddress();
  assert.ok(addr);

  const res = await fetch(`http://127.0.0.1:${addr!.port}/v1/mock/telegram/default/health`);
  const json = (await res.json()) as { ok: boolean; error?: { code: string } };

  assert.equal(res.status, 404);
  assert.equal(json.ok, false);
  assert.equal(json.error?.code, "MOCK_ACCOUNT_NOT_FOUND");

  await service.stop();
});

test("health works for known account", async () => {
  const state = new MockStateStore();
  state.ensureAccount("default");

  const service = new MockHttpService({
    config: { mockBind: "127.0.0.1:0" },
    state,
    dispatcher: {
      dispatchMessage: async () => {},
      dispatchCallbackQuery: async () => {},
    },
  });

  await service.start();
  const addr = service.getAddress();
  assert.ok(addr);

  const res = await fetch(`http://127.0.0.1:${addr!.port}/v1/mock/telegram/default/health`);
  const json = (await res.json()) as { ok: boolean; account?: string };

  assert.equal(res.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.account, "default");

  await service.stop();
});
