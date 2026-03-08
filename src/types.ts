export type OutboundEventType = "sendMessage" | "editMessageText" | "answerCallbackQuery";

export type MockErrorCode =
  | "MOCK_AUTH_REQUIRED"
  | "MOCK_AUTH_INVALID"
  | "MOCK_ACCOUNT_NOT_FOUND"
  | "MOCK_BAD_REQUEST"
  | "MOCK_UNSUPPORTED_EVENT"
  | "MOCK_HANDLER_FAILURE"
  | "MOCK_INTERNAL_ERROR";

export type InboundMessageInput = {
  chat_id: number;
  from: {
    id: number;
    username?: string;
  };
  text: string;
  message_id?: number;
  date?: number;
  message_thread_id?: number;
};

export type InboundCallbackInput = {
  chat_id: number;
  message_id: number;
  from: {
    id: number;
    username?: string;
  };
  data: string;
  id?: string;
  message_thread_id?: number;
};

export type OutboundEvent = {
  seq: number;
  ts: string;
  account: string;
  type: OutboundEventType;
  chat_id?: number;
  message_id?: number;
  text?: string;
  reply_markup?: unknown;
  raw?: unknown;
};

export type InboundEvent = {
  ts: string;
  account: string;
  type: "message" | "callback_query";
  raw: InboundMessageInput | InboundCallbackInput;
};

export type MockAccountState = {
  account: string;
  lastSeq: number;
  inboundLog: InboundEvent[];
  outboundQueue: OutboundEvent[];
  createdAt: string;
  updatedAt: string;
};

export type TelegramMockPluginConfig = {
  mockBind?: string;
  mockApiKey?: string;
  mode?: "webhook" | "poll";
  webhookPath?: string;
  queueMax?: number;
};

export type OutboundRecordInput = {
  type: OutboundEventType;
  chat_id?: number;
  message_id?: number;
  text?: string;
  reply_markup?: unknown;
  raw?: unknown;
};

export type MockInboundDispatcher = {
  dispatchMessage: (account: string, input: InboundMessageInput) => Promise<void>;
  dispatchCallbackQuery: (account: string, input: InboundCallbackInput) => Promise<void>;
};
