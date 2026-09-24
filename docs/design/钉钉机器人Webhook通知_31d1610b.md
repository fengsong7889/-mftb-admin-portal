# 钉钉机器人 Webhook 通知集成

## 整体架构

```
业务触发点                    钉钉通知核心                 外部渠道
───────────────              ──────────────              ─────────
OaRequestServiceImpl ──┐
                       ├──> DingTalkService ──> 钉钉 Webhook API
NotificationServiceImpl ─┤       ↑                    (POST JSON)
  (赠送到期提醒)         │   SysConfigService
                       │   (webhook/secret/开关)
MCP AI 助手 ───────────┘
  (DingTalkExternalHandler)
```

## 1. 后端核心：DingTalkService

新建 `backend/src/main/java/com/mftb/admin/service/DingTalkService.java`（接口）和 `impl/DingTalkServiceImpl.java`（实现）。

**职责：**
- 从 `SysConfigService` 读取 Webhook URL、安全密钥、启用开关（带内存缓存）
- 支持签名模式（HmacSHA256）：timestamp + "\n" + secret → HMAC-SHA256 → Base64 → URL-encode
- 提供三种消息格式：
  - `sendText(content, atMobiles, isAtAll)` — 纯文本
  - `sendMarkdown(title, text, atMobiles, isAtAll)` — Markdown（推荐，排版美观）
  - `sendActionCard(title, text, singleTitle, singleURL)` — 卡片（可带跳转按钮）
- 使用 Spring 内置 `RestTemplate` 发送 HTTP POST（无需新增依赖）
- 发送失败仅 log.error 不抛异常（通知为辅助能力，不应阻断主流程）

**sys_config 配置项：**

| config_key | 说明 | 示例值 |
|---|---|---|
| `dingtalk_webhook_url` | 机器人 Webhook 地址 | `https://oapi.dingtalk.com/robot/send?access_token=xxx` |
| `dingtalk_secret` | 加签密钥（SEC 开头） | `SECxxxxxx` |
| `dingtalk_enabled` | 全局开关 | `true` / `false` |
| `dingtalk_at_mobiles` | 默认 @手机号列表 | `13800138000,13900139000` |

## 2. 业务集成点

### 2.1 OA 审批流程通知（OaRequestServiceImpl）

在现有方法的适当位置调用 `DingTalkService`：

| 触发点 | 通知对象 | 消息内容 |
|---|---|---|
| `submit()` 提交后 | 第一个审批人 | "您有一条新的待审批流程：{标题}，申请人：{姓名}，流程编号：{编号}" |
| `approve()` 通过且还有下一节点 | 下一节点审批人 | "流程 {编号} 已流转至您：{节点名}" |
| `approve()` 全部通过 | 发起人 | "您发起的流程 {编号} 已全部审批通过" |
| `reject()` 驳回后 | 发起人 | "您发起的流程 {编号} 已被 {审批人} 驳回，原因：{原因}" |
| `cancel()` 撤销后 | 所有审批人 | "流程 {编号} 已被申请人撤销" |

### 2.2 赠送到期提醒（NotificationServiceImpl）

在 `generateGiftExpiryNotifications()` 末尾，将生成的通知列表聚合为一条 Markdown 消息推送到钉钉群（避免逐条发送刷屏）。

### 2.3 AI 助手 MCP 工具（DingTalkExternalHandler）

新建 `DingTalkExternalHandler implements McpExternalHandler`：
- `toolKey()` = `"dingtalk_sender"`
- `execute(args)` 接收 `content`（必填）、`msgType`（可选，默认 markdown）、`atMobiles`（可选）
- 遵循现有 L3 人工确认模式（与 EmailExternalHandler 一致）

## 3. 前端：通知渠道配置页面（卡片网格 + 独立二级菜单）

在「系統配置」下新增独立二级菜单「通知渠道配置」，页面采用**卡片网格**布局，每个通知渠道作为独立平台卡片，突出各平台的独立性：

```
系統配置 (sort=13)
├── 菜單配置 (sort=1)
├── 多語言配置 (sort=2)
├── 規則配置 (sort=3)
├── 版本管理 (sort=4)
└── 通知渠道配置 (sort=5)  ← 新增
```

**页面结构：** `src/pages/NotificationConfig/index.tsx`

页面头部沿用统一风格（白色圆角卡片 + 橙色渐变动画条 + 图标标题）。

主体为卡片网格，每个渠道一张独立卡片：

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  🔔                 │  │  💬                 │  │  🐦                 │
│  钉钉               │  │  企业微信            │  │  飞书               │
│  ● 已接入           │  │  ○ 未接入            │  │  ○ 未接入           │
│                     │  │                     │  │                     │
│  通过钉钉自定义      │  │  通过企业微信        │  │  通过飞书自定义      │
│  机器人推送通知      │  │  应用推送通知        │  │  机器人推送通知      │
│                     │  │                     │  │                     │
│  [配置] [测试]       │  │  [即将上线]          │  │  [即将上线]         │
│  启用 ○──●          │  │                     │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

**卡片设计要点：**
- 平台图标：大尺寸彩色图标（钉钉蓝 `#0089FF`、企微绿 `#07C160`、飞书蓝紫 `#3370FF`）
- 状态指示灯：绿色圆点 + "已接入" / 灰色圆点 + "未接入"
- 简介文案：一句话说明该渠道能力
- 操作区：「配置」按钮（打开 Drawer 配置表单）、「测试」按钮（发送测试消息）、启用 Switch
- 未上线渠道卡片置灰，显示「即将上线」占位按钮
- 响应式：`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`

**点击「配置」打开 Drawer 抽屉：**
- 右侧滑出 Drawer（宽度 480px）
- 标题显示对应平台名称 + 图标
- 表单内容：
  - Webhook URL 输入框（密码模式，可切换显示）
  - 加签密钥输入框
  - 默认 @手机号 Tag 输入
  - 底部「保存」+「发送测试消息」按钮

**路由注册：**
- `App.tsx` 增加 `<Route path="/notification-config" element={<NotificationConfig />} />`
- `Sidebar.tsx` 增加 `'notification-config': '/notification-config'` 映射
- `MenuTabs.tsx` 增加面包屑标签
- `DataInitializer.java` 菜单种子数据增加 `notification-config` → parent `system-config`, sort=5

## 4. 后端 API

新建 `NotificationChannelController`（通用通知渠道配置接口，不按渠道拆分 Controller，便于后续扩展）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/notification-channels/{channel}/config` | 读取指定渠道配置（secret 脱敏） |
| PUT | `/api/notification-channels/{channel}/config` | 更新指定渠道配置 |
| POST | `/api/notification-channels/{channel}/test` | 发送测试消息 |

`{channel}` 取值：`dingtalk`（当前）、`wecom`/`feishu`/`email`（预留）

## 5. SQL 迁移脚本

新建 `backend/sql/124_dingtalk_notification.sql`：
- 向 `sys_config` 插入 4 条种子数据（webhook_url / secret / enabled / at_mobiles）
- 向 `mcp_tool` 插入 `dingtalk_sender` 工具种子数据

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `backend/sql/124_dingtalk_notification.sql` | 新建 | SQL 迁移脚本（sys_config 种子 + mcp_tool 种子 + 菜单种子） |
| `backend/.../service/DingTalkService.java` | 新建 | 钉钉通知服务接口 |
| `backend/.../service/impl/DingTalkServiceImpl.java` | 新建 | 钉钉通知服务实现 |
| `backend/.../service/impl/DingTalkExternalHandler.java` | 新建 | MCP 外部工具执行器 |
| `backend/.../controller/NotificationChannelController.java` | 新建 | 通用通知渠道配置 + 测试接口 |
| `backend/.../service/impl/OaRequestServiceImpl.java` | 修改 | 注入 DingTalkService，在 submit/approve/reject/cancel 中发送通知 |
| `backend/.../service/impl/NotificationServiceImpl.java` | 修改 | 赠送到期提醒增加钉钉推送 |
| `backend/.../config/DataInitializer.java` | 修改 | 注册 124 迁移脚本 + 菜单种子数据 |
| `src/pages/NotificationConfig/index.tsx` | 新建 | 通知渠道配置页面（卡片网格 + Drawer 配置表单） |
| `src/pages/NotificationConfig/index.css` | 新建 | 渠道卡片 + 卡片网格样式 |
| `src/api/notificationChannel.ts` | 新建 | 通知渠道配置 API 封装 |
| `src/App.tsx` | 修改 | 新增路由 `/notification-config` |
| `src/components/Sidebar.tsx` | 修改 | 新增菜单路径映射 |
| `src/components/MenuTabs.tsx` | 修改 | 新增面包屑标签 |

## 7. 注意事项

- 钉钉 Webhook 频率限制：每分钟 20 条，需做简单的频率控制或合并发送
- 签名计算使用 JDK 内置 `javax.crypto.Mac` + `HmacSHA256`，无需额外依赖
- 通知发送使用 `@Async` 异步执行，避免阻塞主业务流程
- Webhook URL 和 secret 属于敏感信息，前端读取时 secret 做脱敏处理
