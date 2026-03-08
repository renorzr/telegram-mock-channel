import type { InboundCallbackInput, InboundMessageInput, OutboundRecordInput } from "./types.js";

export type TelegramMockUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: {
      id: number;
      type: "private" | "group" | "supergroup";
    };
    from: {
      id: number;
      is_bot: false;
      username?: string;
    };
    text: string;
    message_thread_id?: number;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: false;
      username?: string;
    };
    message: {
      message_id: number;
      chat: {
        id: number;
        type: "private" | "group" | "supergroup";
      };
      message_thread_id?: number;
    };
    data: string;
  };
};

function resolveChatType(chatId: number): "private" | "group" | "supergroup" {
  if (chatId < 0) {
    return "supergroup";
  }
  return "private";
}

export function toTelegramMessageUpdate(params: {
  updateId: number;
  input: InboundMessageInput;
}): TelegramMockUpdate {
  const { updateId, input } = params;
  return {
    update_id: updateId,
    message: {
      message_id: input.message_id ?? updateId,
      date: input.date ?? Math.floor(Date.now() / 1000),
      chat: {
        id: input.chat_id,
        type: resolveChatType(input.chat_id),
      },
      from: {
        id: input.from.id,
        is_bot: false,
        username: input.from.username,
      },
      text: input.text,
      message_thread_id: input.message_thread_id,
    },
  };
}

export function toTelegramCallbackUpdate(params: {
  updateId: number;
  input: InboundCallbackInput;
}): TelegramMockUpdate {
  const { updateId, input } = params;
  return {
    update_id: updateId,
    callback_query: {
      id: input.id ?? `cbq-${updateId}`,
      from: {
        id: input.from.id,
        is_bot: false,
        username: input.from.username,
      },
      message: {
        message_id: input.message_id,
        chat: {
          id: input.chat_id,
          type: resolveChatType(input.chat_id),
        },
        message_thread_id: input.message_thread_id,
      },
      data: input.data,
    },
  };
}

export function mapTelegramMethodToOutboundEvent(params: {
  method: string;
  payload: Record<string, unknown>;
}): OutboundRecordInput | null {
  const { method, payload } = params;
  if (method === "sendMessage") {
    return {
      type: "sendMessage",
      chat_id: typeof payload.chat_id === "number" ? payload.chat_id : undefined,
      text: typeof payload.text === "string" ? payload.text : undefined,
      reply_markup: payload.reply_markup,
      raw: payload,
    };
  }
  if (method === "editMessageText") {
    return {
      type: "editMessageText",
      chat_id: typeof payload.chat_id === "number" ? payload.chat_id : undefined,
      message_id: typeof payload.message_id === "number" ? payload.message_id : undefined,
      text: typeof payload.text === "string" ? payload.text : undefined,
      reply_markup: payload.reply_markup,
      raw: payload,
    };
  }
  if (method === "answerCallbackQuery") {
    return {
      type: "answerCallbackQuery",
      text: typeof payload.text === "string" ? payload.text : undefined,
      raw: payload,
    };
  }
  return null;
}
