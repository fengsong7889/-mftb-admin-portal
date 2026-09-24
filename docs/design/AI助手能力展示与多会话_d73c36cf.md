# AI 智能助手：能力展示 + 文件上传 + 多会话管理

## 一、总体架构

```
当前：  [AI 助手 (左)]  [快捷入口 (右)]
改后：  [AI 助手 (左)]  [快捷入口 (右)]
          ├─ 会话标签栏（顶部，+ 新建 / 关闭 / 切换）
          ├─ 对话区
          ├─ 快捷提问条
          ├─ 能力展示条（输入框上方，显示当前模型支持的输入方式）
          └─ 输入区（含附件按钮、拖拽区域）
```

---

## 二、后端改动

### 2.1 扩展 MyModelVO 返回模型能力字段

**文件**: `backend/src/main/java/com/mftb/admin/dto/AiMyCenterDTO.java`

在 `MyModelVO` 中新增字段：
```java
/** 支持模态：text,image,audio,video（逗号分隔） */
private String modalities;
/** 视觉理解（图像识别） */
private Boolean visionSupport;
/** 工具调用（Function Calling） */
private Boolean functionCalling;
/** JSON 结构化输出 */
private Boolean jsonMode;
/** 流式响应 */
private Boolean streaming;
/** 深度思考模式 */
private Boolean thinkingMode;
```

**文件**: `backend/src/main/java/com/mftb/admin/service/impl/AiMyCenterServiceImpl.java`

在 `myModels()` 方法中填充新字段（约 L601-608），从 `AiModel` 实体映射：
```java
mvo.setModalities(model.getModalities());
mvo.setVisionSupport(model.getVisionSupport() != null && model.getVisionSupport() == 1);
mvo.setFunctionCalling(model.getFunctionCalling() != null && model.getFunctionCalling() == 1);
// ... 其余能力字段
```

### 2.2 新建会话持久化表

**新文件**: `backend/sql/103_ai_conversation.sql`

```sql
CREATE TABLE IF NOT EXISTS ai_conversation (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(64)  NOT NULL COMMENT '用户账号',
    title       VARCHAR(200) NOT NULL DEFAULT '新对话' COMMENT '会话标题',
    messages    MEDIUMTEXT   NOT NULL COMMENT '消息列表 JSON',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted     TINYINT      NOT NULL DEFAULT 0,
    INDEX idx_username_updated (username, updated_at DESC)
) COMMENT 'AI 助手会话';

-- 最大会话数配置
INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('ai_max_conversations', '50', '每个用户最大 AI 会话数');
```

**关于会话数上限**：行业做法——ChatGPT/Claude 无硬性上限（侧边栏滚动），Poe 约 20 个可见 tab。我们采用数据库存储 + 标签页最多显示 N 个（可配置，默认 50），超出后自动归档最旧的。数据库存 JSON，实际无上限，50 条 MEDIUMTEXT 对存储压力极小。

### 2.3 会话 CRUD API

**新建文件**:
- `backend/src/main/java/com/mftb/admin/entity/AiConversation.java` — 实体
- `backend/src/main/java/com/mftb/admin/mapper/AiConversationMapper.java` — Mapper
- `backend/src/main/java/com/mftb/admin/service/AiConversationService.java` — 接口
- `backend/src/main/java/com/mftb/admin/service/impl/AiConversationServiceImpl.java` — 实现
- `backend/src/main/java/com/mftb/admin/controller/AiConversationController.java` — API

**API 设计**:
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ai/conversations` | 列出当前用户所有会话（按更新时间倒序） |
| POST | `/api/ai/conversations` | 新建会话，返回 `{id, title}` |
| PUT | `/api/ai/conversations/{id}` | 更新会话（title / messages） |
| DELETE | `/api/ai/conversations/{id}` | 删除指定会话 |
| GET | `/api/ai/conversations/max` | 返回最大会话数配置 |

**安全约束**：所有操作基于 JWT 中的 username，只能操作自己的会话。新建时检查当前会话数是否已达上限，达到则拒绝或自动清理最旧会话。

### 2.4 DataInitializer 注册

**新文件**: `backend/src/main/java/com/mftb/admin/config/AiConversationDataInitializer.java`

按项目规范注册 SQL 迁移，确保启动时自动建表。

---

## 三、前端改动

### 3.1 更新 MyModel 类型

**文件**: `src/api/aiMyCenter.ts`

```typescript
export interface MyModel {
  modelId: number
  modelKey: string
  modelName: string
  providerName: string | null
  deployType: string | null
  sources: ModelAuthSource[]
  // 新增能力字段
  modalities: string | null       // "text,image,audio,video"
  visionSupport: boolean
  functionCalling: boolean
  jsonMode: boolean
  streaming: boolean
  thinkingMode: boolean
}
```

### 3.2 新增会话 API 模块

**新文件**: `src/api/aiConversation.ts`

```typescript
export interface AiConversation {
  id: number
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export function fetchConversations(): Promise<AiConversation[]>
export function createConversation(): Promise<AiConversation>
export function updateConversation(id: number, data: Partial<AiConversation>): Promise<void>
export function deleteConversation(id: number): Promise<void>
export function fetchMaxConversations(): Promise<number>
```

### 3.3 扩展 ChatMessage 类型

**文件**: `src/api/agent.ts`

```typescript
export interface ChatAttachment {
  type: 'image' | 'file'
  name: string
  /** base64 data URL（图片）或文本内容（文件） */
  data: string
  mimeType?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: ChatAttachment[]
  timestamp: Date
}
```

修改 `sendAgentMessage` 支持多模态消息：当用户消息包含图片附件时，构造 `content: [{type: 'text', text: ...}, {type: 'image_url', image_url: {url: dataUrl}}]` 格式。

### 3.4 首页 AI 助手 UI 重构

**文件**: `src/pages/Home/index.tsx`

#### 3.4.1 会话标签栏

在 `.home-ai-header` 下方新增标签栏区域：

```
[对话1 ×] [对话2 ×] [对话3 ×]  [+ 新对话]  [⋯ 历史]
```

- 状态：`conversations: AiConversation[]`、`activeConvId: number`
- 每个标签显示会话标题，点击切换，X 关闭（至少保留 1 个）
- `[+]` 新建会话（检查是否达上限）
- `[⋯ 历史]` 弹出 Popover/Dropdown 列出所有会话，支持搜索和选择
- 切换标签时恢复该会话的消息历史
- 消息变更时自动保存（debounce 2s）到后端

#### 3.4.2 能力展示条

在输入框上方渲染当前模型的能力标签：

```
📝 文字  🖼️ 图片  🎤 语音  📄 文件  ⚡ 工具调用  💭 深度思考
```

- **AUTO 模式**：取所有授权模型能力的并集（展示所有可能的输入方式）
- **指定模型**：展示该模型实际支持的能力
- 支持的输入类型以高亮 Tag 显示，不支持的灰色/隐藏
- 图片/文件能力高亮时，显示附件按钮

#### 3.4.3 文件上传与拖拽

在输入框区域集成文件上传：

- 输入框左侧新增附件按钮（`PaperClipOutlined`），仅在模型支持图片/文件时可用
- 点击按钮弹出文件选择器（accept 根据能力动态设置）
- 支持拖拽文件到输入框区域（`onDrop` / `onDragOver` 事件）
- 文件选择后在输入框上方显示预览：
  - 图片：缩略图预览
  - 其他文件：文件名 + 大小 + 文件类型图标
- 支持移除已添加的附件
- 发送时：图片 → base64 data URL → 多模态消息；其他文件 → 读取文本内容（FileReader.readAsText）→ 文本消息附带文件内容
- 文件大小限制：图片 10MB，其他文件 5MB

#### 3.4.4 状态管理重构

将当前单会话状态重构为多会话：

```typescript
// 会话列表与激活态
const [conversations, setConversations] = useState<AiConversation[]>([])
const [activeConvId, setActiveConvId] = useState<number | null>(null)

// 从当前会话派生消息
const activeConversation = conversations.find(c => c.id === activeConvId)
const messages = activeConversation?.messages ?? []

// 发送消息时更新活跃会话的 messages
// 切换标签时切换 activeConvId
```

### 3.5 样式

**文件**: `src/pages/Home/index.css`

新增样式类：
- `.home-ai-tabs` — 标签栏容器（flex，overflow-x: auto）
- `.home-ai-tab` — 单个标签（带关闭按钮）
- `.home-ai-tab--active` — 激活态
- `.home-ai-tab-add` — 新建按钮
- `.home-ai-capabilities` — 能力展示条
- `.home-ai-capability-tag` — 能力标签
- `.home-ai-attachments` — 附件预览区
- `.home-ai-attachment` — 单个附件（图片缩略图/文件卡片）
- `.home-ai-input--dragging` — 拖拽悬停态视觉反馈
- `.home-ai-send-area` — 发送区域（附件按钮 + 输入框 + 发送按钮）

### 3.6 i18n

**文件**: `src/i18n/locales/zh-TW.json`、`src/i18n/locales/en.json`

新增翻译 key（约 30+ 条），包括：
- 能力标签：`home.capText`（文字）、`home.capImage`（图片）、`home.capAudio`（语音）、`home.capVideo`（视频）、`home.capFile`（文件）、`home.capToolCalling`（工具调用）、`home.capThinking`（深度思考）
- 会话管理：`home.convNew`（新对话）、`home.convHistory`（历史会话）、`home.convDeleteConfirm`（确认删除）、`home.convMaxReached`（已达上限）、`home.convUntitled`（未命名对话）
- 文件上传：`home.attachFile`（添加附件）、`home.attachImage`（添加图片）、`home.dragHint`（拖拽文件到此处）、`home.fileTooLarge`（文件过大）、`home.unsupportedFormat`（不支持的格式）

---

## 四、实施顺序

| 步骤 | 内容 | 涉及文件 |
|------|------|----------|
| 1 | 后端：扩展 MyModelVO + 填充能力字段 | AiMyCenterDTO.java, AiMyCenterServiceImpl.java |
| 2 | 后端：新建 ai_conversation 表 + Entity/Mapper/Service/Controller | 新文件 x5 + SQL |
| 3 | 后端：DataInitializer 注册 | AiConversationDataInitializer.java |
| 4 | 前端：更新 MyModel 类型 + 新增 aiConversation API | aiMyCenter.ts, aiConversation.ts |
| 5 | 前端：扩展 ChatMessage + 多模态发送 | agent.ts |
| 6 | 前端：会话标签栏 UI + 状态重构 | Home/index.tsx, Home/index.css |
| 7 | 前端：能力展示条 | Home/index.tsx, Home/index.css |
| 8 | 前端：文件上传/拖拽/预览 | Home/index.tsx, Home/index.css |
| 9 | 前端：i18n 翻译 | zh-TW.json, en.json |
| 10 | 验证：typecheck + lint + 功能测试 | — |

---

## 五、关键设计决策

1. **会话存储**：后端数据库持久化（非 localStorage），确保跨设备/清除缓存后仍保留
2. **消息格式**：JSON 存储在单列 `messages MEDIUMTEXT`，单会话可支撑数百条消息
3. **最大会话数**：通过 `sys_config.ai_max_conversations` 配置，默认 50；行业无硬性上限，50 是合理的安全值
4. **自动保存**：消息变更后 debounce 2 秒自动保存到后端，避免频繁请求
5. **文件处理**：图片 → base64 多模态发送；其他文件 → 文本提取（readAsText）+ 文件名标注
6. **能力并集**：AUTO 模式下取所有授权模型能力的并集，指定模型时展示该模型实际能力
