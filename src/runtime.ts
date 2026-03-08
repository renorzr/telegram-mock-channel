import { createDispatcher } from "./bridge.js";
import { MockHttpService } from "./http-service.js";
import { MockStateStore } from "./state-store.js";
import type { OutboundRecordInput, TelegramMockPluginConfig } from "./types.js";

async function waitUntilAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

type RuntimeLogger = {
  info?: (line: string) => void;
  warn?: (line: string) => void;
  error?: (line: string) => void;
};

const store = new MockStateStore(10000);

type ServiceManager = {
  service: MockHttpService;
  refs: Set<string>;
};

const services = new Map<string, ServiceManager>();

function managerKey(config: TelegramMockPluginConfig): string {
  return `${config.mockBind ?? "127.0.0.1:18790"}|${config.mockApiKey ?? ""}`;
}

async function retainService(params: { config: TelegramMockPluginConfig; accountId: string; logger?: RuntimeLogger }): Promise<ServiceManager> {
  const key = managerKey(params.config);
  const existed = services.get(key);
  if (existed) {
    existed.refs.add(params.accountId);
    store.setAccountQueueMax(params.accountId, params.config.queueMax ?? 10000);
    store.ensureAccount(params.accountId);
    return existed;
  }

  const service = new MockHttpService({
    config: params.config,
    state: store,
    dispatcher: createDispatcher(),
    logger: params.logger,
  });
  await service.start();

  const manager: ServiceManager = {
    service,
    refs: new Set([params.accountId]),
  };
  services.set(key, manager);
  store.setAccountQueueMax(params.accountId, params.config.queueMax ?? 10000);
  store.ensureAccount(params.accountId);
  return manager;
}

async function releaseService(params: { config: TelegramMockPluginConfig; accountId: string }): Promise<void> {
  const key = managerKey(params.config);
  const manager = services.get(key);
  if (!manager) {
    return;
  }
  manager.refs.delete(params.accountId);
  if (manager.refs.size > 0) {
    return;
  }
  services.delete(key);
  await manager.service.stop();
}

export function recordOutboundEvent(accountId: string, event: OutboundRecordInput): void {
  store.ensureAccount(accountId);
  store.recordOutbound(accountId, event);
}

export async function runAccountService(params: {
  accountId: string;
  config: TelegramMockPluginConfig;
  abortSignal: AbortSignal;
  logger?: RuntimeLogger;
}): Promise<void> {
  await retainService({
    config: params.config,
    accountId: params.accountId,
    logger: params.logger,
  });
  await waitUntilAbort(params.abortSignal);
  await releaseService({
    config: params.config,
    accountId: params.accountId,
  });
}
