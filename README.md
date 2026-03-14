# Logicly Chat (急了么)

[English](#english) | [中文](#中文)

Realtime debate and discussion workspace with voice, text, transcription, and AI analysis.

一个支持文字和语音实时转录的，实时AI分析辩论/吵架平台。


## English

### Features

- User registration, login, room creation, room joining, and view history rooms
- Realtime text chat and LiveKit-based voice communication
- Realtime transcription with multiple providers:
  - `deepgram`
  - `dashscope`
- AI realtime analysis and final summary generation
- User-customized transcription and LLM providers
- Room owner can end a room; ended rooms become read-only
- Usage tracking and limits
- Optional speaker switch mode for self-debate on one device

### Configuration Notes

- Copy `.env.example` to `.env` before starting
- `USER_PROVIDER_KEYS_MODE` controls how runtime credentials are resolved:
  - `false`: Only allows platform-configured LLM and voice transcription providers.
  - `true`: Allows users to configure their own LLM and voice transcription providers. If the user configuration is complete, it takes precedence. Otherwise, it falls back to the platform configuration. The room voice runtime will only choose one source and will not mix platform and user credentials.
  - `full`: Requires a complete user-owned configuration for LLM and voice transcription providers.
- User-managed settings are split by responsibility:
  - LiveKit transport: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
  - Transcription provider (choose one): `DEEPGRAM_API_KEY`, `DASHSCOPE_API_KEY`
  - Analysis LLM: `CONVERSATION_LLM_OPENAI_BASE_URL`, `CONVERSATION_LLM_OPENAI_API_KEY`, `CONVERSATION_LLM_OPENAI_MODEL`


### Start Locally

```bash
pnpm install
pnpm prisma generate
pnpm prisma db push --accept-data-loss
pnpm dev
```

### Docker Deployment

1. Copy `.env.example` to `.env`
2. `docker compose up -d`


## 中文

### 功能介绍

- 用户注册、登录、创建房间、加入房间、查看历史房间
- 基于 LiveKit 的实时文字和语音通话
- 支持多实时转录平台：
  - `deepgram`
  - `dashscope`
- AI 实时分析和最终总结
- 用户自定义配置转录与大模型供应商
- 房主可以结束房间；结束后房间进入只读状态
- 用量统计与限制
- 支持单设备自辩场景下的说话方切换模式

### 配置注意事项

- 启动前先复制 `.env.example` 为 `.env`
- `USER_PROVIDER_KEYS_MODE` 决定运行时凭据如何解析：
  - `false`：仅允许使用平台设置的语音转录与大模型供应商
  - `true`：允许用户配置自己的的语音转录与大模型供应商，且如果配置完整则默认优先使用自己的配置，否则回退到平台配置。整个房间语音运行时只会选择一个来源，不会混用用户与平台的Livekit与转录。
  - `full`：仅允许使用用户配置的的语音转录与大模型供应商
- 用户配置按职责拆分保存：
  - LiveKit 通话配置：`LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`
  - 转录平台二选一：`DEEPGRAM_API_KEY`、`DASHSCOPE_API_KEY`
  - 分析 LLM：`CONVERSATION_LLM_OPENAI_BASE_URL`、`CONVERSATION_LLM_OPENAI_API_KEY`、`CONVERSATION_LLM_OPENAI_MODEL`


### 本地启动

```bash
pnpm install
pnpm prisma generate
pnpm prisma db push --accept-data-loss
pnpm dev
```

### Docker 部署

1. 复制 `.env.example` 为 `.env`
2. `docker compose up -d`
