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
```

## 关键约束

1. **安装必须使用 `--legacy-peer-deps`**：项目存在 peer dependency 冲突，不加此参数安装会失败。
2. **类型检查**：`tsconfig.json` 启用 `strict: true`，CI 使用 `build:strict`（`tsc && vite build`）执行类型检查。
3. **环境变量**：前端 Mock 凭据通过 `.env.local`（已 gitignore）注入，参考 `.env.example`；
   后端运行时凭据（`DB_URL`/`DB_USERNAME`/`DB_PASSWORD`/`JWT_SECRET`）统一放 `backend/.env.local`（已 gitignore），
   参考 `backend/.env.local.example`。**任何受版本控制的文件禁止写入明文凭据**，由 `npm run secret-scan` 拦截。
4. **路径别名**：`@/` 映射到 `src/`，在 `tsconfig.json` 和 `vite.config.ts` 中同步配置。

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
- **质量门禁**：lint + typecheck + menu-consistency + stat-card-order + test + secret-scan（任一失败中止部署）
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
| `security-architecture-quality.md` | 前后端开发 | 安全元规则、总原则、开发工作流、前后端规范、数据库设计、API 契约、测试门禁、完成定义、禁止清单、检查清单 |
| `business-data-dictionary.md` | 涉及业务枚举值 | 系统级枚举常量（品牌、业务类型、状态等） |
| `efficient-dev-mode.md` | 涉及界面调整 | 高效开发模式（两阶段交付：先 UI 后 i18n/后端/数据库） |

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

## 增量审计规则

- 后续审计只做增量审计 + 门禁抽查，不再每次全面修复。
- 新增代码必须符合本规范。
- 历史问题按修复路线图分批处理。
- 每次 PR 必须自检本规范。
- 每次前端 PR 必须自检 `.qoder/rules/frontend-ui-design-spec.md` 的 §L「前端 UI 检查清单」。
- CI 必须拦截高危问题。
- 每次线上事故必须反补规则、测试和门禁。
- 每次 UI 规范例外必须记录并设定到期时间。
