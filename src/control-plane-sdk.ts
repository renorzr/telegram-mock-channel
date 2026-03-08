import type { InboundCallbackInput, InboundMessageInput, OutboundEvent } from "./types.js";

export type TelegramMockApiError = {
  code: string;
  message: string;
};

type TelegramMockErrorEnvelope = {
  ok: false;
  error: TelegramMockApiError;
};

export type TelegramMockInboundAcceptedResponse = {
  ok: true;
  accepted: true;
  update_id: string;
};

export type TelegramMockListOutboundResponse = {
  ok: true;
  events: OutboundEvent[];
  next_after_seq: number;
};

export type TelegramMockDrainOutboundResponse = {
  ok: true;
  events: OutboundEvent[];
  drained_count: number;
  remaining: number;
};

export type TelegramMockResetResponse = {
  ok: true;
  reset: true;
};

export type TelegramMockHealthResponse = {
  ok: true;
  account: string;
  mode: "webhook" | "poll";
  queue_size: number;
};

export class TelegramMockClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(params: { code: string; message: string; status: number }) {
    super(params.message);
    this.code = params.code;
    this.status = params.status;
  }
}

export type CreateTelegramMockClientParams = {
  baseUrl: string;
  account: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildAuthHeaders(params: {
  apiKey?: string;
  headers?: Record<string, string>;
  hasBody: boolean;
}): Record<string, string> {
  const next: Record<string, string> = {
    ...(params.headers ?? {}),
  };
  if (params.apiKey?.trim()) {
    next.authorization = `Bearer ${params.apiKey.trim()}`;
  }
  if (params.hasBody && !next["content-type"]) {
    next["content-type"] = "application/json";
  }
  return next;
}

export function createTelegramMockClient(params: CreateTelegramMockClientParams) {
  const fetchImpl = params.fetchImpl ?? fetch;
  const base = stripTrailingSlashes(params.baseUrl);
  const account = encodeURIComponent(params.account.trim());
  const accountBaseUrl = `${base}/${account}`;

  async function request<T>(options: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  }): Promise<T> {
    const hasBody = options.body !== undefined;
    const response = await fetchImpl(`${accountBaseUrl}${options.path}`, {
      method: options.method,
      headers: buildAuthHeaders({
        apiKey: params.apiKey,
        headers: params.headers,
        hasBody,
      }),
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    const raw = (await response.json()) as
      | T
      | TelegramMockErrorEnvelope
      | { ok?: boolean; error?: TelegramMockApiError };

    if (
      typeof raw === "object" &&
      raw !== null &&
      "ok" in raw &&
      raw.ok === false &&
      "error" in raw &&
      raw.error &&
      typeof raw.error.code === "string" &&
      typeof raw.error.message === "string"
    ) {
      throw new TelegramMockClientError({
        code: raw.error.code,
        message: raw.error.message,
        status: response.status,
      });
    }

    if (!response.ok) {
      throw new TelegramMockClientError({
        code: "MOCK_HTTP_ERROR",
        message: `HTTP ${response.status}`,
        status: response.status,
      });
    }

    return raw as T;
  }

  return {
    inboundMessage(input: InboundMessageInput): Promise<TelegramMockInboundAcceptedResponse> {
      return request<TelegramMockInboundAcceptedResponse>({
        method: "POST",
        path: "/inbound/message",
        body: input,
      });
    },
    inboundCallbackQuery(input: InboundCallbackInput): Promise<TelegramMockInboundAcceptedResponse> {
      return request<TelegramMockInboundAcceptedResponse>({
        method: "POST",
        path: "/inbound/callback_query",
        body: input,
      });
    },
    listOutbound(params?: { afterSeq?: number; limit?: number }): Promise<TelegramMockListOutboundResponse> {
      const afterSeq = params?.afterSeq ?? 0;
      const limit = params?.limit ?? 100;
      return request<TelegramMockListOutboundResponse>({
        method: "GET",
        path: `/outbound?after_seq=${afterSeq}&limit=${limit}`,
      });
    },
    drainOutbound(params?: { limit?: number }): Promise<TelegramMockDrainOutboundResponse> {
      return request<TelegramMockDrainOutboundResponse>({
        method: "POST",
        path: "/outbound/drain",
        body: params?.limit == null ? {} : { limit: params.limit },
      });
    },
    reset(params?: { inbound?: boolean; outbound?: boolean }): Promise<TelegramMockResetResponse> {
      return request<TelegramMockResetResponse>({
        method: "POST",
        path: "/reset",
        body: {
          ...(params?.inbound != null ? { inbound: params.inbound } : {}),
          ...(params?.outbound != null ? { outbound: params.outbound } : {}),
        },
      });
    },
    health(): Promise<TelegramMockHealthResponse> {
      return request<TelegramMockHealthResponse>({
        method: "GET",
        path: "/health",
      });
    },
  };
}

export type TelegramMockControlPlaneClient = ReturnType<typeof createTelegramMockClient>;
