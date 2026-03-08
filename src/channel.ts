import type {
  ChannelPlugin,
  OpenClawConfig,
  OutboundReplyPayload,
} from "openclaw/plugin-sdk";
import { runAccountService, recordOutboundEvent } from "./runtime.js";
import type { TelegramMockPluginConfig } from "./types.js";

type ResolvedTelegramMockAccount = {
  accountId: string;
  enabled: boolean;
  config: TelegramMockPluginConfig;
};

type MockSendTextCtx = {
  to: string;
  text: string;
  accountId?: string | null;
};

type MockSendPayloadCtx = {
  accountId?: string | null;
  to: string;
  payload: unknown;
};

type MockGatewayCtx = {
  accountId: string;
  account: ResolvedTelegramMockAccount;
  abortSignal: AbortSignal;
  log?: {
    info?: (line: string) => void;
    warn?: (line: string) => void;
    error?: (line: string) => void;
  };
};

type ChannelConfigRoot = {
  channels?: Record<string, unknown>;
};

type ChannelSection = Record<string, unknown>;

function normalizeAccountId(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "default";
}

function asSection(value: unknown): ChannelSection {
  if (value && typeof value === "object") {
    return value as ChannelSection;
  }
  return {};
}

function patchScopedAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  patch: Record<string, unknown>;
}): OpenClawConfig {
  const root = params.cfg as ChannelConfigRoot;
  const channels = root.channels ?? {};
  const section = asSection(channels["telegram-mock"]);
  const accountId = normalizeAccountId(params.accountId);

  if (accountId === "default" && !section.accounts) {
    return {
      ...params.cfg,
      channels: {
        ...channels,
        "telegram-mock": {
          ...section,
          enabled: true,
          ...params.patch,
        },
      },
    } as OpenClawConfig;
  }

  const accounts = asSection(section.accounts) as Record<string, Record<string, unknown>>;
  const existing = asSection(accounts[accountId]);

  return {
    ...params.cfg,
    channels: {
      ...channels,
      "telegram-mock": {
        ...section,
        enabled: true,
        accounts: {
          ...accounts,
          [accountId]: {
            ...existing,
            enabled: (existing.enabled as boolean | undefined) ?? true,
            ...params.patch,
          },
        },
      },
    },
  } as OpenClawConfig;
}

function resolveSection(cfg: OpenClawConfig): Record<string, unknown> {
  const channels = (cfg as { channels?: Record<string, unknown> }).channels ?? {};
  const section = channels["telegram-mock"];
  if (section && typeof section === "object") {
    return section as Record<string, unknown>;
  }
  return {};
}

function resolveAccount(cfg: OpenClawConfig, accountId = "default"): ResolvedTelegramMockAccount {
  const section = resolveSection(cfg);
  const accounts = (section.accounts ?? {}) as Record<string, Record<string, unknown>>;
  const scoped = accounts[accountId] ?? {};
  return {
    accountId,
    enabled: (scoped.enabled as boolean | undefined) ?? true,
    config: {
      mockBind: (scoped.mock_bind as string | undefined) ?? (section.mock_bind as string | undefined),
      mockApiKey: (scoped.mock_api_key as string | undefined) ?? (section.mock_api_key as string | undefined),
      mode: ((scoped.mode as "webhook" | "poll" | undefined) ??
        (section.mode as "webhook" | "poll" | undefined) ??
        "webhook") as "webhook" | "poll",
      webhookPath:
        (scoped.webhook_path as string | undefined) ??
        (section.webhook_path as string | undefined) ??
        "/v1/mock/telegram",
      queueMax:
        (scoped.queue_max as number | undefined) ??
        (section.queue_max as number | undefined) ??
        10000,
    },
  };
}

function listAccounts(cfg: OpenClawConfig): string[] {
  const section = resolveSection(cfg);
  const accounts = (section.accounts ?? {}) as Record<string, unknown>;
  const keys = Object.keys(accounts);
  return keys.length > 0 ? keys : ["default"];
}

const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    mock_bind: { type: "string" },
    mock_api_key: { type: "string" },
    mode: { type: "string", enum: ["webhook", "poll"] },
    webhook_path: { type: "string" },
    queue_max: { type: "number", minimum: 1, maximum: 100000 },
    accounts: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean" },
          mock_bind: { type: "string" },
          mock_api_key: { type: "string" },
          mode: { type: "string", enum: ["webhook", "poll"] },
          webhook_path: { type: "string" },
          queue_max: { type: "number", minimum: 1, maximum: 100000 }
        }
      }
    }
  }
} as const;

export const telegramMockPlugin: ChannelPlugin<ResolvedTelegramMockAccount> = {
  id: "telegram-mock",
  meta: {
    id: "telegram-mock",
    label: "Telegram Mock",
    selectionLabel: "Telegram Mock (Test)",
    docsPath: "/channels/telegram-mock",
    blurb: "Mock Telegram channel for integration tests",
  },
  capabilities: {
    chatTypes: ["direct", "group", "thread"],
    reactions: false,
    threads: true,
    media: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  },
  configSchema: { schema: configSchema },
  config: {
    listAccountIds: (cfg: OpenClawConfig) => listAccounts(cfg),
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) =>
      resolveAccount(cfg, accountId ?? "default"),
    defaultAccountId: () => "default",
    isEnabled: (account: ResolvedTelegramMockAccount) => account.enabled,
    isConfigured: () => true,
    unconfiguredReason: () => "not configured",
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) => {
      const trimmed = name?.trim();
      if (!trimmed) {
        return cfg;
      }
      return patchScopedAccountConfig({
        cfg,
        accountId,
        patch: { name: trimmed },
      });
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const payload = input as Record<string, unknown>;
      const token = typeof payload.token === "string" ? payload.token.trim() : "";
      const webhookPath = typeof payload.webhookPath === "string" ? payload.webhookPath.trim() : "";

      const patch: Record<string, unknown> = {};
      if (token) {
        patch.mock_api_key = token;
      }
      if (webhookPath) {
        patch.webhook_path = webhookPath;
      }

      return patchScopedAccountConfig({ cfg, accountId, patch });
    },
    validateInput: () => null,
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text, accountId }: MockSendTextCtx) => {
      const chatId = Number(to);
      const messageId = Date.now();
      recordOutboundEvent(accountId ?? "default", {
        type: "sendMessage",
        chat_id: Number.isFinite(chatId) ? chatId : undefined,
        message_id: messageId,
        text,
        raw: { chat_id: to, text },
      });
      return { ok: true, channel: "telegram-mock", messageId };
    },
    sendPayload: async ({ accountId, to, payload }: MockSendPayloadCtx) => {
      const reply = payload as OutboundReplyPayload;
      const text = reply.text ?? "";
      const chatId = Number(to);
      const messageId = Date.now();
      recordOutboundEvent(accountId ?? "default", {
        type: "sendMessage",
        chat_id: Number.isFinite(chatId) ? chatId : undefined,
        message_id: messageId,
        text,
        raw: payload,
      });
      return { ok: true, channel: "telegram-mock", messageId };
    },
  },
  gateway: {
    startAccount: async (ctx: MockGatewayCtx) => {
      ctx.log?.info?.(`[${ctx.accountId}] starting telegram-mock gateway account`);
      await runAccountService({
        accountId: ctx.accountId,
        config: ctx.account.config,
        abortSignal: ctx.abortSignal,
        logger: {
          info: (line) => ctx.log?.info?.(line),
          warn: (line) => ctx.log?.warn?.(line),
          error: (line) => ctx.log?.error?.(line),
        },
      });
    },
  },
};
