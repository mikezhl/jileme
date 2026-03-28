# 标准发言记录 -> 公开归档房间 规范

本规范描述如何把 `debate-record/v1` 标准发言记录导入为一个只读公开房间。

## 目标房间形态

- 创建者固定为 `@system`
- 房间创建后即为公开归档房间
- 房间必须只读
- 辩手 A 表示正方
- 辩手 B 表示反方
- `other` 发言使用居中的分析风格消息卡片展示
- 房间侧边栏显示一个额外字段：`来源`

## 只读约束

导入后的房间应满足：

- `isPublic = true`
- `status = ENDED`
- `analysisEnabled = false`

这样匿名用户和登录用户都会以只读方式查看历史内容，不会继续参与实时房间流程。

## system 用户

- 若数据库中不存在 `system` 用户，则创建：
  - `username = system`
  - `password = system`
- 若已存在，则直接复用
- 默认禁止 `system` 从前台登录

## 输入文件

输入文件必须符合 `debate-record/v1`：

```json
{
  "schemaVersion": "debate-record/v1",
  "title": "钱是不是万恶之源",
  "turns": [
    { "side": "other", "speaker": "主持人", "content": "......" },
    { "side": "A", "speaker": "正方", "content": "......" },
    { "side": "B", "speaker": "反方", "content": "......" }
  ]
}
```

## 导入命令

```bash
pnpm room:import-archive --record "path/to/record.json" --source "https://example.com/source"
```

可选覆盖标题：

```bash
pnpm room:import-archive --record "path/to/record.json" --source "https://example.com/source" --title "自定义标题"
```

## 导入映射规则

### 房间级字段

- `title` -> `Room.name`
- `--source` -> `Room.sourceUrl`
- `createdById` -> `system` 用户 id

### 消息级字段

每个 turn 导入为一条普通文本消息：

- `type = TEXT`
- `senderUserId = null`
- `externalRef = archive:<roomId>:<seq>`

### participantId 规则

- `A` -> `archive:a`
- `B` -> `archive:b`
- `other` -> `archive:other:<stable-key>`

这样前端可以稳定识别三种展示通道，而不需要新增消息类型。

## 展示规则

### `A`

- 左侧气泡
- `senderName` 显示 `正方`

### `B`

- 右侧气泡
- `senderName` 显示 `反方`

### `other`

- 居中显示
- 使用类似 AI 分析消息的卡片风格
- `senderName` 显示 `主持人`、`评委`、`解说`、`其它` 等角色名

## 数据质量处理

- 导入前会再次做一轮相邻同角色发言压缩，减少碎片化与冗余 token
- 如果输入记录带有：

```json
{
  "quality": {
    "needsReview": true,
    "notes": ["..."]
  }
}
```

导入仍然允许继续，但命令行会给出警告

## 命令输出

导入成功后输出至少包括：

- 房间号
- 访问路径
- 房间标题
- 导入消息数
- 来源链接

## 实施前置步骤

如果本次更新包含 Prisma schema 变更，需要先同步类型并更新数据库：

```bash
pnpm db:generate
pnpm db:push
```
