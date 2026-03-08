declare module "openclaw/plugin-sdk" {
  export type OpenClawConfig = Record<string, unknown>;

  export type OutboundReplyPayload = {
    text?: string;
    [key: string]: unknown;
  };

  export type ChannelSetupInput = {
    name?: string;
    token?: string;
    webhookPath?: string;
    [key: string]: unknown;
  };

  export type ChannelPlugin<TAccount = unknown> = {
    id: string;
    meta: {
      id: string;
      label: string;
      selectionLabel: string;
      docsPath: string;
      blurb: string;
    };
    capabilities: Record<string, unknown>;
    configSchema?: unknown;
    config: Record<string, unknown>;
    setup?: {
      resolveAccountId?: (params: {
        cfg: OpenClawConfig;
        accountId?: string;
        input?: ChannelSetupInput;
      }) => string;
      applyAccountName?: (params: {
        cfg: OpenClawConfig;
        accountId: string;
        name?: string;
      }) => OpenClawConfig;
      applyAccountConfig?: (params: {
        cfg: OpenClawConfig;
        accountId: string;
        input: ChannelSetupInput;
      }) => OpenClawConfig;
      validateInput?: (params: {
        cfg: OpenClawConfig;
        accountId: string;
        input: ChannelSetupInput;
      }) => string | null;
    };
    outbound?: Record<string, unknown>;
    gateway?: Record<string, unknown>;
  };

  export type OpenClawPluginApi = {
    registerChannel: (registration: { plugin: ChannelPlugin } | ChannelPlugin) => void;
  };

  export function emptyPluginConfigSchema(): unknown;
  export function buildChannelConfigSchema(schema: unknown): { schema: Record<string, unknown> };
  export function keepHttpServerTaskAlive(params: {
    server: { once: (event: "close", listener: () => void) => unknown };
    abortSignal?: AbortSignal;
    onAbort?: () => void | Promise<void>;
  }): Promise<void>;
}
