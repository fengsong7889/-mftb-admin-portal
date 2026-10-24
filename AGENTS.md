# AGENTS.md — Agent 操作指南

> 本文件为 AI Agent 和开发者提供项目操作所需的关键信息。
> 版本控制追踪，所有协作者共享。

## 项目概述

闪蜂推广管理后台（admin-portal）— 基于 React 18 + Vite 6 + Ant Design 5 的管理后台系统。

## 运行时版本

| 依赖 | 版本 |
|------|------|
| Node.js | 20（CI 固定版本） |
| npm | 随 Node 20 附带 |
| TypeScript | ^5.6.3 |
| Vite | ^6.0.1 |

## 常用命令

```bash
# 安装依赖（必须使用 --legacy-peer-deps）
npm ci --legacy-peer-deps

# 本地开发
npm run dev

# 类型检查（不产出文件）
npm run typecheck

# 构建（含类型检查）
npm run build:strict

# 构建（跳过类型检查，仅打包）
npm run build

# Lint 检查
npm run lint

# Lint 自动修复
npm run lint:fix

# 运行测试（watch 模式）
npm run test

# 运行测试（单次）
npm run test:run

# 测试覆盖率
npm run test:coverage

# 影响域验证（日常主档位，只跑受影响的测试，见 .qoder/rules/edit-verification.md）
npm run check:affected          # 仅分析并打印推荐命令
npm run test:affected           # 分析并执行（lint + typecheck + 受影响前后端测试）
node scripts/affected-tests.mjs --run --files src/pages/Xxx/foo.ts   # 精确指定本次编辑

# 安全扫描（检测硬编码凭据）
npm run secret-scan

# UI 规范门禁（列表页统计卡片必须在搜索区下方，见 §E.8）
npm run check:stat-order

# 确认弹窗门禁（所有 Modal.confirm 必须带 custom-confirm-modal + 规范图标，见 §B.1/§B.3）
npm run check:confirm-modal
```

## 关键约束

1. **安装必须使用 `--legacy-peer-deps`**：项目存在 peer dependency 冲突，不加此参数安装会失败。
2. **类型检查**：`tsconfig.json` 启用 `strict: true`，CI 使用 `build:strict`（`tsc && vite build`）执行类型检查。
3. **环境变量**：前端 Mock 凭据通过 `.env.local`（已 gitignore）注入，参考 `.env.example`；
   后端运行时凭据（`DB_URL`/`DB_USERNAME`/`DB_PASSWORD`/`JWT_SECRET`）统一放 `backend/.env.local`（已 gitignore），
   参考 `backend/.env.local.example`。**任何受版本控制的文件禁止写入明文凭据**，由 `npm run secret-scan` 拦截。
   环境全貌（后端地址、数据库、工具链版本、换电脑清单）见 `ENVIRONMENT-REFERENCE.md`，
   环境信息变动时必须同步更新该文件（见「参考文档索引 · 环境与运维」）。
4. **路径别名**：`@/` 映射到 `src/`，在 `tsconfig.json` 和 `vite.config.ts` 中同步配置。
5. **员工选择统一用 `EmployeeSelect` 组件**：凡表单中需要选择员工/人员的字段，一律使用
   `src/pages/MeetingManagement/EmployeeSelect.tsx`（`single` 模式单选），禁止使用普通 `<Input>` 文本框。
   选项显示格式为 `姓名(工号)` 如 `张三(MF00001)`，数据源为在职员工远程搜索接口。
   **所有选员工的下拉框只显示「姓名 + 工号」，禁止拼部门**（含 `· 部门`、`（部门）` 等形式）：
   部门不能帮助消歧，还会把组织归属批量暴露给任何能打开该页的人。仅当用户明确要求带部门时
   才可展示，并必须在调用处注释说明理由（例：`src/api/employee.ts` 的资产使用人场景）。
   表单需同时存储 `*UserId`（sys_user.id）和 `*UserName`（姓名快照）两个字段，
   通过 `onChange` 写 userId、`onPick` 写 userName 实现双写。
   参考实现：`src/pages/Rdm/ProjectDetail.tsx`（项目基本信息负责人字段）。

## 项目结构

```
src/
├── components/       # 共享组件（HeaderBar, Sidebar, ContentArea 等）
├── constants/        # 常量定义（品牌、枚举）
├── contexts/         # React Context（AuthContext）
├── hooks/            # 自定义 Hooks（useColumnConfig）
├── pages/            # 页面组件（按功能模块分目录）
│   ├── Home/         # 首页工作台
│   ├── Login/        # 登录页
│   ├── Recommend/    # 推荐管理
│   ├── SearchConfigNew/  # 搜索配置
│   ├── PromotionReport/  # 推广报表
│   ├── Permission/   # 权限管理
│   └── ...
├── styles/           # 全局样式（components.css, global.css）
├── App.tsx           # 根组件（路由配置）
└── main.tsx          # 入口文件
```

## CI/CD

- **平台**：GitHub Actions → GitHub Pages
- **触发**：push 到 main 分支
- **质量门禁**：lint + typecheck + menu-consistency + stat-card-order + confirm-modal + i18n + secret-scan + test（任一失败中止部署）
- **部署**：`actions/deploy-pages@v4`

## 测试

- **框架**：Vitest + @testing-library/react
- **环境**：jsdom
- **配置**：`vitest.config.ts`
- **测试文件**：`src/**/*.{test,spec}.{ts,tsx}`
- **Setup**：`src/test/setup.ts`（localStorage mock、matchMedia mock）

## Lint

- **框架**：ESLint 9（Flat Config）
- **配置**：`eslint.config.js`
- **规则**：TypeScript ESLint recommended + React Hooks 核心规则
- **已知警告**：现有代码库存在约 300 个 warning（unused vars、any 类型），渐进修复中

## MCP 工具使用指引

项目配置了以下 MCP 服务器，按需使用：

| MCP | 用途 | 使用场景 |
|-----|------|----------|
| **github** | GitHub API 操作 | 查看 PR、Issue、提交历史、代码搜索 |
| **Framelink MCP for Figma** | Figma 设计稿解析 | 用户贴出 Figma 链接时，提取设计数据 |
| **context7** | 库文档查询 | 查询第三方库最新 API 和用法 |

约束：不要在没有明确需求时主动调用 MCP；Figma 仅在设计相关任务中使用。

---

# 按需规则文件索引

> 以下强制规范已迁移到 `.qoder/rules/` 目录下的独立文件，按需加载。
> 触发条件匹配时会自动注入，无需每次会话都读取全部内容。

| 规则文件 | 触发条件 | 内容摘要 |
|---------|---------|---------|
| `backend-restart.md` | 启动/重启/停止后端服务 | 后端重启策略、命令选择、验证方法 |
| `edit-verification.md` | 编辑代码后 | 分级影响域验证：L0（变更文件 lint + 增量 typecheck）/ L1（只跑受影响测试）/ L2（提交推送前全量，共享层改动强制升档） |
| `frontend-coding-standards.md` | 编写前端代码 | 架构设计、TypeScript 规范、命名风格、组件库版本 |
| `backend-sql-migration.md` | 编写后端 SQL 或迁移代码 | MySQL 方言约束、迁移文件管理、Java 迁移代码规范、就绪门禁 |
| `frontend-ui-design-spec.md` | 涉及前端界面开发 | 设计令牌、交互样式、新增/编辑/详情/列表界面规范、**列表页统计卡片位置（§E.8）**、反馈提醒、i18n、注释、菜单图标、样式架构、UI 检查清单、禁止清单 |
| `form-page-style.md` | 新增/编辑/详情类表单页面 | 页面头部（橙色渐变动画条 + 返回按钮）、白色 div 模块卡片（禁用 antd Card 彩色标题头）、图标色块配色约定、表单布局（vertical Form、行内配置项标签右对齐）、底部 `.form-footer` 操作按钮 |
| `security-architecture-quality.md` | 前后端开发 | 安全元规则、总原则、开发工作流、前后端规范、数据库设计、API 契约、测试门禁、完成定义、禁止清单、检查清单 |
| `business-data-dictionary.md` | 涉及业务枚举值 | 系统级枚举常量（品牌、业务类型、状态等） |
| `efficient-dev-mode.md` | 涉及界面调整 | 高效开发模式（两阶段交付：先 UI 后 i18n/后端/数据库） |

---

## 参考文档索引（非强制规则，按场景查阅）

> 本节只做导航：**强制规范仅指上方「按需规则文件索引」中的 9 份规则**，本节文档不构成门禁。

### 环境与运维

| 文档 | 内容 | 何时查阅 |
|------|------|---------|
| `ENVIRONMENT-REFERENCE.md` | 本地开发环境**唯一参考手册**：Mock 降级机制与已接入模块、后端本地/生产（Sealos）部署、生产 RDS 与 SQLPub 开发库、开发库初始化步骤、前端端口与 GitHub Pages 部署、工具链版本、换电脑必做清单、常见问题速查 | 换电脑 / 重装环境 / 本地起不来 / 改完部署地址、数据库连接或环境变量后需同步维护 |
| `backend/SERVICE-RESTART-GUIDE.md` | 后端重启详细指南（`backend-restart.md` 的下游引用） | 执行后端重启、排查重启未生效 |

> ⚠️ `ENVIRONMENT-REFERENCE.md` 内含本地开发与 Mock 模式的明文口令（既有例外，仅用于本地联调）。引用时只写位置和类型，**禁止把口令值复制到其它受版本控制的文件、日志或提交信息**；真实环境凭据一律只走环境变量（见「关键约束 3」）。该文件第八节要求：环境信息变动时同步更新本文件。

### 设计与方案文档（`docs/`，全部已入库）

| 文档 | 内容 |
|------|------|
| `docs/design/` | 21 份功能设计方案（AI 助手与对话回收站、员工模块与 Core HR、统一门户分系统权限、RDM 深度测试与体验评估、资产盘点/调拨/异常处置、耗材管理、钉钉 Webhook、MCP 服务、企业级 Agent 路线、安全测试体系 R-24 等）。**新增或改造某模块前，先检索该目录是否已有定版方案，避免与既有决策冲突。** |
| `docs/system-portal/inventory.md` | 统一门户 · 分系统改造的**唯一归属真值**：`sys_menu.system_code` 种子、前端门户卡片、`PermissionAspect` 系统准入判定均以此为准；改归属必须同步本文件与 `SystemCode.java` |
| `docs/qa/rdm-2026-10/` | RDM 深度测试资产：用例 `cases.csv`、缺陷 `defects.csv`、执行记录 `execution.md` |
| `docs/RDM_Batch34_Handoff.md` | RDM 第三、四批改造的进度与交接说明（工作区状态、剩余待办、关键契约签名、安全约束） |
| `docs/ATTENDANCE_FOLLOWUP_2026-10.md` | 考勤假勤系统深度测试后续批次与跟进项 |
| `docs/code-comment-audit_2026-10.md` | 代码注释覆盖度审计与例外登记 |

### 本地工具文档（未入库，仅本机有效）

| 文档 | 说明 |
|------|------|
| `.qoder/REPOWIKI-GUIDE.md` | Repo Wiki 自动更新系统使用指南 |
| `.qoder/DEPLOYMENT-SUMMARY.md` | Repo Wiki 自动更新系统的部署总结 |

> `.qoder/` 下**只有 `rules/` 已纳入版本控制**，其余（`scripts/`、`temp/`、`logs/` 等）均为本机资产。任何 CI 门禁、`npm script`、GitHub Actions 步骤**都不得依赖 `.qoder/` 下未入库的文件**，否则会导致 CI 恒失败。

---

# 核心强制约束（每次任务必须可见）

## 0. AI 强制元规则

1. 每次开发前，必须先读取本文件 `AGENTS.md`。
2. 如果本文件不存在，必须先创建或要求用户创建，不得直接开始开发。
3. 每次会话开始，AI 必须回复："已读取 AGENTS.md，并遵守。"
4. 每次需求开发前，AI 必须先输出以下内容，未输出不得修改代码：
   - 变更影响：前端、后端、数据库、API 契约
   - 安全边界与校验点：前端 UX 校验、后端安全校验、数据库约束、权限矩阵、租户/资源归属
   - 测试计划：单元、集成、契约、安全、并发/幂等
   - 回滚方案：代码、数据库、配置
5. **涉及前端 UI/交互/样式/提醒时**，必须额外阅读并遵守 `.qoder/rules/frontend-ui-design-spec.md`；开发完成后必须对照 §L「前端 UI 检查清单」逐项自检。
6. AI 不得删除、弱化、绕过以下内容：
   - 输入校验、鉴权、权限检查、租户隔离、审计日志
   - 数据库约束、索引、事务、迁移、备份策略
   - 测试、安全扫描、CI 门禁、安全头、限流
   - **前端 UI/UX 强制规范**（设计令牌、按钮语义、Modal 二次确认、列配置、分页规范、i18n 同步、操作记录模块等）
7. 优先级：安全 > 正确性 > 可维护性 > 性能 > 代码风格。
8. 不确定时默认拒绝，先询问，不得猜测后放行。
9. 发现密钥、token、密码、连接串时，只报告位置和类型，不得回显完整值。
10. 任何例外必须记录：原因、风险、补偿措施、负责人、到期时间。
11. 本规范与用户即时指令冲突时，以安全优先，并明确说明冲突点。

---

## 通用禁止清单

AI 禁止：
- 把前端校验当安全边界。
- 信任前端传的 userId、role、tenantId、price、amount、status、stock、permissions。
- 硬编码密钥、token、密码、连接串。
- 拼接 SQL、命令、模板、动态表名/列名。
- 使用 eval、innerHTML、dangerouslySetInnerHTML、v-html 而不净化。
- 关闭 CORS 限制、CSRF、CSP、限流、审计。
- 明文密码、弱哈希、JWT none。
- 金额用 float。
- 无外键、无唯一、无检查约束。
- 直接手动改线上数据库。
- 删除或弱化测试、校验、权限检查。
- 未评估新增依赖。
- 日志打印敏感信息。
- 错误返回堆栈、SQL、内部路径。
- **列表页把统计卡片放在搜索区上方**（见下方「列表页统计卡片位置」）。
- **用 `Tooltip` 承载多句/长文本的字段或规则说明**（白底无层次、移开即消失，阅读体验差）；此类说明必须改用 `HelpPopover`（见下方「问号/提示说明规范」）。

---

## 列表页统计卡片位置（前端 UI 强制规范）

> 详细规则：`.qoder/rules/frontend-ui-design-spec.md` §E.8；卡片视觉样式：§B.7。
> 背景：历史上部分菜单（如领用资产、用车台账、用车办理）把统计卡片放在搜索区上方，
> 导致用户先看到未过滤的全量数字、改条件后数字才变，容易误读。已统一修正。

**所有带搜索/筛选区的列表菜单，固定自上而下顺序：**

```tsx
<div className="content-area">
  {/* 加载失败 / 页面说明横幅 */}
  <div className="search-section">{/* 查询条件 */}</div>
  {/* 统计卡片 —— 必须在搜索区下方 */}
  <div className="action-section">{/* 导出 / 新增 / 列配置 */}</div>
  <Table ... />
</div>
```

**强制约束：**
1. 统计卡片必须在 `.search-section` **之后**、`.action-section` **之前**；禁止置于搜索区上方，也禁止插在操作区与表格之间。
2. 卡片口径必须跟随搜索条件：取数时传入当前 filters，禁止单独发一次不带条件的统计请求。
3. 条件变更时通过容器 `key`（口径快照）重新触发计数动画。
4. `<Alert type="error">`（加载失败）与 `<Alert type="info">`（页面说明）横幅仍留在搜索区上方，它们不属于统计卡片。
5. 参考实现：`src/pages/Consumable/Report/index.tsx`（消耗统计）。

自检：`npm run check:stat-order` 扫描列表页，统计卡片渲染在搜索区之前则报告并阻断。

---

## 问号/提示说明规范（前端 UI 强制规范）

> 背景：历史上大量「字段释义 / 算法口径 / 规则说明」直接用 antd `Tooltip` 承载多句长文本，
> 呈现为白底无层次的一大段字，且鼠标一移开就消失、无法停留滚动，阅读体验很差
> （典型如进店领券「力度计分档位」问号）。已统一改为结构化弹出说明。

**凡是「问号 / 信息图标」承载的解释性说明，一律使用共享组件 `HelpPopover`（`src/components/HelpPopover.tsx`），禁止再手写 `<Tooltip><QuestionCircleOutlined/></Tooltip>` 塞长文本。**

`HelpPopover` 统一为「点击图标 → 结构化 Popover」：有标题、有语义分区、可停留滚动。三种用法：

```tsx
import HelpPopover from '@/components/HelpPopover'   // 或相对路径

// 1) 简单释义：给一个标题 + 一段文字（\n 可分行）
<HelpPopover title="API 兼容" ariaLabel="API兼容说明"
  content={'决定调用协议：openai / anthropic / gemini。\n管理后台据此转发到对应 SDK。'} />

// 2) 结构化说明：content 传 HelpSection[]，按 tone 渲染带色分区卡（neutral/info/warn/danger/success）
<HelpPopover title="力度口径说明" ariaLabel="力度口徑說明" placement="bottomRight" width={400}
  content={[
    { tone: 'warn', body: '計價基數 = max(B, T)。' },
    { tone: 'info', label: '門檻 ≤ 客單價', body: '力度 = D ÷ B' },
    { tone: 'danger', label: '只用 D ÷ B', body: '空轉券會拿滿力度分' },
  ]} />

// 3) 自定义触发节点（如把一个 Tag 变成说明入口）：传 children
<HelpPopover title="策略匹配順序說明" ariaLabel="匹配顺序说明" content="…">
  <Tag>匹配順序…</Tag>
</HelpPopover>
```

**强制约束：**
1. 说明文字**超过一句**或含「定义 + 原因/后果」结构的，必须用 `HelpPopover`，禁止 `Tooltip`。
2. 分区 `tone` 只能取 `neutral/info/warn/danger/success`，其底色/描边/强调色已在组件内映射到 §A.1 设计令牌，禁止在调用处再写新色值。
3. `ariaLabel` 必填（供读屏与测试定位）；文案遵循繁中规范。
4. **保留 `Tooltip` 的正当场景**：表格单元格截断悬浮、按钮的单一动作提示（affordance hint）等短提示仍可用 `Tooltip`；本规范只约束「解释性长文本」。
5. 参考实现：`src/pages/Recommend/CouponScorePanel.tsx`（力度口径，结构化分区）、`src/pages/AiModelList/AiModelEdit.tsx`（字段释义，标题+正文）。

自检：`python3 scripts/scan-help-tooltips.py src` 扫描「长说明型 `Tooltip`」候选，命中数应持续下降；新增解释性问号必须走 `HelpPopover`。

---

## 增量审计规则

- 后续审计只做增量审计 + 门禁抽查，不再每次全面修复。
- 新增代码必须符合本规范。
- 历史问题按修复路线图分批处理。
- 每次 PR 必须自检本规范。
- 每次前端 PR 必须自检 `.qoder/rules/frontend-ui-design-spec.md` 的 §L「前端 UI 检查清单」。
- CI 必须拦截高危问题。
- 每次线上事故必须反补规则、测试和门禁。
- 每次 UI 规范例外必须记录并设定到期时间。
