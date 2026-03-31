# 标准发言记录 -> 导入房间规范

本规范描述如何把 `debate-record/v1` 标准发言记录导入为一个公开只读的归档房间。

## 默认入口

默认使用前台导入：

1. 登录后打开右上角用户名菜单
2. 点击 `导入房间`
3. 在指引弹窗中填写来源链接
4. 确认准备步骤后点击 `上传`
5. 选择一个符合 `debate-record/v1` 的 `record.json`
6. 导入成功后自动跳转到新创建的房间

当前前台入口要求填写有效的来源链接，并上传标准发言记录文件。

## 目标房间形态

- 从前台导入时，创建者为当前登录用户
- 从后台通过命令导入时，创建者由后台导入流程决定
- 房间创建后即为公开归档房间
- 房间必须只读
- `A` 表示正方
- `B` 表示反方
- `other` 发言使用居中的分析风格消息卡片展示
- 如果导入时提供了来源链接，房间侧边栏显示 `来源`

## 只读约束

导入后的房间应满足：

- `isPublic = true`
- `status = ENDED`
- `analysisEnabled = false`

这样匿名用户和登录用户都会以只读方式查看历史内容，不会继续参与实时房间流程。

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

## 上传前检查

上传前至少确认以下几点：

1. JSON 可以直接被解析
2. `schemaVersion` 固定为 `debate-record/v1`
3. `title` 非空，且适合作为房间标题直接展示
4. 前台导入时已准备好有效的来源链接
5. `turns` 是非空数组
6. `turns[].side` 只能是 `A`、`B`、`other`
7. `turns[].content` 都是非空字符串
8. `A` 的 `speaker` 应统一为 `正方`
9. `B` 的 `speaker` 应统一为 `反方`
10. 相邻且同角色的碎片发言已经尽量在生成 `record.json` 时合并

## 导入映射规则

### 房间级字段

- `title` -> `Room.name`
- `createdById`
  - 前台导入时使用当前登录用户
  - 后台命令导入时由后台导入流程决定
- 前台导入时必须提供 `sourceUrl`，后台命令导入时可选 -> `Room.sourceUrl`

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

导入仍然允许继续，但调用方应把这些 `notes` 当作警告信息保留

## CLI 备用入口

如需在前台之外导入，可继续使用命令行：

```bash
pnpm room:import-archive --record "path/to/record.json"
```

可选参数：

```bash
pnpm room:import-archive --record "path/to/record.json" --source "https://example.com/source" --title "自定义标题"
```

- `--source` 可选
- 前台导入时来源链接必填；这里只针对后台 CLI 入口
- `--title` 可选；不提供时默认使用记录中的 `title`

## 成功结果

导入成功后至少应返回：

- 房间号
- 访问路径
- 房间标题
- 导入消息数
- 如果有来源链接，则返回来源链接

## 实施前置步骤

如果本次更新包含 Prisma schema 变更，需要先同步类型并更新数据库：

```bash
pnpm db:generate
pnpm db:push
```
