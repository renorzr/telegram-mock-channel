# OpenClaw `telegram-mock-channel` 插件设计文档

## 1. 背景与目标

在 recipe 集成测试中，我们需要覆盖 Telegram 相关流程（消息触发、按钮回调、编辑消息等），但不希望依赖真实 Telegram 网络、bot token、外部可用性。

本设计定义一个 OpenClaw 插件 `telegram-mock-channel`，用于在本地/CI 环境模拟 Telegram 通道。

目标：

- 对 OpenClaw 内部提供与 Telegram channel 等价的输入/输出语义。
- 支持 webhook callback 方式驱动同一业务处理链路。
- 提供 HTTP API（以及后续 Node SDK）给外部测试程序注入用户行为并断言输出。
- 输出事件语义采用 `at-least-once + per-account seq 去重`。

非目标：

- 不追求 Telegram 全量 API 覆盖（MVP 仅覆盖三类出站方法）。
- 不在本阶段实现 clawchef 内建测试框架（clawchef 仅做编排配置）。

## 2. 术语

- **Inbound**：测试程序注入的“用户到 Bot”事件。
- **Outbound**：OpenClaw 处理后发出的“Bot 到用户”事件。
- **Account**：channel account 名（如 `testbot`），每个 account 状态隔离。
- **Seq**：单调递增序号，用于客户端增量拉取与去重。

## 3. 高层架构

1. 外部测试程序通过 mock HTTP API 发送 inbound 事件。
2. 插件将 inbound 转成 Telegram update 兼容结构。
3. 插件调用 OpenClaw 现有 Telegram handler（与真实 channel 共享业务链路）。
4. handler 产生的 API 调用（`sendMessage` / `editMessageText` / `answerCallbackQuery`）被插件拦截并记录为 outbound 事件。
5. 测试程序通过 outbound API 拉取/清空事件并断言。

## 4. 通道能力范围（MVP）

### 4.1 入站能力

- message
- callback_query

### 4.2 出站能力

- `sendMessage`
- `editMessageText`
- `answerCallbackQuery`

## 5. 配置模型

建议在 OpenClaw channel add 中支持以下参数：

- `channel`: `telegram-mock`
- `account`: `<name>`
- `mock_bind`: `127.0.0.1:18790`（默认）
- `mock_api_key`: `<secret>`（可选）
- `mode`: `webhook | poll`（默认 `webhook`）
- `webhook_path`: `/v1/mock/telegram`（默认）

说明：

- `mode=webhook` 为测试默认路径；`poll` 保留给后续扩展。
- `mock_api_key` 存在时，所有 mock API 需要 Bearer 鉴权。

## 6. 状态与数据结构

按 account 维护独立状态：

```ts
interface MockAccountState {
  account: string;
  lastSeq: number;              // 初始 0
  inboundLog: InboundEvent[];   // 可选，便于排障
  outboundQueue: OutboundEvent[];
  createdAt: string;
  updatedAt: string;
}
```

Outbound 事件：

```ts
interface OutboundEvent {
  seq: number;                  // per-account 单调递增
  ts: string;                   // ISO8601
  account: string;
  type: "sendMessage" | "editMessageText" | "answerCallbackQuery";
  chat_id?: number;
  message_id?: number;
  text?: string;
  reply_markup?: unknown;
  raw?: unknown;                // 可选，原始调用参数
}
```

## 7. 事件语义与一致性

- 语义：`at-least-once`。
- `seq` 作用域：**每个 account 独立**。
- 拉取策略：客户端传 `after_seq` 获取增量；客户端负责幂等去重。
- 事件顺序：单 account 内按写入顺序递增；跨 account 不保证全局时序。

## 8. HTTP API 设计

统一返回结构：

- 成功：`{ "ok": true, ... }`
- 失败：`{ "ok": false, "error": { "code": "...", "message": "..." } }`

### 8.1 注入消息

`POST /v1/mock/telegram/{account}/inbound/message`

请求体字段：

- `chat_id` number (required)
- `from.id` number (required)
- `text` string (required)
- `message_id` number (optional)
- `date` number, unix 秒 (optional)
- `from.username` string (optional)

响应示例：

```json
{
  "ok": true,
  "accepted": true,
  "update_id": "mock-upd-000001"
}
```

### 8.2 注入回调

`POST /v1/mock/telegram/{account}/inbound/callback_query`

请求体字段：

- `chat_id` number (required)
- `message_id` number (required)
- `from.id` number (required)
- `data` string (required)
- `id` string (optional)

### 8.3 获取出站事件

`GET /v1/mock/telegram/{account}/outbound?after_seq=<n>&limit=<n>`

响应：

- `events`: `OutboundEvent[]`
- `next_after_seq`: number

### 8.4 清空并获取出站事件

`POST /v1/mock/telegram/{account}/outbound/drain`

请求体可选：`{ "limit": number }`

响应：

- `events`: `OutboundEvent[]`
- `drained_count`: number
- `remaining`: number

### 8.5 重置状态

`POST /v1/mock/telegram/{account}/reset`

请求体可选：`{ "inbound": true, "outbound": true }`

### 8.6 健康检查

`GET /v1/mock/telegram/{account}/health`

## 9. 错误码

- `MOCK_AUTH_REQUIRED`
- `MOCK_AUTH_INVALID`
- `MOCK_ACCOUNT_NOT_FOUND`
- `MOCK_BAD_REQUEST`
- `MOCK_UNSUPPORTED_EVENT`
- `MOCK_HANDLER_FAILURE`
- `MOCK_INTERNAL_ERROR`

## 10. 安全与隔离

- `mock_api_key` 启用后必须 Bearer 鉴权。
- 默认仅监听 loopback（`127.0.0.1`）。
- 按 account 严格隔离队列与状态，避免测试互串。
- 可配置队列上限（例如 10k 事件）并提供截断策略。

## 11. 与 clawchef 的集成边界

clawchef 仅负责编排：

- recipe 中允许 `channel: telegram-mock`
- 透传 `extra_flags`（`mock_bind`、`mock_api_key`、`mode` 等）
- 不执行测试用例，不做事件断言

示例（clawchef recipe）：

```yaml
channels:
  - channel: "telegram-mock"
    account: "testbot"
    token: "${telegram_mock_api_key}"
    extra_flags:
      mock_bind: "127.0.0.1:18790"
      mock_api_key: "${telegram_mock_api_key}"
      mode: "webhook"
```

## 12. 实施计划

### 里程碑 M1（MVP）

- `telegram-mock` channel 可注册
- inbound message/callback_query 可注入并进入 handler
- outbound 三类事件可记录并通过 API 拉取
- per-account seq 生效

### 里程碑 M2（稳定性）

- 完整错误码与参数校验
- 队列限制与监控指标（事件数量、处理时延）
- 并发与隔离测试

### 里程碑 M3（生态）

- 发布 Node SDK（基于本 HTTP 协议）
- 补充端到端示例测试仓库

## 13. 验收标准

- 无真实 Telegram 网络依赖时，仍可稳定测试 Telegram 相关 recipe 流程。
- 同一测试在 CI 可重复执行，结果稳定。
- 能验证 message、callback、edit 三类核心交互。
- 并发多 account 运行无数据污染。
