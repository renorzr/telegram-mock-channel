import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { telegramMockPlugin } from "./src/channel.js";

const plugin = {
  id: "telegram-mock-channel",
  name: "Telegram Mock",
  description: "Mock Telegram channel plugin for tests and CI",
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: telegramMockPlugin });
  },
};

export default plugin;

export { setTelegramMockBridge } from "./src/bridge.js";
export { recordOutboundEvent } from "./src/runtime.js";
export {
  installTelegramMockBridge,
  recordTelegramOutboundCall,
  createTelegramOutboundRecorder,
} from "./src/openclaw-integration.js";
export {
  createTelegramMockClient,
  TelegramMockClientError,
} from "./src/control-plane-sdk.js";
export {
  mapTelegramMethodToOutboundEvent,
  toTelegramCallbackUpdate,
  toTelegramMessageUpdate,
} from "./src/telegram-compat.js";
export type {
  InboundMessageInput,
  InboundCallbackInput,
  OutboundEvent,
  TelegramMockPluginConfig,
} from "./src/types.js";
export type { TelegramMockUpdate } from "./src/telegram-compat.js";
export type { TelegramApiCallInput } from "./src/openclaw-integration.js";
export type {
  CreateTelegramMockClientParams,
  TelegramMockApiError,
  TelegramMockControlPlaneClient,
  TelegramMockInboundAcceptedResponse,
  TelegramMockListOutboundResponse,
  TelegramMockDrainOutboundResponse,
  TelegramMockResetResponse,
  TelegramMockHealthResponse,
} from "./src/control-plane-sdk.js";
