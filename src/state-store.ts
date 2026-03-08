import type {
  InboundEvent,
  InboundMessageInput,
  InboundCallbackInput,
  MockAccountState,
  OutboundEvent,
  OutboundRecordInput,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class MockStateStore {
  private readonly queueMax: number;
  private readonly accountQueueMax = new Map<string, number>();
  private readonly states = new Map<string, MockAccountState>();

  constructor(queueMax = 10000) {
    this.queueMax = queueMax;
  }

  ensureAccount(account: string): MockAccountState {
    const existed = this.states.get(account);
    if (existed) {
      return existed;
    }
    const ts = nowIso();
    const created: MockAccountState = {
      account,
      lastSeq: 0,
      inboundLog: [],
      outboundQueue: [],
      createdAt: ts,
      updatedAt: ts,
    };
    this.states.set(account, created);
    return created;
  }

  setAccountQueueMax(account: string, queueMax: number): void {
    this.accountQueueMax.set(account, queueMax);
  }

  getAccount(account: string): MockAccountState | undefined {
    return this.states.get(account);
  }

  recordInboundMessage(account: string, input: InboundMessageInput): void {
    this.recordInbound(account, { ts: nowIso(), account, type: "message", raw: input });
  }

  recordInboundCallback(account: string, input: InboundCallbackInput): void {
    this.recordInbound(account, { ts: nowIso(), account, type: "callback_query", raw: input });
  }

  recordOutbound(account: string, input: OutboundRecordInput): OutboundEvent {
    const state = this.ensureAccount(account);
    const queueMax = this.accountQueueMax.get(account) ?? this.queueMax;
    state.lastSeq += 1;
    const event: OutboundEvent = {
      seq: state.lastSeq,
      ts: nowIso(),
      account,
      type: input.type,
      chat_id: input.chat_id,
      message_id: input.message_id,
      text: input.text,
      reply_markup: input.reply_markup,
      raw: input.raw,
    };
    state.outboundQueue.push(event);
    if (state.outboundQueue.length > queueMax) {
      const over = state.outboundQueue.length - queueMax;
      state.outboundQueue.splice(0, over);
    }
    state.updatedAt = nowIso();
    return event;
  }

  listOutbound(account: string, afterSeq = 0, limit = 100): { events: OutboundEvent[]; nextAfterSeq: number } {
    const state = this.ensureAccount(account);
    const normalizedLimit = Math.max(1, Math.min(limit, 1000));
    const events = state.outboundQueue
      .filter((event) => event.seq > afterSeq)
      .slice(0, normalizedLimit);
    const nextAfterSeq = events.length > 0 ? events[events.length - 1]!.seq : afterSeq;
    return { events, nextAfterSeq };
  }

  drainOutbound(account: string, limit?: number): { events: OutboundEvent[]; drainedCount: number; remaining: number } {
    const state = this.ensureAccount(account);
    const take = limit == null ? state.outboundQueue.length : Math.max(0, Math.min(limit, 1000));
    const events = state.outboundQueue.slice(0, take);
    state.outboundQueue = state.outboundQueue.slice(take);
    state.updatedAt = nowIso();
    return {
      events,
      drainedCount: events.length,
      remaining: state.outboundQueue.length,
    };
  }

  reset(account: string, options?: { inbound?: boolean; outbound?: boolean }): void {
    const state = this.ensureAccount(account);
    const inbound = options?.inbound ?? true;
    const outbound = options?.outbound ?? true;
    if (inbound) {
      state.inboundLog = [];
    }
    if (outbound) {
      state.outboundQueue = [];
    }
    state.updatedAt = nowIso();
  }

  private recordInbound(account: string, event: InboundEvent): void {
    const state = this.ensureAccount(account);
    const queueMax = this.accountQueueMax.get(account) ?? this.queueMax;
    state.inboundLog.push(event);
    if (state.inboundLog.length > queueMax) {
      const over = state.inboundLog.length - queueMax;
      state.inboundLog.splice(0, over);
    }
    state.updatedAt = nowIso();
  }
}
