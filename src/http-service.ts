import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { MockError, asMockError } from "./errors.js";
import { MockStateStore } from "./state-store.js";
import type {
  InboundCallbackInput,
  InboundMessageInput,
  MockInboundDispatcher,
  TelegramMockPluginConfig,
} from "./types.js";

type MockHttpServiceOptions = {
  config: TelegramMockPluginConfig;
  state: MockStateStore;
  dispatcher: MockInboundDispatcher;
  logger?: {
    info?: (line: string) => void;
    warn?: (line: string) => void;
    error?: (line: string) => void;
  };
};

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function splitBind(bind: string): { host: string; port: number } {
  const [host, portStr] = bind.split(":");
  const port = Number(portStr);
  if (!host || !Number.isFinite(port) || port < 0) {
    throw new MockError("MOCK_BAD_REQUEST", `Invalid mock_bind: ${bind}`);
  }
  return { host, port };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new MockError("MOCK_BAD_REQUEST", "Invalid JSON body");
  }
}

function authGuard(req: IncomingMessage, apiKey?: string): void {
  if (!apiKey) {
    return;
  }
  const auth = req.headers.authorization;
  if (!auth) {
    throw new MockError("MOCK_AUTH_REQUIRED", "Authorization header is required");
  }
  const expected = `Bearer ${apiKey}`;
  if (auth !== expected) {
    throw new MockError("MOCK_AUTH_INVALID", "Invalid bearer token");
  }
}

function parseAccountPath(pathname: string): { account: string; action: string } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[0] !== "v1" || parts[1] !== "mock" || parts[2] !== "telegram") {
    throw new MockError("MOCK_BAD_REQUEST", "Unsupported path");
  }
  const account = parts[3];
  if (!account) {
    throw new MockError("MOCK_BAD_REQUEST", "Missing account in path");
  }
  const action = parts.slice(4).join("/");
  return { account, action };
}

function asNumber(value: unknown, name: string, required = true): number | undefined {
  if (value == null) {
    if (required) {
      throw new MockError("MOCK_BAD_REQUEST", `Missing field: ${name}`);
    }
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MockError("MOCK_BAD_REQUEST", `Field must be number: ${name}`);
  }
  return value;
}

function asString(value: unknown, name: string, required = true): string | undefined {
  if (value == null) {
    if (required) {
      throw new MockError("MOCK_BAD_REQUEST", `Missing field: ${name}`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new MockError("MOCK_BAD_REQUEST", `Field must be string: ${name}`);
  }
  return value;
}

function parseMessageBody(body: unknown): InboundMessageInput {
  const data = body as Record<string, unknown>;
  const from = (data.from ?? {}) as Record<string, unknown>;
  return {
    chat_id: asNumber(data.chat_id, "chat_id")!,
    from: {
      id: asNumber(from.id, "from.id")!,
      username: asString(from.username, "from.username", false),
    },
    text: asString(data.text, "text")!,
    message_id: asNumber(data.message_id, "message_id", false),
    date: asNumber(data.date, "date", false),
    message_thread_id: asNumber(data.message_thread_id, "message_thread_id", false),
  };
}

function parseCallbackBody(body: unknown): InboundCallbackInput {
  const data = body as Record<string, unknown>;
  const from = (data.from ?? {}) as Record<string, unknown>;
  return {
    chat_id: asNumber(data.chat_id, "chat_id")!,
    message_id: asNumber(data.message_id, "message_id")!,
    from: {
      id: asNumber(from.id, "from.id")!,
      username: asString(from.username, "from.username", false),
    },
    data: asString(data.data, "data")!,
    id: asString(data.id, "id", false),
    message_thread_id: asNumber(data.message_thread_id, "message_thread_id", false),
  };
}

export class MockHttpService {
  private readonly config: TelegramMockPluginConfig;
  private readonly state: MockStateStore;
  private readonly dispatcher: MockInboundDispatcher;
  private readonly logger: MockHttpServiceOptions["logger"];
  private server = createServer((req, res) => {
    void this.route(req, res);
  });

  constructor(options: MockHttpServiceOptions) {
    this.config = options.config;
    this.state = options.state;
    this.dispatcher = options.dispatcher;
    this.logger = options.logger;
  }

  async start(): Promise<void> {
    const bind = this.config.mockBind ?? "127.0.0.1:18790";
    const { host, port } = splitBind(bind);
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    this.logger?.info?.(`[telegram-mock] listening on ${host}:${port}`);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  getCloseAwareServer(): { once: (event: "close", listener: () => void) => unknown } {
    return this.server;
  }

  getAddress(): { host: string; port: number } | null {
    const address = this.server.address();
    if (!address || typeof address === "string") {
      return null;
    }
    return {
      host: address.address,
      port: address.port,
    };
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      authGuard(req, this.config.mockApiKey);
      const url = new URL(req.url ?? "/", "http://localhost");
      const { account, action } = parseAccountPath(url.pathname);
      const accountState = this.state.getAccount(account);
      if (!accountState) {
        throw new MockError("MOCK_ACCOUNT_NOT_FOUND", `Unknown account: ${account}`);
      }

      if (req.method === "POST" && action === "inbound/message") {
        const body = await readJsonBody(req);
        const payload = parseMessageBody(body);
        this.state.recordInboundMessage(account, payload);
        await this.dispatcher.dispatchMessage(account, payload);
        writeJson(res, 200, { ok: true, accepted: true, update_id: `mock-upd-${Date.now()}` });
        return;
      }

      if (req.method === "POST" && action === "inbound/callback_query") {
        const body = await readJsonBody(req);
        const payload = parseCallbackBody(body);
        this.state.recordInboundCallback(account, payload);
        await this.dispatcher.dispatchCallbackQuery(account, payload);
        writeJson(res, 200, {
          ok: true,
          accepted: true,
          update_id: payload.id ?? `mock-cb-${Date.now()}`,
        });
        return;
      }

      if (req.method === "GET" && action === "outbound") {
        const afterSeq = Number(url.searchParams.get("after_seq") ?? "0");
        const limit = Number(url.searchParams.get("limit") ?? "100");
        const result = this.state.listOutbound(account, Number.isFinite(afterSeq) ? afterSeq : 0, limit);
        writeJson(res, 200, {
          ok: true,
          events: result.events,
          next_after_seq: result.nextAfterSeq,
        });
        return;
      }

      if (req.method === "POST" && action === "outbound/drain") {
        const body = (await readJsonBody(req)) as { limit?: number };
        const drained = this.state.drainOutbound(account, body.limit);
        writeJson(res, 200, {
          ok: true,
          events: drained.events,
          drained_count: drained.drainedCount,
          remaining: drained.remaining,
        });
        return;
      }

      if (req.method === "POST" && action === "reset") {
        const body = (await readJsonBody(req)) as { inbound?: boolean; outbound?: boolean };
        this.state.reset(account, { inbound: body.inbound, outbound: body.outbound });
        writeJson(res, 200, { ok: true, reset: true });
        return;
      }

      if (req.method === "GET" && action === "health") {
        writeJson(res, 200, {
          ok: true,
          account,
          mode: this.config.mode ?? "webhook",
          queue_size: accountState.outboundQueue.length,
        });
        return;
      }

      throw new MockError("MOCK_BAD_REQUEST", `Unsupported route: ${req.method} ${url.pathname}`);
    } catch (error) {
      const mockError = asMockError(error);
      const status =
        mockError.code === "MOCK_AUTH_REQUIRED" || mockError.code === "MOCK_AUTH_INVALID"
          ? 401
          : mockError.code === "MOCK_ACCOUNT_NOT_FOUND"
            ? 404
          : mockError.code === "MOCK_BAD_REQUEST"
            ? 400
            : 500;
      if (status >= 500) {
        this.logger?.error?.(`[telegram-mock] request failed: ${mockError.message}`);
      }
      writeJson(res, status, {
        ok: false,
        error: {
          code: mockError.code,
          message: mockError.message,
        },
      });
    }
  }
}
