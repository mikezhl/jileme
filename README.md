# Jileme Voice Room

急了么，一个实时的AI辩论/吵架辅助+分析+总结平台。
基于 Next.js + LiveKit + Deepgram + PostgreSQL。

## 核心功能

- 用户注册/登录，创建/加入房间，实时语音通信和文字转录
- 创建者可结束对话；结束后房间只读（可看历史，不可发消息/语音）
- 支持用户保存自己的 LiveKit/Deepgram key（加密存 PostgreSQL）

## 环境变量

复制 `.env.example` 为 `.env`，按注释填写。

关键配置：

- `USER_PROVIDER_KEYS_MODE`：`false | true | full`
  - `false`：只用平台（env）key，忽略用户 key
  - `true`：优先用户 key，缺失时回退平台 key
  - `full`：只用用户 key，完全忽略平台 key
- `LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET / DEEPGRAM_API_KEY`
  - 在 `USER_PROVIDER_KEYS_MODE=false/true` 时作为平台 key 使用
- `APP_ENCRYPTION_SECRET`
  - 用于加密用户 key，必须是高强度随机字符串

## 本地运行

```bash
pnpm install
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

默认已支持动态 worker：
- 进入房间后会后台 warmup 对应 LiveKit 项目的 transcriber worker
- 点击「加入语音」时会确保 worker 就绪，再执行 token + dispatch
- 若 `LIVEKIT_TRANSCRIBER_ENABLED=false`，不会 warmup/启动 worker，也不会发起转写 dispatch