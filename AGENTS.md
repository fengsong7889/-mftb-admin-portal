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

# 安全扫描（检测硬编码凭据）
npm run secret-scan
```

## 关键约束

1. **安装必须使用 `--legacy-peer-deps`**：项目存在 peer dependency 冲突，不加此参数安装会失败。
2. **类型检查**：`tsconfig.json` 启用 `strict: true`，CI 使用 `build:strict`（`tsc && vite build`）执行类型检查。
3. **环境变量**：Mock 认证凭据通过 `.env.local`（已 gitignore）注入，参考 `.env.example`。
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
- **质量门禁**：lint + typecheck + test + secret-scan（任一失败中止部署）
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

## 编辑后验证

每次代码编辑完成后，必须执行对应的验证命令：

```bash
# 前端代码变更
npm run typecheck        # 类型检查
npm run lint             # Lint 检查

# 后端代码变更
cd backend && mvn compile -q   # 编译检查
cd backend && mvn test -B      # 单元测试
```

验证失败时必须尝试修复，不可忽略。CI 门禁会在推送后再次拦截，但本地验证是第一道防线。

## MCP 工具使用指引

项目配置了以下 MCP 服务器，按需使用：

| MCP | 用途 | 使用场景 |
|-----|------|----------|
| **github** | GitHub API 操作 | 查看 PR、Issue、提交历史、代码搜索 |
| **Framelink MCP for Figma** | Figma 设计稿解析 | 用户贴出 Figma 链接时，提取设计数据 |
| **context7** | 库文档查询 | 查询第三方库最新 API 和用法 |

约束：不要在没有明确需求时主动调用 MCP；Figma 仅在设计相关任务中使用。

# 前端 UI/UX 设计规范（强制）

版本：1.0
状态：强制
适用范围：所有新建/修改的前端页面、组件、交互、提醒、样式。
基准来源：`.qoder/rules/form-page-style.md`、`src/styles/components.css`、`src/styles/global.css`、`src/hooks/useColumnConfig.tsx`、`src/api/request.ts`。

> **AI 元规则**：每次涉及新界面 / 新交互 / 新提醒 / 新样式，必须先阅读本章；开发完成后必须逐条自检 §L「前端 UI 检查清单」，未通过不得提交。

---

## A. 设计令牌（Design Tokens）

### A.1 色彩系统

| 类别 | 色值 | 用途 |
|------|------|------|
| **主品牌色** | `#E8720C` | 主按钮、选中态、菜单高亮、Logo、链接、Tab 激活 |
| **主色 hover** | `#F59432` | 悬停态 |
| **成功 / 导出** | `#52C41A` | `.btn-export` 绿色描边 |
| **信息 / 导入** | `#1890FF` | `.btn-import` 蓝色描边、基础信息图标 |
| **警告 / 参数** | `#FA8C16` | 参数/策略/配置类模块图标 |
| **高级 / 特殊** | `#722ED1` | 高级/特殊类模块图标 |
| **危险 / 删除** | `#FF4D4F` | antd `danger`、删除/驳回 |
| **中性边框** | `#D9D9D9` / `#f0f0f0` / `#e8eaed` | 描边、分隔线、卡片边框 |
| **文本主色** | `#262626` | 卡片标题 |
| **文本次色** | `#595959` | 表单标签、副标题 |
| **文本弱色** | `#8C8C8C` | 说明文字、灰字提示 |
| **深色侧边栏** | `#001529` / `#1E1E1E` | 侧边栏背景 |
| **暖橙面板** | `#FFF7F0` + 边框 `#FFE7D1` | Modal 二次确认信息面板 |

**禁止**：随意引入上述之外的新色值；如需扩展必须在本表登记并说明语义。

### A.2 圆角、阴影、间距

| 元素 | 圆角 | 阴影 | Padding | Margin-bottom |
|------|------|------|---------|---------------|
| 页面头部卡片（表单页） | `12px` | `0 2px 12px rgba(0,0,0,0.06)` | `16px 24px` | `16px` |
| 详情页头部 `.detail-header` | `8px` | `0 2px 8px rgba(0,0,0,0.06)` | `20px 24px` | `16px` |
| 模块卡片 `.detail-card` / 表单 div 卡片 | `8px` | `0 2px 8px rgba(0,0,0,0.04~0.06)` | `20px 24px` | `16px` |
| 通用按钮 | `6px` | 见 §B.1 | `0 16px` | — |
| 弹窗底部按钮 | `8px` | — | `0 24px` | — |
| 页面底部按钮 `.form-footer` | `8px` | — | `0 28px` | — |
| Modal 二次确认 | `16px` | antd 默认 | `28px 32px 24px` | — |
| 图标色块（模块标题） | `6px` | — | 28×28 | — |

### A.3 字体

- 字体栈：`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- 全局启用抗锯齿：`-webkit-font-smoothing: antialiased`
- 字号规范：
  - 页面头部标题（表单页）：`18px / 700`
  - 详情页头部标题：`17px / 600`
  - 模块卡片标题：`15px / 600`
  - 表单标签 / 副标题：`13~14px / 400~500`
  - 说明文字 / 灰字：`12px / 400`

---

## B. 交互样式规范

### B.1 按钮系统（严格按语义分类）

| 场景 | 类型 | 样式 | Class |
|------|------|------|-------|
| **搜索区-查询** | 主色实心 | 背景 `#E8720C`，阴影 `0 2px 4px rgba(232,114,12,0.25)` | `.search-section .ant-btn-primary` |
| **搜索区-重置** | 描边灰色 | 边框 `#D9D9D9`，hover 变品牌橙 | `.search-section .ant-btn-default` |
| **操作区-新增** | 主色实心 + 加号图标 | 同查询按钮 | `.action-section .ant-btn-primary` |
| **操作区-导出** | 绿色描边 | 边框/文字 `#52C41A`，hover `#73D13D` | `.btn-export` |
| **操作区-导入** | 蓝色描边 | 边框/文字 `#1890FF`，hover `#40A9FF` | `.btn-import` |
| **操作区-删除/批量删除** | antd danger | 红 `#FF4D4F` | `.ant-btn-dangerous` |
| **操作区-中性描边** | 灰描边 | 边框 `#D9D9D9`，hover 品牌橙 | `.action-section .ant-btn-default` |
| **表格内-详情/编辑** | 链接橙色 | `#E8720C`，hover `scale(1.05)` + 浅橙背景 | `.ant-table .ant-btn-link` |
| **表格内-删除/撤销** | 链接红色 | `#FF4D4F`，hover 浅红背景 | `.ant-table .ant-btn-link.ant-btn-dangerous` |
| **表格操作列分隔符** | 竖线 | `#d9d9d9`，`margin: 0 4px` | `.action-split` |
| **弹窗底部-确认** | 主色实心 | 同新增，`min-width: 88px`，`height: 36px` | `.ant-modal-footer .ant-btn-primary` |
| **弹窗底部-取消** | 描边灰色 | hover 变品牌橙 | `.ant-modal-footer .ant-btn-default` |
| **页面底部-保存/提交** | 主色实心 | `height: 38px`，`min-width: 96px` | `.form-footer .ant-btn-primary` |
| **页面底部-取消/返回** | 描边灰色 | hover 变品牌橙 | `.form-footer .ant-btn-default` |
| **页面底部-驳回/危险** | antd danger | `min-width: 96px` | `.form-footer .ant-btn-dangerous` |

**尺寸约束**：搜索区/操作区按钮 `height: 32px`，字号 `13px`，圆角 `6px`，`font-weight: 500`。

### B.2 全局 hover 微动效

- 所有非 link/text 按钮：`transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1)`，hover `translateY(-1px)`，active `translateY(0)`
- 页面底部按钮 hover：`translateY(-2px)` + `box-shadow: 0 4px 12px rgba(0,0,0,0.12)`
- 表格链接按钮 hover：`scale(1.05)` + 浅色背景
- **禁用态无动效**：`.ant-btn[disabled]:hover { transform: none !important; box-shadow: none !important; }`
- 按钮图标与文字间距：`.ant-btn .anticon + span { margin-left: 6px; }`

### B.3 Modal 二次确认（`custom-confirm-modal`）

**所有"提交申请"类按钮**（采购申请、AI 使用申请、赠送、充值、转账、合并、扣款等）**必须**使用统一的 `Modal.confirm` 二次确认：

```tsx
Modal.confirm({
  title: '确认提交申请？',
  className: 'custom-confirm-modal',
  icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
  content: (
    <div className="confirm-info-card">
      <div className="confirm-info-row"><span>申请人：</span><b>{name}</b></div>
      <div className="confirm-info-row"><span>部门：</span><b>{dept}</b></div>
      <div className="confirm-info-row"><span>明细数量：</span><b>{count}</b></div>
      <div className="confirm-info-row"><span>原因：</span><b>{reason}</b></div>
    </div>
  ),
  okText: '确认提交',
  cancelText: '取消',
  onOk: async () => { /* 调 API */ },
})
```

**执行顺序**：表单校验 → 弹出确认框 → 用户确认 → 调 API。**禁止**先弹框后校验。
**类型安全**：使用具体接口类型（如 `FormValues`），**禁止** `as Record<string, unknown>` 不安全转型。

### B.4 动画与 keyframes（集中在 `global.css`）

全局已注册的 keyframes（禁止在组件内重复定义）：

| 名称 | 用途 |
|------|------|
| `headerGradientShift` | 页面头部橙色渐变条动画（4s ease infinite） |
| `headerFadeSlideIn` | 头部内容淡入滑入 |
| `pageFadeIn` | `.app-content > *` 页面级淡入 |
| `marquee` / `slotTextMarquee` | 热搜词/坑位算法名跑马灯 |
| `statusPulse` | 状态标签微脉冲 |
| `progressShimmer` | 进度条前进闪光 |
| `nodeBreath` | 审批当前节点呼吸缩放 |
| `rippleExpand` | 波纹扩散 |
| `dotPulse` / `refundWarnPulse` / `tierShimmer` / `spinDash` / `nextNodeReact` / `lineGlow` / `dishBackIn` | 各业务专用动画 |

### B.5 滚动条

- 全局：宽 6px，透明轨道，滑块 `#D9D9D9` 圆角 3px，hover `#BFBFBF`
- 侧边栏：宽 4px，滑块半透明白

### B.6 组件选择强约束

| 场景 | 强制组件 | 禁止 |
|------|---------|------|
| 部门选择（所在部门/申请部门/组织树） | `TreeSelect`（配 `fetchDepartments()` + `buildDeptTree()`） | Input / 普通 Select |
| 列显隐/顺序配置 | `useColumnConfig(pageKey, columnMeta, defaultConfig)` | 自行实现 |
| 提交申请类按钮 | `Modal.confirm` + `custom-confirm-modal` | 直接调 API / `window.confirm` |
| 模块分组卡片 | 白色 `div` + 内联样式 | antd `Card title=... headStyle=...` 彩色标题头 |
| 富文本渲染 | 必须净化（DOMPurify 等） | `dangerouslySetInnerHTML` 直传 |

---

## C. 新增/编辑界面规范

**基准页面**：`src/pages/Recommend/WaterfallAdd/index.tsx`（销售定价 → 无敌星星 → 新增定价）
**完整规则**：`.qoder/rules/form-page-style.md`
**已对齐页面**（可参考）：`AlgorithmAdd.tsx`、`OrganicTrafficScoreConfig.tsx`、`GiftAdd.tsx`

### C.1 页面结构（自上而下，禁止颠倒）

```
<div className="content-area">
  1. 页面头部（白色圆角卡片 + 橙色渐变动画条 + 橙色返回按钮 + 标题）
  2. <Form layout="vertical"> 包裹的若干模块卡片（div 卡片，禁止 antd Card）
  3. 底部操作按钮 <div className="form-footer">（取消 + 保存/提交）
</div>
```

### C.2 页面头部模板

```tsx
<div style={{ position: 'relative', background: '#fff', marginBottom: 16,
  borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
  <div style={{ height: 3,
    background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
    backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
  <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
        style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
          height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>返回</Button>
      <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
        {isDetailMode ? 'XX詳情' : isEditMode ? '編輯XX' : '新增XX'}
      </h2>
    </div>
  </div>
</div>
```

**禁止**：头部右侧放保存/提交按钮（操作按钮统一放页面底部）。

### C.3 模块卡片（核心规则）

```tsx
<div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
  {/* 标题行 */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
    <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />
    </div>
    <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>模块标题</span>
    <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>可选标签</Tag>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    <span style={{ fontSize: 12, color: '#8c8c8c' }}>可选右侧说明</span>
  </div>
  {/* 内容区 */}
</div>
```

**图标色块配色约定**：

| 语义 | 底色 | 图标色 | Tag color |
|------|------|--------|-----------|
| 基础信息/选择类 | `#e6f7ff` | `#1890ff` | blue |
| 参数/策略/配置类 | `#fff7e6` | `#fa8c16` | orange |
| 图片/成功类 | `#f6ffed` | `#52c41a` | green |
| 高级/特殊类 | `#f9f0ff` | `#722ed1` | purple |

### C.4 表单字段布局

- 外层统一 `<Form layout="vertical" disabled={isDetailMode}>`
- 常规字段用 grid：`display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16`（字段少可 2 列）
- **禁止**在 vertical 布局下给 Form.Item 用 `labelCol={{ flex: 'XXXpx' }}`（会撑出大片空白）
- 行内短配置项（参数类）：标签固定 `minWidth: 96, textAlign: 'right', flexShrink: 0`，字号 `13px / #595959`

### C.5 底部操作按钮

```tsx
{!isDetailMode && (
  <div className="form-footer">
    <Button onClick={handleBack}>取消</Button>
    <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>
      保存
    </Button>
  </div>
)}
```

- 主按钮文案：`保存`（SaveOutlined）或 `提交申請`（SendOutlined）
- 详情只读模式必须隐藏底部按钮
- **禁止**写内联样式覆盖 `.form-footer` 全局类

---

## D. 详情界面规范

### D.1 详情页头部 `.detail-header`

- 白底 / 圆角 8px / padding `20px 24px` / 阴影 `0 2px 8px rgba(0,0,0,0.06)`
- 标题行 flex space-between，标题 `17px / 600 / #262626`
- **详情页为只读模式，顶部不放操作按钮**（需要时放 Descriptions 内或独立区块）
- 副标题 `.detail-header-subtitle`：`13px / #595959`，顶部 `1px dashed rgba(0,0,0,0.08)`

### D.2 详情内容卡片 `.detail-card`

白底 / 圆角 8px / padding `20px 24px` / margin-bottom 16 / 阴影 `0 2px 8px rgba(0,0,0,0.06)`。

### D.3 操作记录模块（跨模块强制统一）

**所有详情页底部必须**添加「操作记录」模块：

- **仅展示**：最后更新人 + 最后更新时间（**禁止**完整操作日志表格）
- 白色卡片样式：`border: 1px solid #e8eaed, borderRadius: 8`
- 图标：`EditOutlined`
- 字段用 grid 布局
- 必须用**专用 state 变量**存 `updatedBy / updatedAt`，禁止直接内嵌表单

已应用页面：`AssetDetail`、`AlgorithmAdd`、`WaterfallAdd`、`PricingAdd`、采购申请详情等。

### D.4 OA 工作流审批节点懒加载

- **draft 状态**：右侧审批节点模块只展示「流程创建」
- **pending 状态**：只展示下一个待审批节点；当前节点审完才请求下一节点审批人
- 时间轴渲染：只显示「流程创建」+ 已完成节点 + 当前待审节点，**不显示未来节点**

### D.5 采购申请详情页专项

- 待提交（draft）状态必须支持删除操作
- 流程状态必须显示中文（`draft` → `待提交`）
- 采购明细表格必须完整显示：资产分类、品牌、参数信息、资产名称、数量、备注
- 申请部门字段必须在审批详情页中正确显示

---

## E. 列表界面规范

### E.1 搜索区 `.search-section`

- **4 列 grid 布局**：`grid-template-columns: repeat(4, 1fr); gap: 16px 12px`
- 所有输入控件强制 `width: 100%`（Input / Select / DatePicker / TreeSelect）
- 操作按钮紧跟最后一个查询条件，`padding-top: 26px` 与输入框对齐
- `.search-actions` 内按钮 gap 8px

### E.2 操作区 `.action-section`

- 默认右对齐 `justify-content: flex-end`
- `.action-section-left`（`margin-right: auto`）：导出 / 批量导入 / 批量删除 / 效果预览
- `.action-section-right`：**仅允许**「新增」和「设置/列配置」按钮
- 两组之间用 `<div className="action-section-left">...</div>` + `<div className="action-section-right">...</div>` 分隔

### E.3 列配置（`useColumnConfig`）

**所有列表页必须**使用 `useColumnConfig(pageKey, columnMeta, defaultConfig)`：

```tsx
const { configComponent, applyConfig } = useColumnConfig('page-key', columnMeta, [
  { key: 'flowNo', visible: true, locked: 'head' as const },
  { key: 'action', visible: true, locked: 'tail' as const },
])
```

- `pageKey`：页面唯一标识（kebab-case），用于 localStorage 存储 key = `table-config-${pageKey}`
- 字段锁定：`locked: 'head'` 固定在最前，`'tail'` 固定在最后
- 自动同步列变更：新增列插入到第一个 `locked:'tail'` 之前，删除列自动清理
- 标题跟随最新 i18n（语言切换时不丢顺序）
- `configComponent` 渲染在操作区右侧

### E.4 分页规范（强制）

```tsx
pagination={{
  current: pagination.page,
  pageSize: pagination.size,
  total,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total) => t('common.total', { count: total }),
  onChange: (page, size) => setPagination({ page: size !== pageSize ? 1 : page, size: size || 10 }),
}}
```

⚠️ **强制约束**：
- i18n 插值变量必须用 `count`（模板 `{{count}}`），传 `{ total }` 会渲染出字面变量名
- `pageSize` 变化时必须重置到第 1 页
- `showSizeChanger` 和 `showQuickJumper` 必须都为 `true`

### E.5 表格样式

- 表头禁止换行：`white-space: nowrap`（已在 `global.css` 全局应用）
- 需要禁用单元格换行：加 `.nowrap-table` 类
- 横向滚动：`scroll={{ x: 'max-content' }}` 或明确宽度 `scroll={{ x: 1400 }}`
- 纵向滚动：`scroll={{ y: 360 }}`（用于弹窗内表格）
- 审批表头分组着色：业务主管蓝 `#E3F2FD/#1565C0`、运营主管橙 `#FFF3E0/#E65100`、财务主管红 `#FFEBEE/#C62828`

---

## F. 反馈与提醒规范

### F.1 message 全局提示（antd）

| 类型 | 场景 | 示例 |
|------|------|------|
| `message.success` | 操作成功 | `message.success('草稿保存成功')` |
| `message.error` | 操作失败 / API 错误 | `message.error(err.message \|\| '提交失败')` |
| `message.warning` | 前置校验未通过 | `message.warning('請至少選擇一個部門')` |
| `message.info` | 中性提示 | `message.info('已恢復上次保存的草稿')` |

**强制**：
- 文案必须走 i18n（`t('xxx.yyy')`），例外见 §H.3
- 错误信息优先展示后端 `err.message`，兜底展示前端默认文案
- **禁止** `alert()` / `window.confirm()`

### F.2 空数据态 `.ant-empty`

- 全局已美化：`padding: 40px 0`，描述文字 `#999 / 14px`
- 组件内使用：`<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('xxx.empty')} />`
- **禁止**用「暂无数据」硬编码文案

### F.3 加载态 `Spin`

- 全屏加载：`<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}><Spin size="large" tip={t('common.loading')} /></div>`
- 包裹内容：`<Spin spinning={loading}>...</Spin>`
- 下拉框内联加载：`notFoundContent={loading ? <Spin size="small" /> : '暂无数据'}`
- 全局已设 `.app-content .ant-spin-nested-loading { min-height: 200px; }`

### F.4 表单校验错误

- 校验错误优先展示在 `Form.Item` 下方（antd 默认行为）
- 提交前必须先 `await form.validateFields()`，失败后 `message.warning` 提示首个错误字段
- 校验规则集中在 Form.Item 的 `rules`，禁止散落正则

### F.5 页面级错误边界

- 路由级错误用 `Result` 组件（`status="error"` / `"403"` / `"404"` / `"500"`）
- 局部错误用 `Empty` + 重试按钮

---

## G. API 与错误处理规范

### G.1 统一 request 层

- 所有请求必须走 `src/api/request.ts` 封装的 axios 实例
- **禁止**在组件内散落 `fetch` / `axios`
- API 按业务域集中在 `src/api/<domain>.ts`

### G.2 响应拦截统一处理

`src/api/request.ts` 已实现（**禁止**在业务层重复处理）：

| HTTP/业务码 | 行为 |
|-------------|------|
| `200` + `code === 200` | 返回 `data` |
| `401` / `code === 401` | 清 localStorage + `message.error('登录校验已过期，请重新登录')` + 派发 `AUTH_UNAUTHORIZED_EVENT`（并发只处理一次） |
| `403` / `code === 403` | `message.error(后端 message \|\| '您没有权限执行此操作，请联系管理员授权')` |
| `code === 1004` | 空闲超时，同 401 处理 |
| `>= 500` | `message.error('服务器异常, 请稍后重试')` |
| 其他 | `message.error(error.message \|\| '网络异常')` |

### G.3 静默请求

- 不需要弹错误提示的请求（如首页轮询、后台同步）传 `{ silent: true }`
- 静默请求仍需 `catch` 兜底，避免 unhandled rejection

### G.4 业务层错误处理

```tsx
try {
  await submitXxx(payload)
  message.success(t('xxx.submitSuccess'))
  navigate('/xxx')
} catch (err) {
  // request.ts 已弹 message.error，此处只做日志/状态恢复
  console.error(err)
  setLoading(false)
}
```

**禁止**：在 catch 里再次 `message.error` 造成双弹。

---

## H. 国际化（i18n）规范

### H.1 locale 文件路径

- 繁体中文：`src/i18n/locales/zh-TW.json`（默认语言）
- 英文：`src/i18n/locales/en.json`
- antd locale：`zh_TW`

### H.2 新增 key 强制规则

- 新增 i18n key **必须同时**在两个文件中添加，键值对完全一致
- key 命名：`<domain>.<camelCase>`（如 `asset.btnReceive`、`common.total`、`employeeDetail.posEmpty`）
- 插值变量统一用 `{{count}}` / `{{name}}` 等语义化名称

### H.3 例外：硬编码文案

- 仅当修改共享 key 会波及多个页面且无独立命名空间时，允许临时硬编码
- 必须在代码注释中标注「待 i18n 解耦后重构」
- 案例：`InboundList.tsx` 的「选择订单验收」按钮

---

## I. 代码注释规范

- **统一使用简体中文**（JSDoc / Javadoc / 行内注释）
- 不得使用繁体中文或英文（业务文案除外）
- 关键决策必须注释说明「为什么」而非「是什么」

---

## J. 菜单图标与命名规范

### J.1 图标语义

| 图标 | 语义 | 适用菜单 |
|------|------|---------|
| `ControlOutlined` | 控制面板 | **基础配置类**（基礎配置、资产分类库、品牌产品库） |
| `SettingOutlined` | 齿轮 | **系统配置类**（系統配置） |
| `EditOutlined` | 编辑 | 操作记录模块 |
| `SaveOutlined` | 保存 | 保存按钮 |
| `SendOutlined` | 发送 | 提交申请按钮 |
| `ArrowLeftOutlined` | 返回 | 页面头部返回按钮 |
| `ShopOutlined` / `DatabaseOutlined` / `FolderOutlined` 等 | 业务语义 | 模块卡片图标 |

### J.2 一级菜单颜色编码（`components.css` `:nth-child`）

首页橙、系统灰、用户蓝、运营紫、投放青绿、商户橙、到家绿、到店红、推广电光蓝。

### J.3 菜单/字段命名

- 菜单显示名必须准确反映**整体核心功能**，而非某一子模块（例：「产品库」>「资产型号」）
- 资产台账「租金费用」统一简化为「租金」
- AI 权控菜单统一命名为「AI 操作授权」

---

## K. 样式架构约束

### K.1 文件组织

| 文件 | 职责 |
|------|------|
| `src/styles/global.css` | 全局入口，`@import components.css`，reset、滚动条、字体、全局 keyframes |
| `src/styles/components.css` | 全项目共享样式中心（~2400 行）：侧边栏、Header、详情页头部、搜索区、操作区、按钮语义、弹窗底部、表单页脚 |
| `src/App.css` | 应用布局容器、页面淡入、空态/加载态美化 |
| `src/components/*.css` | 复杂组件自有样式（MenuTabs、PetMascot、TableColumnConfig、PRDEditor） |
| `src/pages/**/*.css` | 页面级样式（Home、OACenter、NotificationConfig、ParamLibrary 等） |

### K.2 技术约束

- **无** SCSS / Less / PostCSS / Tailwind / CSS-in-JS / styled-components
- **无** CSS Variables / Design Token 文件（色值硬编码在 CSS 中）
- 纯原生 CSS + **BEM 风格类名**（`block__element--modifier`）
- 覆盖 antd 默认样式用**直接选择器**（如 `.sidebar-menu .ant-menu-item`），**非** ConfigProvider theme token
- 主题 token 通过 `ConfigProvider` 在 `main.tsx` 注入（仅主色、Menu/Button/Table 组件级覆盖）
- **无响应式断点**（不用 `@media`），靠 Flex / Grid 自适应

### K.3 组件级样式隔离

复杂组件必须独立 CSS 文件，禁止污染全局：`MenuTabs.css`、`PetMascot.css`、`TableColumnConfig.css`、`PRDEditor.css`。

---

## L. 前端 UI 检查清单（每次开发前后必对）

### L.1 开发前（设计阶段）

- [ ] 是否已读取 AGENTS.md 本章 + `.qoder/rules/form-page-style.md`？
- [ ] 页面类型确认：新增/编辑 / 详情 / 列表 / 弹窗 / 仪表盘？
- [ ] 色彩是否只用 §A.1 登记的令牌？
- [ ] 按钮语义是否匹配 §B.1 表格？
- [ ] 是否需要 Modal 二次确认（提交申请类）？
- [ ] 是否需要列配置（列表页）？
- [ ] 部门选择是否用 TreeSelect？
- [ ] i18n key 是否已在 zh-TW.json + en.json 同步登记？

### L.2 开发中（编码阶段）

**新增/编辑页**：
- [ ] 页面头部：白色圆角卡片 + 橙色渐变动画条 + 橙色返回按钮 + 标题（模式切换）？
- [ ] 头部**没有**放保存/提交按钮？
- [ ] 模块分组用白色 div 卡片（**不是** antd Card 彩色标题头）？
- [ ] 模块标题行：28×28 彩色色块图标 + 15px/600 标题 + 右侧延伸分隔线？
- [ ] 图标色块配色符合 §C.3 语义约定？
- [ ] Form `layout="vertical"`，字段用 grid 3 列？
- [ ] **没有**给 Form.Item 用 `labelCol={{ flex: 'XXXpx' }}`？
- [ ] 行内短配置项标签 `minWidth: 96, textAlign: 'right'`？
- [ ] 底部 `.form-footer` 全局类（**没有**内联样式覆盖）？
- [ ] 详情模式隐藏底部按钮？

**详情页**：
- [ ] 头部用 `.detail-header` 类？
- [ ] 顶部**没有**操作按钮？
- [ ] 内容卡片用 `.detail-card` 类？
- [ ] 底部有「操作记录」模块（仅最后更新人+最后更新时间，EditOutlined 图标）？
- [ ] 用专用 state 存 `updatedBy / updatedAt`？
- [ ] OA 工作流详情页遵循审批节点懒加载规则？

**列表页**：
- [ ] 搜索区 `.search-section` 4 列 grid？
- [ ] 所有输入控件 `width: 100%`？
- [ ] 操作区 `.action-section` 左右分组正确（导出/批量在左，新增/列配置在右）？
- [ ] 使用 `useColumnConfig(pageKey, columnMeta, defaultConfig)`？
- [ ] `locked: 'head'/'tail'` 字段正确（如 flowNo 锁头、action 锁尾）？
- [ ] 分页 `showSizeChanger + showQuickJumper + showTotal` 三件套齐全？
- [ ] `showTotal` 插值变量用 `count`（**不是** `total`）？
- [ ] pageSize 变化时重置到第 1 页？
- [ ] 表格 `scroll={{ x: ... }}` 配置正确？

**按钮**：
- [ ] 查询/新增 = 主色实心？
- [ ] 重置/取消 = 描边灰？
- [ ] 导出 = `.btn-export` 绿色描边？
- [ ] 导入 = `.btn-import` 蓝色描边？
- [ ] 删除/驳回 = antd `danger`？
- [ ] 表格内链接按钮用 `.ant-btn-link`？
- [ ] 表格操作列分隔符用 `.action-split`？

**Modal 二次确认**：
- [ ] `className: 'custom-confirm-modal'`？
- [ ] 图标用 `.confirm-icon-wrapper` + `.confirm-icon-text`？
- [ ] 信息面板用 `.confirm-info-card`？
- [ ] 执行顺序：表单校验 → 弹框 → API（**不是**先弹框后校验）？
- [ ] 类型安全（**没有** `as Record<string, unknown>`）？

**反馈与提醒**：
- [ ] 成功用 `message.success`，失败用 `message.error`，校验警告用 `message.warning`？
- [ ] 文案走 i18n（除 §H.3 例外）？
- [ ] **没有**用 `alert()` / `window.confirm()`？
- [ ] 空数据用 `<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />`？
- [ ] 加载用 `<Spin>`，全屏加载 `minHeight: 400`？
- [ ] **没有**在 catch 里重复 `message.error`（避免双弹）？

**API 层**：
- [ ] 走 `src/api/request.ts` 统一实例？
- [ ] API 按业务域放在 `src/api/<domain>.ts`？
- [ ] **没有**在组件内散落 `fetch` / `axios`？
- [ ] 静默请求传 `{ silent: true }`？

**国际化**：
- [ ] zh-TW.json + en.json 同步新增 key？
- [ ] key 命名 `<domain>.<camelCase>`？
- [ ] 插值变量语义化（`count` / `name` / `date`）？

**注释**：
- [ ] 所有注释用简体中文？
- [ ] 关键决策注释「为什么」？

**样式**：
- [ ] **没有**引入新的 CSS 框架 / 预处理器？
- [ ] **没有**用 CSS Variables / Design Token？
- [ ] 类名 BEM 风格？
- [ ] 复杂组件独立 CSS 文件？
- [ ] **没有**用 `@media` 断点？

### L.3 开发后（自检阶段）

- [ ] `npm run typecheck` 通过？
- [ ] `npm run lint` 通过（无新增 error）？
- [ ] `npm run test:run` 通过（如涉测试文件）？
- [ ] 浏览器实际验证：新增/编辑/详情三模式布局一致？
- [ ] 浏览器实际验证：列表页搜索、列配置、分页、导出全链路？
- [ ] 浏览器实际验证：Modal 二次确认上下文信息完整？
- [ ] 浏览器实际验证：message 提示文案正确、无双弹？
- [ ] 浏览器实际验证：i18n 切换后所有文案正常？
- [ ] 对照 §L.2 逐项打勾？

---

## M. 例外与豁免

- 任何对本规范的例外必须记录：**原因 / 风险 / 补偿措施 / 负责人 / 到期时间**
- 历史遗留页面按修复路线图分批对齐，不要求一次性全量重构
- 新增代码必须 100% 符合本规范
- CI 门禁 + Code Review 双重拦截

---

# 前后端安全、架构与质量开发规范（AI 强制规则版）

版本：1.0
状态：强制
适用范围：前端、后端、数据库、API 契约、测试、CI/CD、部署配置、依赖管理。
适用对象：所有参与本项目的 AI 与开发者。

---

## 0. AI 强制元规则

1. 每次开发前，必须先读取本文件 `AGENTS.md`。
2. 如果本文件不存在，必须先创建或要求用户创建，不得直接开始开发。
3. 每次会话开始，AI 必须回复："已读取 AGENTS.md，并遵守。"
4. 每次需求开发前，AI 必须先输出以下内容，未输出不得修改代码：
   - 变更影响：前端、后端、数据库、API 契约
   - 安全边界与校验点：前端 UX 校验、后端安全校验、数据库约束、权限矩阵、租户/资源归属
   - 测试计划：单元、集成、契约、安全、并发/幂等
   - 回滚方案：代码、数据库、配置
5. **涉及前端 UI/交互/样式/提醒时**，必须额外阅读并遵守「前端 UI/UX 设计规范（强制）」章节（§A~§M），以及 `.qoder/rules/form-page-style.md`；开发完成后必须对照 §L「前端 UI 检查清单」逐项自检。
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

## 1. 总原则

1. 前端不可信：前端传入的一切数据，包括 userId、role、tenantId、price、amount、status、stock、permissions、时间，后端都必须重新校验。
2. 前端校验只负责 UX：减少无效请求、即时反馈；不是安全边界。
3. 后端是安全边界：所有认证、授权、业务规则、数据归属、金额、库存、状态流转必须在后端裁决。
4. 数据库是最后防线：外键、唯一、非空、检查约束、最小权限、事务必须兜底。
5. 默认拒绝：未明确允许的输入、角色、来源、字段、排序、跳转，一律拒绝。
6. 最小权限：用户、服务、数据库账号、CI 凭证都只给必需权限。
7. 纵深防御：前端、后端、数据库、网关、CI 多层防护，不依赖单点。
8. 契约优先：先定义 API/DTO/错误码/权限矩阵，再写实现。
9. 可测试、可回滚、可观测：每个变更必须有测试、回滚方案、日志/指标。
10. 不可变审计：关键操作必须记录审计日志，且不可被普通业务修改。

---

## 2. AI 开发工作流强制规则

每次接到需求，AI 必须先输出：

```text
变更影响：
- 前端：
- 后端：
- 数据库：
- API 契约：

安全边界与校验点：
- 前端 UX 校验：
- 后端安全校验：
- 数据库约束：
- 权限矩阵：
- 租户/资源归属：

测试计划：
- 单元：
- 集成：
- 契约：
- 安全：
- 并发/幂等：

回滚方案：
- 代码：
- 数据库：
- 配置：
```

编码时 AI 必须：
- 前端只做 UX 校验，并注明"后端必须重验"。
- 后端对所有前端字段重新校验。
- 数据库加约束和索引。
- 新增 API 更新 OpenAPI/GraphQL Schema。
- 新增字段加迁移和回滚。
- 新增权限加权限矩阵和测试。
- 新增依赖说明理由、许可证、漏洞、维护状态。

编码后 AI 必须输出：
- 变更文件清单
- 安全校验点对照
- 测试结果
- 未覆盖风险
- 回滚步骤

---

## 3. 前端开发规范

### 3.1 输入与表单校验

- 必须使用统一 schema 校验：Zod / Yup / Valibot / JSON Schema，禁止散落正则。
- 必须校验：必填、类型、长度、范围、枚举、格式、边界、负向值、嵌套对象、数组。
- 必须对邮箱、手机、URL、日期、金额、数量、库存、优惠券、状态做显式校验。
- 文件上传前端限制：类型、大小、数量、扩展名、MIME、图片尺寸；并注明"后端必须重验"。
- 必须防重复提交、防连点、防竞态；提交中禁用按钮只是 UX，后端必须幂等。
- 富文本、Markdown、HTML 渲染必须净化，禁止直接信任。

### 3.2 API 与数据层

- 所有请求走统一 API 层，禁止组件内散落 fetch/axios。
- 对响应做 schema 校验，不信任后端返回结构。
- 分页、排序、过滤字段使用白名单。
- 处理超时、取消、重试、错误码、空数据、部分失败。
- 推荐使用 OpenAPI/GraphQL 生成类型，避免契约漂移。

### 3.3 认证、授权、会话

- 明确：隐藏按钮、隐藏菜单、路由守卫都不是权限控制，后端必须鉴权。
- token 优先存 HttpOnly + Secure + SameSite Cookie；避免 localStorage 存长期敏感 token。
- 处理登出、会话过期、刷新令牌、多标签同步。
- 使用 CSRF token、CORS 白名单、CSP、OAuth state/PKCE。
- 禁止把前端权限判断结果作为后端信任依据。

### 3.4 前端安全

- 禁止使用 dangerouslySetInnerHTML、v-html、innerHTML、document.write、eval、new Function，除非有净化库并经过审查。
- 对 postMessage 校验 origin；iframe 使用 sandbox；WebView 桥接做白名单。
- 跳转 URL 白名单，防开放重定向。
- 第三方脚本使用 SRI、版本锁定、依赖扫描。
- 敏感信息不进入：sourcemap、console、URL、localStorage、错误上报。
- 配置 CSP、X-Frame-Options/frame-ancestors、Referrer-Policy、HSTS。
- 禁止硬编码密钥、token、密码、连接串。

### 3.5 前端测试

- 必须覆盖：边界、负向、权限展示、重复提交、竞态、弱网、错误码。
- 必须覆盖：XSS、开放重定向、上传、iframe/postMessage、敏感信息泄露。
- 推荐有组件测试、E2E、可访问性测试。

---

## 4. 后端开发规范

### 4.1 入口与输入校验

- 所有 API 入口统一认证、授权、租户隔离、资源归属校验。
- 使用 DTO/schema 校验：必填、类型、长度、范围、枚举、格式、嵌套、数组。
- 服务端重新裁决：userId、role、tenantId、permissions、price、amount、discount、status、stock、time。
- 防 IDOR/越权：每个资源查询必须带 user_id/tenant_id/归属条件。
- 限制请求体大小、上传大小、分页最大页大小、速率。
- 防重放：幂等键、请求 ID、nonce、时间窗。
- CORS 白名单、CSRF、安全头、HTTPS/HSTS。

### 4.2 业务逻辑

- 状态机显式定义，禁止任意跳转。
- 金额、价格、折扣、税费、库存、积分由后端计算。
- 事务边界清晰；并发扣减使用原子 SQL 或锁。
- 幂等设计；重试、补偿、最终一致性要有方案。
- 乐观锁/悲观锁按场景选择，版本号防覆盖。
- 关键操作写审计日志：操作人、租户、资源、动作、结果、时间、IP、请求 ID。

### 4.3 注入与常见安全

- SQL 参数化；ORM 原始 SQL 必须审查。
- 动态 ORDER BY、表名、列名使用白名单。
- 防命令注入、NoSQL 注入、LDAP/XPath/模板注入。
- 防 SSRF：URL 白名单、禁止内网 IP、禁止危险协议。
- 防 XXE：禁用外部实体。
- 反序列化白名单。
- 文件上传后端重验：MIME、魔数、扩展名、大小、数量；重命名、隔离存储、禁止执行权限、病毒扫描。
- 路径穿越规范化校验。
- JWT 固定算法，禁止 none；刷新令牌轮换、可撤销。
- 密码使用 Argon2id/bcrypt 等强哈希；禁止明文、弱哈希。
- 密钥、连接串、证书使用密钥管理/环境变量；禁止入库、入代码、入前端。
- 错误统一，不泄露堆栈、SQL、内部路径、密钥。
- 日志脱敏：密码、token、身份证、银行卡、手机号。

### 4.4 后端测试

- 必须覆盖：认证、授权、越权、IDOR、多租户、注入、幂等、并发、事务、迁移回滚。
- 必须有契约测试，保证前后端一致。
- 推荐有模糊测试、性能测试、安全回归。

---

## 5. 数据库及表设计规范

### 5.1 表与字段

- 每表必须有主键。
- 必要外键、唯一约束、非空、检查约束、默认值。
- 金额用 decimal，禁止 float/double。
- 时间统一 UTC，使用 timestamptz 或等价类型。
- 状态、枚举用检查约束或字典表。
- 审计字段：created_at、updated_at、created_by、updated_by。
- 需要软删除时用 deleted_at，唯一约束要考虑软删除。
- 乐观锁用 version 字段。
- 推荐字符集 utf8mb4，命名统一 snake_case。

### 5.2 索引与性能

- 外键、唯一、高频查询、复合条件建索引。
- 避免 N+1、全表扫描、隐式类型转换。
- 大表考虑分区、归档、冷热分离。
- 定期慢查询分析、执行计划审查。

### 5.3 权限与安全

- 应用账号最小权限，禁止 root/高权共享账号。
- 只读账号、读写账号分离。
- 敏感字段加密、脱敏、行级安全按需启用。
- 存储过程、触发器、视图不能绕过应用校验。
- 备份、恢复、保留、删除策略明确。

### 5.4 迁移

- 迁移版本化、可回滚、与 ORM 模型一致。
- 线上迁移分阶段：加字段 → 双写 → 回填 → 切读 → 删旧。
- 迁移前检查线上库漂移。
- 禁止直接手动改线上表结构而不留迁移记录。

---

## 6. API 契约规范

- 使用 OpenAPI/GraphQL Schema 作为单一事实源。
- 定义请求/响应 DTO、错误码、分页、排序、过滤。
- 排序、过滤字段白名单。
- 分页有最大页大小。
- 写操作支持幂等键。
- 请求带请求 ID，便于追踪。
- API 版本兼容；破坏性变更必须新版本。
- GraphQL 限制深度、复杂度、批量查询。

---

## 7. 测试与 CI/CD 质量门禁

CI 必须包含：
- lint、typecheck、unit test、integration test、build
- 契约测试、E2E 关键路径
- SAST、DAST、SCA、秘密扫描、容器扫描、IaC 扫描
- 数据库迁移检查、回滚检查

必须覆盖的关键路径：
- 登录、权限、支付、订单、库存、上传、租户隔离。

必须覆盖的安全用例：
- 越权、IDOR、注入、XSS、CSRF、SSRF、上传、开放重定向、幂等、并发。

门禁规则：
- 测试失败、扫描高危未修复，禁止合并。
- 覆盖率关注关键模块，不追求形式数字。

---

## 8. Definition of Done（完成定义）

一个需求只有满足以下条件才算完成：

- 前端：schema 校验、API 层、权限展示、错误处理、测试。
- 后端：DTO 校验、鉴权、租户隔离、事务、幂等、审计、错误处理、测试。
- 数据库：迁移、约束、索引、回滚。
- API：OpenAPI/GraphQL Schema 更新、错误码、版本兼容。
- 安全：无高危 SAST/DAST/SCA/秘密扫描问题。
- CI：全绿。
- 文档：变更说明、回滚方案、风险说明。

---

## 9. 禁止清单

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

### 9.1 前端 UI 禁止清单（补充）

- 禁止在表单页头部右侧放保存/提交按钮（统一放页面底部 `.form-footer`）。
- 禁止使用 antd `Card title=... headStyle=...` 彩色标题头（表单页模块分组必须用白色 div 卡片）。
- 禁止在 `layout="vertical"` 的 Form 中给 Form.Item 使用 `labelCol={{ flex: 'XXXpx' }}`。
- 禁止详情页顶部放操作按钮（只读模式）。
- 禁止详情页底部显示完整操作日志表格（只允许「最后更新人 + 最后更新时间」）。
- 禁止列表页不用 `useColumnConfig` 自行实现列配置。
- 禁止分页 `showTotal` 插值变量用 `total`（必须用 `count`）。
- 禁止 pageSize 变化时不重置到第 1 页。
- 禁止部门选择用 Input / 普通 Select（必须用 TreeSelect）。
- 禁止提交申请类按钮不用 `Modal.confirm` + `custom-confirm-modal` 二次确认。
- 禁止先弹确认框后做表单校验（顺序必须是：校验 → 弹框 → API）。
- 禁止在 catch 里重复 `message.error`（`request.ts` 已统一弹，双弹会造成困扰）。
- 禁止用 `alert()` / `window.confirm()`。
- 禁止硬编码「暂无数据」等空态文案（必须用 `<Empty description={t('xxx.empty')} />`）。
- 禁止新增 i18n key 只加一个语言文件（必须 `zh-TW.json` + `en.json` 同步）。
- 禁止引入 SCSS / Less / Tailwind / CSS-in-JS / styled-components / CSS Variables。
- 禁止用 `@media` 响应式断点（靠 Flex/Grid 自适应）。
- 禁止在组件内重复定义全局 keyframes（必须复用 `global.css` 已注册的）。
- 禁止随意引入 §A.1 之外的新色值。
- 禁止按钮不用语义化 class（`.btn-export` / `.btn-import` / `.ant-btn-dangerous`）。
- 禁止用内联样式覆盖 `.form-footer` / `.detail-header` / `.detail-card` 全局类。
- 禁止代码注释用繁体中文或英文（必须简体中文）。

---

## 10. 每次开发前检查清单

AI 开发前必须逐项确认：

### 10.1 通用检查项

- 是否已读取 AGENTS.md？
- 是否已输出变更影响？
- 是否已列出前端 UX 校验？
- 是否已列出后端安全校验？
- 是否已列出数据库约束和索引？
- 是否已列出权限矩阵和租户/资源归属？
- 是否已列出测试计划？
- 是否已列出回滚方案？
- 是否涉及新增依赖、密钥、配置、迁移？
- 是否存在越权、注入、XSS、CSRF、SSRF、上传、幂等、并发风险？

### 10.2 前端 UI 专项检查（涉及前端时必填）

- 是否已阅读「前端 UI/UX 设计规范」章节（§A~§K）？
- 是否已阅读 `.qoder/rules/form-page-style.md`（新增/编辑页）？
- 是否已对照 §L.1「开发前检查清单」逐项确认？
- 页面类型确认：新增/编辑 / 详情 / 列表 / 弹窗 / 仪表盘？
- 色彩是否仅使用 §A.1 登记的设计令牌？
- 按钮语义是否匹配 §B.1 表格？
- 是否需要 Modal 二次确认（提交申请类）？
- 是否需要列配置（列表页必须用 `useColumnConfig`）？
- 部门选择是否用 `TreeSelect`（禁止 Input/Select）？
- i18n key 是否已在 `zh-TW.json` + `en.json` 同步登记？
- 是否已识别可复用的全局类（`.detail-header` / `.detail-card` / `.form-footer` / `.search-section` / `.action-section` / `.custom-confirm-modal` / `.btn-export` / `.btn-import`）？

---

## 11. 每次开发后交付清单

AI 开发后必须输出：

### 11.1 通用交付项

- 变更文件清单。
- 安全校验点对照表。
- 前端 UX 校验与后端安全校验对应关系。
- 数据库迁移、约束、索引、回滚说明。
- API 契约变更说明。
- 测试结果。
- 未覆盖风险。
- 回滚步骤。

### 11.2 前端 UI 专项交付项（涉及前端时必填）

- 是否已对照 §L.2「开发中检查清单」逐项打勾？
- 是否已对照 §L.3「开发后自检清单」逐项打勾？
- `npm run typecheck` 是否通过？
- `npm run lint` 是否通过（无新增 error）？
- `npm run test:run` 是否通过（如涉测试文件）？
- 浏览器实际验证：新增/编辑/详情三模式布局一致？
- 浏览器实际验证：列表页搜索、列配置、分页、导出全链路？
- 浏览器实际验证：Modal 二次确认上下文信息完整？
- 浏览器实际验证：message 提示文案正确、无双弹？
- 浏览器实际验证：i18n 切换后所有文案正常？
- 新增 i18n key 是否同步到 `zh-TW.json` + `en.json`？
- 新增页面是否使用全局类（`.detail-header` / `.detail-card` / `.form-footer` / `.search-section` / `.action-section` / `.custom-confirm-modal`）？
- 列表页是否使用 `useColumnConfig` hook？
- 详情页底部是否有「操作记录」模块？
- 新增按钮是否使用语义化 class（`.btn-export` / `.btn-import` / `.ant-btn-dangerous`）？
- 例外/豁免项是否已按 §M 记录（原因/风险/补偿措施/负责人/到期时间）？

---

## 12. 增量审计规则

- 后续审计只做增量审计 + 门禁抽查，不再每次全面修复。
- 新增代码必须符合本规范。
- 历史问题按修复路线图分批处理。
- 每次 PR 必须自检本规范第 10 节（含 §10.2 前端 UI 专项检查）。
- 每次前端 PR 必须自检 §L「前端 UI 检查清单」。
- CI 必须拦截高危问题。
- 每次线上事故必须反补规则、测试和门禁。
- 每次 UI 规范例外必须按 §M 记录并设定到期时间。
