---
description: 前端 UI/UX 设计规范（强制标准）第一部分：设计令牌(A)、交互样式(B)、新增编辑界面(C)。涉及前端界面开发时必须遵循。
globs:
  - "src/**/*.{ts,tsx,css}"
alwaysApply: false
---

# 前端 UI/UX 设计规范（强制）

版本：1.1
状态：强制
适用范围：所有新建/修改的前端页面、组件、交互、提醒、样式。
基准来源：`.qoder/rules/form-page-style.md`、`frontend/packages/ui/src/styles/components.css`、`frontend/packages/ui/src/styles/global.css`、`frontend/packages/ui/src/hooks/useColumnConfig.tsx`、`frontend/packages/platform-client/src/api/request.ts`。

> ⚠️ 路径修正（2026-11-03）：共享层已拆为 workspace 包，`src/styles/`、`src/components/`、`src/hooks/`、`src/api/`
> 均已不存在，真源在 `frontend/packages/{ui,platform-client,i18n,contracts}/`，通过别名 `@/styles`、`@/components` 等消费。
> 旧路径写法会误导人改错文件（改了不生效，因为构建读的是包内那份）。

> **AI 元规则**：每次涉及新界面 / 新交互 / 新提醒 / 新样式，必须先阅读本章；开发完成后必须逐条自检 §L「前端 UI 检查清单」，未通过不得提交。

### 页面类型速查（所有二级菜单页面）

| 类型 | 用途 | 全局 CSS 类 |
|------|------|------------|
| **列表页** | 搜索 + 表格 + 操作 | `.search-section` + 统计卡片（可选） + `.action-section` + Table |
| **详情页** | 只读展示 | `DetailPageHeader` 组件 + `.content-area` |
| **表单页（新增/编辑）** | 表单输入 | `.content-area` + `.form-footer` |
| **独立页（定价等）** | 复杂业务页 | 参考同类型已有页面 |

> ️ **独立页面优先原则**：新增/编辑/详情必须使用独立页面，**禁止使用 Modal 弹窗**（详见 §9.1）。

---

## A. 设计令牌（Design Tokens）

### A.1 色彩系统

> **色值真源与双主题**：全站支持浅色/深色双主题，令牌取值由 `scripts/lib/theme-token-map.mjs` 的 `TOKEN_VALUES`
> 统一定义（唯一真源），并由它生成 `frontend/packages/ui/src/styles/theme.css`（`:root` 与 `html[data-theme='dark']`）
> 与 antd 侧的 `themeTokens.ts`。
> **本表只登记浅色值与语义用途，不复制深色值**：规则文件里再抄一份必然与代码漂移，漂移后没人知道哪份是真的。
> 深色值请查 `theme.css`；改值必须改 `TOKEN_VALUES`，由门禁 `npm run check:theme-tokens` 校验三方一致。
> 方案与深色取值依据（含 WCAG 对比度实测矩阵）：`docs/design/深浅色主题切换_可落地实施方案_2026-11-03.md` §4。

| 语义令牌 | 类别 | 浅色值 | 用途 |
|------|------|------|------|
| `--brand` | **主品牌色** | `#E8720C` | 主按钮、选中态、菜单高亮、Logo、链接、Tab 激活 |
| `--brand-hover` | **主色 hover** | `#F59432` | 悬停态 |
| `--success` | **成功 / 导出** | `#52C41A` | `.btn-export` 绿色描边 |
| `--info` | **信息 / 导入** | `#1890FF` | `.btn-import` 蓝色描边、基础信息图标 |
| `--warning` | **警告 / 参数** | `#FA8C16` | 参数/策略/配置类模块图标 |
| `--purple` | **高级 / 特殊** | `#722ED1` | 高级/特殊类模块图标 |
| `--danger` | **危险 / 删除** | `#FF4D4F` | antd `danger`、删除/驳回 |
| `--border-1` / `--border-2` / `--border-3` | **中性边框** | `#D9D9D9` / `#F0F0F0` / `#E8EAED` | 描边、分隔线、卡片边框 |
| `--border-input` | **输入控件边框** | `#D9D9D9` | Input/Select/DatePicker 专用（深色下比 `--border-1` 亮一档，保证可辨识） |
| `--text-1` | **文本主色** | `#262626` | 卡片标题 |
| `--text-2` | **文本次色** | `#595959` | 表单标签、副标题 |
| `--text-3` | **文本弱色** | `#8C8C8C` | 说明文字、灰字提示 |
| `--text-4` | **禁用/最弱** | `#BFBFBF` | 禁用态文字、滚动条滑块（**禁止承载提示文案**，见 §N.4） |
| `--on-brand` | **品牌底前景** | `#FFFFFF` | 品牌橙实底上的文字**与图标**：主按钮文字、Checkbox 勾号、Radio 内圆点、Menu 选中项、Switch 选中文字。深色主题取 `#141414`（橙底上 6.00:1，白字仅 3.07:1） |
| `--text-brand` | **标题蓝** | `#1890FF` | 表单页/详情页标题（§C.2、§D.1 规定的蓝色标题） |
| `--surface-1` / `--surface-2` / `--surface-3` | **表面三阶** | `#F5F5F5` / `#FFFFFF` / `#FAFAFA` | 页面底 / 卡片底 / 表头与只读块底 |
| `--surface-sunken` | **凹陷面** | `#FAFBFC` | 内嵌区（代码块、预览区） |
| `--sidebar-bg` 等组件层 | **深色侧边栏** | `#1E1E1E`（遗留 `#001529`） | 侧边栏背景；组件层令牌只允许壳层 CSS 引用 |
| `--brand-soft` + `--brand-border` | **暖橙面板** | `#FFF7F0` + `#FFE7D1` | Modal 二次确认信息面板 |
| `--shadow-1..3` / `--shadow-brand` / `--card-outline` | **阴影与描边补偿** | 见 §A.2 | 深色下阴影失效，必须与 `--card-outline` 成对使用 |

**禁止**：
1. 随意引入上述之外的新色值；如需扩展必须先在 `TOKEN_VALUES` 补令牌（浅色值 + 深色值 + 实测对比度），再登记到本表。
2. 在 CSS 与 JSX 里写**裸色值**（如 `color: '#262626'`、`background: #fff`）；必须写 `var(--text-1)` / `var(--surface-2)`。
   存量裸色值按棘轮基线 `scripts/theme-token-baseline.json` 分批清理（只降不升），新增即门禁失败。
3. 引用 primitive 层令牌（`--gray-*` / `--orange-*`）：那一层只允许 `theme.css` 内部使用。
   同理，**禁止拿 `--surface-2`（卡片白底）当品牌橙底上的文字色**：两者浅色系同值，
   但语义相反，混用后令牌调值时会互相牵连（品牌底前景该改黑，卡片底当然不能改黑）。
   品牌色实底上的前景一律用 `--on-brand`。
4. 在业务代码里用 `if (isDark)` 分支决定颜色：颜色差异一律由令牌承担。
   仅三处允许读当前主题——`@ant-design/charts` 的 `theme` 配置、leaflet 瓦片降亮、`html-to-image` 导出锁浅色。

#### A.1.1 插画场景色板（门户系统卡）

门户卡片采用「一系统一色」，插画统一以 `currentColor` 取色，色调由 `src/pages/Portal/index.css` 的
`.portal-card-artwork[data-scene='xxx'] { color: ... }` 声明，`data-scene` 是唯一真源。

| scene | 色值 | 语义 |
|-------|------|------|
| `ads` | `#E8720C` | 品牌橙：算法投流是核心营收 |
| `search` | `#3D5DDD` | 电光蓝：检索与词库策略 |
| `merchant` | `#20B5B5` | 青绿：BD 拓店与地图规划 |
| `merchantWorkbench` | `#DBA333` | 金：商家自助经营与收益 |
| `finance` | `#52C41A` | 绿：资金与对账 |
| `eam` | `#BB6C21` | 深橙棕：物资设备的工业感 |
| `hr` | `#1890FF` | 用户蓝：对齐侧边栏 |
| `attendance` | `#1C9F9F` | 青：考勤假勤 |
| `oa` | `#FA8C16` | 琥珀：流程发起与审批 |
| `rdm` | `#DD3D95` | 洋红：研发交付与上线发布 |
| `meeting` | `#225EC0` | 深蓝：会议室的时间与秩序 |
| `doc` | `#2A6913` | 深林绿：知识沉淀与阅读 |
| `ai` | `#722ED1` | 紫：AI 能力 |
| `iam` | `#9254DE` | 紫：权限与账号安全（原 #001529 近黑已按约束②整改） |
| `platform` | `#096DD9` | 信息蓝深阶：平台配置与发布（原 `#595959` 整卡偏灰，被读成「禁用」，按 §S6 整改） |
| `translation` | `#19888B` | 深青：地球与多语言 |
| `payroll` | `#2BCA65` | 翠绿：薪酬与发放（与考勤青、HR 天蓝、组织靛蓝互斥） |
| `organization` | `#5E46D8` | 靛蓝：组织与编制（与 AI 紫 / 权限紫 / 搜索电光蓝互斥） |

> 上表共 18 个 scene，与 `src/pages/Portal/index.css` 的 `[data-scene='xxx']` 逐字对应；
> 由 `npm run check:theme-tokens` 第 6 条断言比对基线 `SCENE_COLOR_BASELINE`，两边不一致当场失败。
> scene 色**不参与主题切换**（浅色/深色同值），它只负责「一系统一色」的识别。

**硬约束**（摘自《企业门户界面设计评审 2026-10-24》§S2）：

1. **同组互斥**：同一业务域内并排展示的卡片色相必须互斥（已由 `Portal.test.tsx`
   的色调回归用例钉死：全部 16 个 scene 不得重色）。
2. **禁止近黑实心块**：插画内不得使用 `#001529` 及任何 L<20% 的实心块（渐变暗端同样禁止）。
   已整改：`iam` 主色由 `#001529` 改为 `#9254DE`；门店经营卡的鼠标指针改 `#595959`；
   权限卡门洞改 `currentColor` + 16% 透明度。
3. **主色饱和度控制在 60~70%**：已把 9 个非令牌场景色统一压到 S=70%（保持 H/L），
   例如 `#EB2F96→#DD3D95`、`#2F54EB→#3D5DDD`、`#13C2C2→#20B5B5`；
   **§A.1 已登记的品牌色与语义色豁免**（`#E8720C`/`#52C41A`/`#1890FF`/`#FA8C16`/`#722ED1`/`#595959`）。
4. **品牌橙只允许出现 1 次**，且必须标记「结果/成功」（对勾、完成态、达标值）；
   其余零件一律用该卡主色的明度阶（`currentColor` + `opacity .12/.3/.6/1`）。
5. **例外登记**：新增 scene 必须先在本表补行，否则 `Portal.test.tsx` 的色调用例会红。

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

**阴影规范**

| 场景 | 阴影 |
|------|------|
| 侧边栏 | `2px 0 12px rgba(0,0,0,0.15)` |
| 顶部导航 | `0 2px 8px rgba(0,0,0,0.06)` |
| 卡片默认 | `0 2px 8px rgba(0,0,0,0.04~0.06)` |
| 按钮 hover | `0 2px 6px rgba(0,0,0,0.1)` |
| 按钮 active | `0 4px 12px rgba(0,0,0,0.12)` |
| 主色按钮 | `0 2px 4px rgba(232,114,12,0.25)` |
| 主色按钮 hover | `0 4px 10px rgba(232,114,12,0.35)` |
| 下拉框 | `0 6px 24px rgba(0,0,0,0.12)` |

**间距规范**

| 场景 | 间距 |
|------|------|
| 页面内边距 | `20px 24px` |
| 搜索区 Grid gap | `16px 12px`（行 16px，列 12px） |
| 搜索区底部 margin | `16px` |
| 按钮间距 | `8px`（搜索区）/ `12px`（页面底部） |
| 卡片间距 | `16px` |
| 首页板块间距 | `20px` |
| 表单 label 底部 | `4px` |

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

#### B.1.1 列表内可点元素色彩统一 ⚠️ 强制标准

> 背景：商家权重分「綁定瀑布流」的 `+N` 展开入口一度被做成描边胶囊，与同一行右边的「詳情」不是同一套颜色，
> 用户无法从颜色判断哪些东西能点。结论：**可点的东西就长得一样，hover 就给可点颜色。**

表格单元格内的一切可点元素（操作列按钮、展开入口如 `+N`、行内链接文字、可点击图标）必须沿用操作列的色彩语言，
即全局 `frontend/packages/ui/src/styles/components.css` 的 `.ant-table .ant-btn-link`：

| 状态 | 非危险类 | 危险类（删除/撤销） |
|------|-----------|------------------|
| 静态 | `#E8720C` 品牌橙文字 | `#FF4D4F` |
| hover | `#F59432` + 浅橙底 `rgba(232,114,12,0.06)` + `scale(1.05)` | `#FF7875` + 浅红底 |

**做法（唯一允许）**：用 `<Button type="link" size="small">`，让全局规则生效；页面自有 CSS 只允许补**形态与布局属性**
（`border` / `border-radius` / `padding` / `flex-shrink` / `font-weight` 等），**不得**为该元素重写 `color`、`background`、
`box-shadow` 或 hover 文字色。需要描边时，选择器要叠到 `.ant-table .ant-btn-link.<自己的类>` 一级以覆盖全局的
`padding`/`border-radius`，描边取**同一主色的透明度阶**（如 `rgba(232,114,12,0.35)`，hover `rgba(245,148,50,0.65)`）。

**禁止**：
- 用实心块、渐变底或**新色相**来“突出可点”（描边胶囊本身允许，但只能按上面的取色方式）；
- 同一个单元格/行内出现两种不同橙色的可点元素（文字色必须同源，否则就是两套色彩语言）；
- 可点元素只靠 `cursor: pointer` 而 hover 无任何反馈。

**自检**：断言可点元素 `className` 含 `ant-btn-link`，且页面 CSS 未给它手写 `color`；参考实现
`src/pages/TrafficSandbox/MerchantScoreInsight.tsx` 的 `.organic__wf-more`（只加描边/圆角/布局，文字色全继承）。

### B.2 全局 hover 微动效

- 所有非 link/text 按钮：`transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1)`，hover `translateY(-1px)`，active `translateY(0)`
- 页面底部按钮 hover：`translateY(-2px)` + `box-shadow: 0 4px 12px rgba(0,0,0,0.12)`
- 表格链接按钮 hover：`scale(1.05)` + 浅色背景
- **禁用态无动效**：`.ant-btn[disabled]:hover { transform: none !important; box-shadow: none !important; }`
- 按钮图标与文字间距：`.ant-btn .anticon + span { margin-left: 6px; }`

**Hover 交互效果汇总**

| 组件 | hover 效果 | 过渡时间 |
|------|-----------|--------|
| 按钮 | `translateY(-1px)` + 阴影加深 | `0.25s` |
| 侧边栏菜单项 | 白色半透明背景 | `0.25s` |
| 侧边栏图标 | `scale(1.15)` | `0.2s` |
| 表格 link 按钮 | 背景微亮 + `scale(1.05)` | `0.2s` |
| 首页收藏卡片 | `translateY(-2px)` + 阴影 | `0.2s` |
| 首页收藏删除按钮 | `opacity: 0→1` | `0.2s` |
| 统计卡片 | `translateY(-2px)` + 阴影加深 | `0.2s` |
| 数据指标统计卡 | `translateY(-4px)` + 阴影 `0 8px 24px rgba(0,0,0,0.1)` | `0.35s` |
| 通知项 | 背景变深 | `0.15s` |
| 搜索下拉项 | 背景 `#F5F5F5` | `0.15s` |
| 顶部图标 | 背景 `#F0F0F0` + 变橙色 | `0.25s` |
| 用户信息区 | 背景 `#F5F5F5` + 阴影 | `0.25s` |
| 社交登录按钮 | `translateY(-3px)` + 图标 `scale(1.08)` | `0.25s` |
| 验证码复选框 | 边框变色 + 背景微亮 | `0.3s` |
| 验证码选项 | `translateY(-2px)` + 边框变色 | `0.2s` |
| 登录页三角切换 | 渐变变色 + 图标 `scale(1.1)` | `0.3s` |
| 返回账号按钮 | 文字变色 + 背景微亮 | `0.2s` |
| 欠款统计卡片 | `translateY(-2px)` + 阴影加深 | `0.2s` |
| 收藏添加按钮 | 边框变色 + 背景变色 | `0.2s` |

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
| 列显隐/顺序配置 | `useColumnConfig(pageKey, columnMeta, defaultConfig)`（三区外观，但锁定可拖入非锁定区或 × 解除） | 自行实现 |
| 提交申请类按钮 | `Modal.confirm` + `custom-confirm-modal` | 直接调 API / `window.confirm` |
| 模块分组卡片 | 白色 `div` + 内联样式 | antd `Card title=... headStyle=...` 彩色标题头 |
| 富文本渲染 | 必须净化（DOMPurify 等） | `dangerouslySetInnerHTML` 直传 |

### B.7 数据指标统计卡片标准（动效统计卡） ⚠️ 强制标准

> 适用范围：页面/详情/Tab 内的「4 格数据指标概览卡」（如订单详情推广数据、新店剩余推广天数、赠送明细统计等）。
> 往后所有新增同类统计卡片**必须**遵循此标准，参考实现：订单详情「推广数据」Tab 四卡（`src/pages/OrderDetail/index.tsx`）。

- **卡片结构**（上→下三段式，居中对齐）：图标 `20px` 同色系 → 数值 `22px/700` 同色系 → 标签 `12px` `#8C8C8C`
- **容器样式**：圆角 `12px`，padding `16px`，背景用淡色底，描边 `1px solid ${color}22`（主色 + 13% 透明度），`text-align: center`，`position: relative; overflow: hidden`
- **配色色板**（主色/底色，按语义取色）：

  | 语义 | 主色 | 底色 |
  |------|------|------|
  | 信息/总量 | `#1890FF` | `#E6F7FF` |
  | 成功/剩余 | `#52C41A` | `#F6FFED` |
  | 品牌/已用 | `#E8720C` | `#FFF7E6` |
  | 系统/时间 | `#722ED1` | `#F9F0FF` |

- **hover 动效**（必须）：移入 `translateY(-4px)` + 阴影 `0 8px 24px rgba(0,0,0,0.1)`，移出恢复；过渡 `all 0.35s cubic-bezier(0.4, 0, 0.2, 1)`，`cursor: default`
- **数字加载动画**（必须）：数值使用 `useCountUp` Hook + `AnimatedNumber` 组件（`requestAnimationFrame` 实现，时长 `1200ms`，缓动 `1 - Math.pow(2, -10 * progress)`，`toLocaleString()` 千分位）；日期/百分比等非计数字段可不做计数动画；切换查询对象时通过网格容器 `key` 重新触发动画
- **布局**：`display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px`
- **位置顺序**：列表页的统计卡片**必须放在搜索区下方**（详见 §E.8），禁止置于搜索区上方
- **禁止**：不得再使用旧式静态统计卡（无 hover/无计数动画、`#E3F2FD`/`#FFF3E0` 深色文字方案）新建数据指标卡；既有页面遇修改时顺带对齐此标准

### B.8 状态开关（Switch）规范 ⚠️ 强制标准

> 适用范围：所有列表页中用于切换"启用/停用"状态的 Switch 组件。
> 参考实现：`src/pages/MenuConfig/index.tsx`、`src/pages/AiModelList/index.tsx`。

- **文案固定**（必须）：`checkedChildren="啟用"`、`unCheckedChildren="停用"`，**禁止**使用默认值或"開/關""已启"等其他文案
- **尺寸统一**：列表页状态 Switch 使用默认尺寸（**禁止** `size="small"`）；仅在表单内嵌、弹窗条件配置等非列表场景允许 `size="small"`
- **二次确认**（必须）：Switch `onChange` 触发时**禁止直接调用 API**，必须先弹出 `Modal.confirm` 二次确认框，提示内容：`確定要[啟用/停用]該配置嗎？`，用户点击"確認"后才执行 API 更新并刷新列表
- **确认弹窗样式**：必须使用 `className: 'custom-confirm-modal'` + `icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>`
- **禁用态无动效**：`disabled` 状态的 Switch 不应有 hover 效果

```tsx
// ✅ 正确示例：列表页状态 Switch
<Switch
  checked={record.status === 'enabled'}
  checkedChildren="啟用"
  unCheckedChildren="停用"
  onChange={() => handleToggleStatus(record)}
/>

// ✅ 正确示例：handleToggleStatus 带二次确认
const handleToggleStatus = (record: SomeRecord) => {
  const newStatus = record.status === 'enabled' ? 'disabled' : 'enabled'
  const actionText = newStatus === 'enabled' ? '啟用' : '停用'
  Modal.confirm({
    title: `確定要${actionText}該配置嗎？`,
    className: 'custom-confirm-modal',
    icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
    okText: '確認',
    cancelText: '取消',
    onOk: async () => {
      await updateApi(record.id, newStatus)
      message.success(`${actionText}成功`)
      loadData()
    },
  })
}

// ❌ 错误：缺少 checkedChildren/unCheckedChildren
<Switch checked={record.enabled === 1} onChange={...} />

// ❌ 错误：直接使用 size="small" 在列表页
<Switch size="small" checkedChildren="啟用" ... />

// ❌ 错误：直接调用 API，无二次确认
const handleToggle = async (id, enabled) => { await toggleApi(id, enabled) }
```

### B.9 操作列按钮规范 ⚠️ 强制标准

> 适用范围：所有列表页表格底部的操作列（Action Column）。
> 参考实现：`src/pages/NotificationConfig/index.tsx`、`src/pages/Consumable/Item/ItemList.tsx`。

- **禁止图标**：操作列按钮**严禁**使用 Icon 组件（如 `<EditOutlined />`、`<DeleteOutlined />`、`<ArrowUpOutlined />` 等），仅保留纯文本
- **分隔符**：多个操作按钮之间必须使用竖线 `|` 分隔，通过 `Space` 组件的 `split` 属性实现：`split={<span className="action-split">|</span>}`
- **按钮类型**：统一使用 `type="link"` + `size="small"`，危险操作加 `danger` 属性
- **按钮顺序**：详情 → 編輯 → 其他操作 → 刪除（刪除始终放最后）

```tsx
// ✅ 正确示例
<Space size={0} split={<span className="action-split">|</span>}>
  <Button type="link" size="small" onClick={() => onView(record.id)}>詳情</Button>
  <Button type="link" size="small" onClick={() => onEdit(record.id)}>編輯</Button>
  <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
</Space>

// ❌ 错误：使用图标
<Button type="link" size="small" icon={<EditOutlined />} onClick={...} />

// ❌ 错误：无分隔符
<Space>
  <Button type="link">編輯</Button>
  <Button type="link" danger>刪除</Button>
</Space>
```

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
<div style={{ borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
  {/* 标题行 */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
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

**详情页样式基准（2026-09 修订，对齐采购订单详情 `PurchaseOrder/OrderDetail.tsx`）**：

- **详情页模块卡片：不加 border**，阴影统一 `0 2px 8px rgba(0,0,0,0.06)`；信息展示用 `<Descriptions column={4} size="middle">`（非 bordered）
- **表单页模块卡片**可保留 `border: '1px solid #e8eaed'` + 阴影 0.04 描边样式
- **详情页必须以「最后更新」footer 收尾**（替代独立的「操作记录」卡片）：

```tsx
<div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px',
  border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
  <span style={{ fontSize: 12, color: '#8C8C8C' }}>最后更新人：<span style={{ color: '#595959' }}>{updatedBy}</span></span>
  <span style={{ fontSize: 12, color: '#8C8C8C' }}>最后更新时间：<span style={{ color: '#595959' }}>{updatedAt}</span></span>
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

### C.4.1 備註輸入框統一標準 ⚠️ 強制標準

- 全系統備註一律使用 `src/components/RemarkTextArea`（`Input.TextArea` + `rows={3}` + `maxLength={200}` + `showCount` + `resize: none`）。
- 備註必須**獨占一整行**（grid 容器內 `gridColumn: '1 / -1'`），禁止與其它字段並排：並排時列寬變窄，3 行裝不下 200 字。
- 尺寸依據：備註實際多為 1~3 句（60~120 字），上限 200 字；整行約 85 字/行，`rows={3}` 可顯示約 255 字 ≥ 上限，用戶無需拖拽高度即可看全內容。
- 禁止自行寫 `rows={1|2|4|8}` 或單行 `Input` 充當備註；歷史散落的 rows 取值（1~8）均視為不合规。

### C.4.2 字段下方提示（extra）約束 ⚠️ 強制標準

- `extra` 只保留**必要**提醒（位數校驗、級聯前置條件、業務硬約束），其餘一律刪除；placeholder 已能表達的不得再寫 extra。
- 提示必須**簡短單行**（原則 ≤ 12 字），禁止出現換行/折行；動態校驗反饋（如車牌位數不符）除外。
- 提示文案必須繁中，禁止簡體字混入。

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

### C.6 表单页完整结构模板

```tsx
<div className="content-area">
  {/* 顶部标题栏（橙色渐变顶条，对齐定价页规范） */}
  <div style={{
    position: 'relative', background: '#fff', marginBottom: 16,
    borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  }}>
    {/* ⚠️ 橙色渐变顶条（必须） */}
    <div style={{
      height: 3,
      background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
      backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
    }} />
    <div style={{
      padding: '16px 24px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
          style={{
            backgroundColor: '#E8720C', borderColor: '#E8720C',
            borderRadius: 8, height: 36, padding: '0 16px',
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
          }}
        >返回</Button>
        <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
          頁面標題
        </h2>
      </div>
    </div>
  </div>

  {/* 卡片模块（可多个） */}
  <div style={cardStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon style={{ fontSize: 14, color: '#1890ff' }} />
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>模块标题</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
    <div style={{ padding: '0' }}>
      {/* 表单字段 */}
    </div>
  </div>

  {/* 底部操作栏 */}
  <div className="form-footer">
    <Button onClick={onBack}>取消</Button>
    <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
  </div>
</div>
```

**关键约束**：
- ⚠️ 顶部必须有**橙色渐变顶条**（3px，`headerGradientShift` 动画）
- 容器 borderRadius: **12**（不是 8），boxShadow: `0 2px 12px`
- 底部按钮统一为「取消 + 保存」，取消无图标，保存用 `SaveOutlined`
- 返回按钮为 `type="primary"` 实心橙色 + boxShadow
- 标题颜色为 `#1890ff`（蓝色）

**参考实现**：`src/pages/Recommend/WaterfallAdd/index.tsx`（add/edit mode）、`GoldenSignboardPricing.tsx`、`PopularSkinPricing.tsx`


---

## D. 详情界面规范

### D.1 详情页头部 —— `DetailPageHeader` 组件

> ️ `.detail-header` CSS 类已过时，**必须使用 `DetailPageHeader` 组件**（`src/components/DetailPageHeader.tsx`）。

**组件 API**：
```tsx
import DetailPageHeader from '../../../components/DetailPageHeader'

<DetailPageHeader
  title="頁面標題"
  meta={<>{model.code} · {model.name}</>}   // 可选，副标题行
  onBack={onBack}                            // 必填，返回回调
  onEdit={() => navigate(`/edit?id=${id}`)}  // 可选，编辑按钮
  menuKey="menu-key"                         // 可选，权限门控
/>
```

**组件样式**：
- 紫色渐变顶条（3px，流动动画）
- 白底容器，borderRadius: 12, boxShadow
- 橙色返回按钮（type="primary", #E8720C）
- 分隔线 → 蓝色标题（#1890ff, 18px/700）
- 可选 meta 行（12px, #8C8C8C）
- 右侧可选编辑按钮（紫色 #722ED1，按菜单权限门控）

**禁止项**：
- ❌ 不使用 `.detail-header` CSS 类（已过时）
- ❌ 不自己手写返回按钮 + 标题的 inline style
- ❌ 不添加底部操作栏（取消/保存）

**参考实现**：`src/pages/Recommend/WaterfallAdd/index.tsx`（详情模式）、`GoldenSignboardPricing.tsx`、`PopularSkinPricing.tsx`

### D.2 详情内容卡片 `.detail-card`

白底 / 圆角 8px / padding `20px 24px` / margin-bottom 16 / 阴影 `0 2px 8px rgba(0,0,0,0.06)`。

### D.3 详情页完整结构模板

```tsx
import DetailPageHeader from '../../../components/DetailPageHeader'

<div className="content-area">
  {/* 顶部标题栏 —— 必须使用 DetailPageHeader 组件 */}
  <DetailPageHeader
    title="頁面標題"
    meta={<>{model.code} · {model.name}</>}
    onBack={onBack}
    onEdit={() => navigate(`/edit?id=${id}`)}  // 可选
    menuKey="menu-key"                        // 可选，权限门控
  />

  {/* 信息卡片（可多个）—— 定价页卡片样式 */}
  <div style={cardStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon style={{ fontSize: 14, color: '#1890ff' }} />
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>卡片标题</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
    <Descriptions column={3} size="middle" bordered>
      {/* 字段... */}
    </Descriptions>
  </div>

  {/* ⚠️ 无底部操作栏（详情页规范） */}
</div>
```

**卡片样式常量**（对齐定价页规范）：
```ts
const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}
```

**卡片标题样式**（图标方块 + 文字 + 分隔线）：
- 图标方块：28x28, borderRadius: 6, 淡色背景, 图标 14px
- 文字：15px, fontWeight: 600, color: #262626
- 分隔线：flex: 1, height: 1, background: #f0f0f0

### D.4 操作记录模块（跨模块强制统一）

**所有详情页底部必须**添加「操作记录」模块：

- **仅展示**：最后更新人 + 最后更新时间（**禁止**完整操作日志表格）
- 白色卡片样式：`border: 1px solid #e8eaed, borderRadius: 8`
- 图标：`EditOutlined`
- 字段用 grid 布局
- 必须用**专用 state 变量**存 `updatedBy / updatedAt`，禁止直接内嵌表单

已应用页面：`AssetDetail`、`AlgorithmAdd`、`WaterfallAdd`、`PricingAdd`、采购申请详情等。

### D.5 OA 工作流审批节点懒加载

- **draft 状态**：右侧审批节点模块只展示「流程创建」
- **pending 状态**：只展示下一个待审批节点；当前节点审完才请求下一节点审批人
- 时间轴渲染：只显示「流程创建」+ 已完成节点 + 当前待审节点，**不显示未来节点**

### D.6 采购申请详情页专项

- 待提交（draft）状态必须支持删除操作
- 流程状态必须显示中文（`draft` → `待提交`）
- 采购明细表格必须完整显示：资产分类、品牌、参数信息、资产名称、数量、备注
- 申请部门字段必须在审批详情页中正确显示

### D.7 登录页规范

- 视频背景 + 渐变降级色 `linear-gradient(135deg, #667eea, #764ba2, #f093fb, #f5576c, #4facfe)`
- 降级背景动画：`gradientShift 15s ease infinite`，`background-size: 400% 400%`
- 视频遮罩层：渐变半透明 `rgba(255,248,225,0.15~0.25)`
- 登录卡片：毛玻璃效果 `backdrop-filter: blur(20px) saturate(180%)`
  - 宽度 `400px`，圆角 `18px`，padding `36px 34px 30px`
  - 背景 `rgba(255,255,255,0.15)`，边框 `1px solid rgba(255,255,255,0.3)`
  - 阴影 `0 8px 32px rgba(0,0,0,0.2)`
- 输入框：半透明白底 `rgba(255,255,255,0.15)` + 白色边框 `rgba(255,255,255,0.3)`
  - 圆角 `10px`，高 `44px`
  - focus：橙色边框 `#F39C12` + 橙色阴影 `0 0 0 3px rgba(243,156,18,0.2)`
  - placeholder：`rgba(255,255,255,0.6)`
- 登录按钮：橙色渐变 `linear-gradient(135deg, #E8720C, #F39C12)`
  - 高 `46px`，圆角 `10px`，字号 `16px`，字重 `600`
  - 阴影 `0 4px 15px rgba(232,114,12,0.35)`
  - hover：上浮 `translateY(-2px)` + 阴影加深
  - disabled：灰色半透明 `rgba(200,200,200,0.6)`，无动效
- 右上角三角切换：QR/密码模式切换动画
  - 尺寸 `70x70px`，`clip-path` 三角形
  - 渐变背景 `linear-gradient(135deg, #00f0ff, #b060ff)`
  - hover：渐变变色 + 图标 `scale(1.1)`
- 社交登录按钮：圆形 `50%`，图标 `48x48px`
  - 微信：绿色渐变 `#07C160→#06AD56`
  - 支付宝：蓝色渐变 `#1677FF→#0958D9`
  - hover：上浮 `translateY(-3px)` + 图标 `scale(1.08)` + 阴影加深
- 验证码组件：
  - 复选框：圆角 `10px`，边框 `rgba(176,96,255,0.2)`
  - hover：边框变 `#00f0ff` + 背景 `rgba(0,240,255,0.05)`
  - 已验证：边框 `#00ff88` + 背景 `rgba(0,255,136,0.08)`
  - 动物选择面板：滑入动画 `captchaSlideIn 0.3s`
  - 选项 hover：上浮 `translateY(-2px)` + 边框 `#00f0ff`
  - 正确/错误：绿色 `#00ff88` / 红色 `#ff4060` 边框 + 背景
- 返回账号按钮：hover 变色 `#00f0ff` + 背景 `rgba(0,240,255,0.05)`
- 品牌文字：`text-shadow: 0 0 20px rgba(232,114,12,0.8)`，霓虹效果

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

**所有列表页必须**使用 `useColumnConfig(pageKey, columnMeta, defaultConfig)`，且**锁定只能是可以解除的默认值，不能是硬限制**：

```tsx
const { configComponent, applyConfig } = useColumnConfig('page-key', columnMeta, [
  { key: 'flowNo', visible: true, locked: 'head' as const },
  { key: 'action', visible: true, locked: 'tail' as const },
])
```

- `pageKey`：页面唯一标识（kebab-case），用于 localStorage 存储 key = `table-config-${pageKey}`
- 三区外观（頭部鎖定／非鎖定／尾部鎖定）**保留**；`locked: 'head'/'tail'` 只是默认贴哪一侧，不是禁止排序：
  锁定字段拖进非锁定区即 `locked = null`，每行另有 ×「解除鎖定」按钮
- **非锁定区容器本身必须是 drop 目标**：空白处（及本区无字段时）可放置，拖到末尾即追加到自由区最后，
  拖拽经过时给容器级反馈（`.tcc-zone-drop-end`）；只给字段行做落点等于实际不可用
- 子项与区域容器的 dragOver/drop 必须 `stopPropagation`，避免同一次 drop 被处理两次
- 兜底：可见列少于 2 列时回退默认配置，避免用户把列表清空后无法恢复
- 自动同步列变更：新增列插入到第一个 `locked:'tail'` 之前，删除列自动清理
- 标题跟随最新 i18n（语言切换时不丢顺序）
- `configComponent` 渲染在操作区右侧
- 参考实现：`src/pages/TrafficSandbox/MerchantScoreInsight.tsx`；自检：`frontend/packages/ui/src/components/TableColumnConfig.test.tsx`

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
- 分组表头：居中对齐，字重 `600`

### E.6 React Flow 流程图规范

- 5 种自定义节点类型：
  - `terminal`：开始/结束，胶囊形（r24），绿色/红色渐变
  - `stage`：阶段标题，色带形（左侧 6px 粗边框）
  - `process`：流程步骤，白底矩形（r6），彩色边框 + 阴影
  - `decision`：决策判断，渐变背景 + 右上角「判断」角标
  - `system`：系统处理，紫色虚线边框 + ⚙️ 图标
- 连线：`strokeWidth: 2`，阶段间动画连线（`animated: true`）+ 标签文字
- 编辑模式：左侧节点面板拖拽添加、双击编辑、Delete 键删除
- 位置持久化：localStorage 存储，支持保存/重置

### E.7 列表页完整结构模板

```tsx
<div className="content-area">
  {/* 1. 错误/提示横幅（可选，仅加载失败等全局提示） */}

  {/* 2. 搜索区 */}
  <div className="search-section">
    <Form layout="inline">
      {/* 搜索字段... */}
      <Form.Item>
        <div className="search-actions">
          <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
          <Button icon={<ReloadOutlined />}>重置</Button>
        </div>
      </Form.Item>
    </Form>
  </div>

  {/* 3. 统计卡片（可选）—— 必须在搜索区下方，见 §E.8 */}
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
    {/* <StatCard ... /> */}
  </div>

  {/* 4. 操作区 */}
  <div className="action-section">
    <div className="action-section-left">
      {/* 導出、批量操作等 */}
    </div>
    <div className="action-section-right">
      <Button type="primary" icon={<PlusOutlined />}>新增</Button>
      {configComponent}  {/* 字段設置 */}
    </div>
  </div>

  {/* 5. 表格 */}
  <Table ... />
</div>
```

**关键约束**：
- 搜索区不用 Card 包裹，用 `.search-section`
- 表格不用 Card 包裹
- 操作列按钮**禁止使用图标**，仅文字
- 操作列按钮间距用 `action-split` 分隔符 `|`
- 字段设置用 `useColumnConfig` hook

### E.8 统计卡片与搜索区的顺序（强制） ⚠️

> 适用范围：**所有带搜索/筛选区的列表菜单**。详情页、纯看板页不适用本条。
> 参考实现：`src/pages/Consumable/Report/index.tsx`（消耗統計）。

**强制顺序**：`搜索区 .search-section` → `统计卡片` → `操作区 .action-section` → `Table`

```tsx
<div className="search-section">{/* 查询条件 */}</div>
<div className="...统计卡片容器...">{/* 指标卡 */}</div>   // ✅ 统计卡片在搜索区下方
<div className="action-section">{/* 导出 / 新增 */}</div>
<Table ... />
```

**为什么必须如此**：
1. **数据一致性**：统计卡片展示的必须是当前搜索条件过滤后的口径。卡片放搜索区上方时，用户先看到「全量数字」、改条件后数字才变，容易误读为未过滤的结果。
2. **操作动线**：用户进入列表页的第一动作是设定条件，搜索区置顶符合「先筛选、后看数、再看明细」的自上而下阅读顺序。
3. **视觉稳定**：条件变更后卡片数值跳动发生在视线下方，不会顶掉用户刚定位到的搜索表单。

**约束细则**：
- 统计卡片与搜索区之间**不加**额外分隔卡片/背景容器，靠容器 `marginBottom: 16` 留白
- 卡片的统计口径必须跟随搜索条件：`useEffect` / 查询函数需把当前 filters 一并传给统计接口，**禁止**卡片单独发一次不带条件的请求
- 卡片组切换条件时需重新触发计数动画，沿用 §B.7 的 `key={口径快照}` 方案
- **加载失败横幅**（`<Alert type="error">`）与**页面说明横幅**（`<Alert type="info">`）仍置于搜索区上方，它们不属于统计卡片
- 若列表页用 Tab 切换不同口径，Tab 属于筛选的一部分，应放在搜索区内或紧贴搜索区，统计卡片仍在其后

**禁止**：
- ❌ 统计卡片渲染在 `.search-section` 之前
- ❌ 统计卡片渲染在 `.action-section` 与 `Table` 之间（打断操作区与表格的连贯性）

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

> 路径已按 2026-11-03 实测校正：共享层已拆为 workspace 包，`src/styles/` 与 `src/components/` 均已不存在。

| 文件 | 职责 |
|------|------|
| `frontend/packages/ui/src/styles/theme.css` | **主题令牌层**：`:root`（浅色）+ `html[data-theme='dark']`（深色）+ `@media print`（锁浅色）；值由 `TOKEN_VALUES` 生成 |
| `frontend/packages/ui/src/styles/global.css` | 全局入口，`@import theme.css` 后 `@import components.css`（令牌必须先于消费者加载），reset、滚动条、字体、全局 keyframes |
| `frontend/packages/ui/src/styles/components.css` | 全项目共享样式中心（~2400 行）：侧边栏、Header、详情页头部、搜索区、操作区、按钮语义、弹窗底部、表单页脚 |
| `src/App.css` | 应用布局容器、页面淡入、空态/加载态美化 |
| `frontend/packages/ui/src/components/*.css` | 复杂组件自有样式（MenuTabs、PetMascot、TableColumnConfig、PRDEditor、PortalTopBar、SystemSwitcher 等） |
| `src/pages/**/*.css` | 主站页面级样式（Home、Portal、OACenter、NotificationConfig、DocCenter 等 29 个文件） |
| `frontend/apps/{eam,hr,rdm}/src/pages/**/*.css` | 子系统页面级样式（9 个文件） |
| `scripts/lib/theme-token-map.mjs` | 令牌取值、色值→令牌映射表、排除清单的**单一真源**（codemod 与门禁共用，禁止各自内嵌副本） |

### K.2 技术约束

- **无** SCSS / Less / PostCSS / Tailwind / CSS-in-JS / styled-components（这五项仍禁止）
- **色值统一走语义令牌**（`var(--*)`）：令牌定义在 `@/styles/theme.css`，分三层——
  primitive（`--gray-*` / `--orange-*`，仅 theme.css 内部可用）、semantic（业务代码**只用这层**）、
  component（`--sidebar-*` 等，仅壳层组件 CSS 可用）。**禁止在 CSS 与 JSX 新增裸色值**。
  > 2026-11-03 修订：原条文「**无** CSS Variables / Design Token 文件」已作废。深色模式需要一套能在运行时切换、
  > 且能被 22718 行 CSS 与 9987 处内联 style 共同消费的色值真源；双份 CSS 必然漂移，纯 antd `darkAlgorithm`
  > 又盖不住内联 style（会出现白斑）。例外登记见 §M.1；先例依据：`PetMascot.css` 早已有 70 处 `--*` 动效参数变量。
- 纯原生 CSS + **BEM 风格类名**（`block__element--modifier`）
- 覆盖 antd 默认样式用**直接选择器**（如 `.sidebar-menu .ant-menu-item`）；开启 `cssVar` 后需留意优先级变化，
  改动壳层样式时必须双主题各看一遍
- 主题 token 通过 `ConfigProvider`（`cssVar: true`）在 **`src/bootstrap.tsx`** 注入（非 `main.tsx`），
  值取自 `packages/ui/src/theme/themeTokens.ts`，与 `theme.css` 构成双源，
  由 `themeTokens.test.ts` 与 `check:theme-tokens` 钉住一致性。
  ⚠️ antd 的 token 会经 derivative 算法派生，**禁止向 token 传 `var(--x)` 字符串**（会让派生色全错），必须传真实色值。
- 入口唯一：`src/bootstrap.tsx` 的 `mountApp()` 被根 `src/main.tsx` 与 `frontend/apps/{eam,hr,rdm}/src/main.tsx` 共同复用，
  因此主题/全局 Provider 只改这一处即对主站与三个子系统同时生效；禁止在子应用重复装配
- **不用 `@media` 做布局响应式**（靠 Flex / Grid 自适应）；但 `prefers-color-scheme`、`prefers-reduced-motion`、`print`
  三类**非布局**媒体查询允许且必须保留（主题跟随、动效降级、打印锁浅色）

### K.3 组件级样式隔离

复杂组件必须独立 CSS 文件，禁止污染全局：`MenuTabs.css`、`PetMascot.css`、`TableColumnConfig.css`、`PRDEditor.css`。

### K.4 卡片组件与首页工作台规范

- 内容区 `.content-area`：白底，圆角 `8px`，padding `20px 24px`
- 首页区块 `.home-section`：白底，圆角 `12px`，padding `20px 24px`，阴影 `0 2px 8px rgba(0,0,0,0.04)`
- 统计卡片：圆角 `10px`，彩色背景（蓝 `#E3F2FD`、绿 `#E8F5E9`、橙 `#FFF3E0`、红 `#FFEBEE`）
- 统计数字：`28px` 粗体，对应色系的深色文字
- 首页欢迎横幅：渐变背景 `linear-gradient(135deg, #E8720C, #F39C12)`，圆角 `12px`，padding `28px 32px`
- 常用菜单卡片：4 列 Grid，hover 上浮 `translateY(-2px)` + 蓝色阴影
- 收藏卡片 hover 显示删除按钮（`opacity: 0 → 1`）
- 待办事项：灰底卡片 `#FAFAFA`，hover 变深 `#F0F0F0`
- 通知项：未读左边框 `3px solid #FFA000` + 浅黄背景 `#FFF8E1`
- 报表/统计卡片：圆角 `12px`，padding `20px`，阴影 `0 2px 8px rgba(0,0,0,0.06)`
  - 卡片标题区：底部虚线分隔 `1px dashed rgba(0,0,0,0.08)`
  - 余额网格：`repeat(2, 1fr)`，gap `16px`
  - 统计行网格：`repeat(4, 1fr)`，gap `16px`
  - 指标数值：`20px` 粗体，子指标 `16px` 半粗体
  - 欠款统计卡片：渐变背景（红 `#FFEBEE→#FFCDD2`、绿 `#E8F5E9→#C8E6C9`、紫 `#F3E5F5→#E1BEE7`）
  - 欠款卡片 hover：`translateY(-2px)` + 阴影加深
  - **列表页统计卡片的位置**：必须位于 `.search-section` 之后、`.action-section` 之前（§E.8）；卡片视觉样式以 §B.7 动效统计卡标准为准，本条旧色板仅适用于首页工作台区块

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

**界面设计前速查（每次新增/修改界面前必对）**：
1. ☐ 确定页面类型（列表 / 详情 / 表单）
2. ☐ 查閱本章对应类型的标准结构（§C.6 / §D.3 / §E.7）
3. ☐ 详情页：使用 `DetailPageHeader` 组件（非 CSS 类），含右侧编辑按钮（onEdit prop）
4. ☐ 表单页：顶部有**橙色渐变顶条**（3px，`headerGradientShift` 动画），容器 borderRadius: 12
5. ☐ 标题颜色：详情页和表单页均为 `#1890ff`（蓝色）
6. ☐ 卡片标题：图标方块(28x28) + 文字 + 分隔线模式
7. ☐ 底部操作栏：详情页无，表单页有「取消+保存」
8. ☐ 新增/编辑/详情使用**独立页面**，不使用弹窗（Modal）
9.  参考同类型的已有实现页面

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
- [ ] 头部用 `DetailPageHeader` 组件（非 `.detail-header` CSS 类）？
- [ ] 顶部**没有**操作按钮？
- [ ] 内容卡片用 `.detail-card` 类？
- [ ] 底部有「操作记录」模块（仅最后更新人+最后更新时间，EditOutlined 图标）？
- [ ] 用专用 state 存 `updatedBy / updatedAt`？
- [ ] OA 工作流详情页遵循审批节点懒加载规则？

**列表页**：
- [ ] 搜索区 `.search-section` 4 列 grid？
- [ ] 统计卡片位于搜索区**下方**、操作区**上方**（§E.8，禁止置于搜索区上方）？
- [ ] 统计卡片口径跟随搜索条件（条件变更会重新取数并重跑计数动画）？
- [ ] 所有输入控件 `width: 100%`？
- [ ] 操作区 `.action-section` 左右分组正确（导出/批量在左，新增/列配置在右）？
- [ ] 使用 `useColumnConfig(pageKey, columnMeta, defaultConfig)`？
- [ ] 锁定字段能拖进非锁定区（容器空白处也是落点）或用 × 解除，而不是只能待在锁定区？
- [ ] `locked: 'head'/'tail'` 字段正确（如 flowNo 锁头、action 锁尾）？
- [ ] 分页 `showSizeChanger + showQuickJumper + showTotal` 三件套齐全？
- [ ] `showTotal` 插值变量用 `count`（**不是** `total`）？
- [ ] pageSize 变化时重置到第 1 页？
- [ ] 表格 `scroll={{ x: ... }}` 配置正确？

**按钮**：
- [ ] 查询/新增 = 主色实心？
- [ ] 表格内一切可点元素（含展开入口/+N）都用 `type="link"`，色彩与操作列一致，页面 CSS 未手写其颜色？
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
- [ ] 新增颜色是否**只用 `var(--*)` 语义令牌**（无裸色值）？
- [ ] 新令牌是否已在 `TOKEN_VALUES` 登记浅色值 + 深色值 + **实测**对比度，并补到 §A.1？
- [ ] 是否只引用 semantic / component 层令牌（**没有**用 `--gray-*` / `--orange-*` primitive）？
- [ ] 深色下卡片层次是否靠 `--card-outline` 描边而非仅靠阴影？
- [ ] 是否**没有**在业务代码里写 `if (isDark)` 颜色分支？
- [ ] 类名 BEM 风格？
- [ ] 复杂组件独立 CSS 文件？
- [ ] **没有**用 `@media` 做**布局**响应式（非布局的 `prefers-color-scheme` / `print` 除外）？

### L.3 开发后（自检阶段）

- [ ] `npm run typecheck` 通过？
- [ ] `npm run lint` 通过（无新增 error）？
- [ ] `npm run test:run` 通过（如涉测试文件）？
- [ ] `npm run check:theme-tokens` 通过（裸色值棘轮未上升）？
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

### M.1 已登记例外

| # | 例外事项 | 原因 | 风险 | 补偿措施 | 负责人 | 到期 |
|---|---|---|---|---|---|---|
| E-01 | 引入 CSS Variables 作为主题令牌层（原 §K.2 明文「无 CSS Variables」、禁止清单亦列明） | 深浅色切换需要一套可运行时切换、且能被 22718 行 CSS 与 9987 处内联 style 共同消费的色值真源；复制双份 CSS 必然漂移，纯 antd `darkAlgorithm` 盖不住内联 style（会出现白斑） | ①双源（CSS ↔ antd token）漂移；②codemod 误改业务语义色；③令牌层被滥用为「随手加变量」 | ①`TOKEN_VALUES` 单一真源 + `themeTokens.test.ts` + `check:theme-tokens` 三重校验；②白名单映射（**严格等值**判据由单测自动守）+ dry-run + 排除清单 + 分批 PR；③新令牌必须登记浅色值/深色值/实测对比度，primitive 层禁止业务引用并由门禁扫描 | `fengsong7889` | Phase 4 长尾收敛完成（棘轮归零）时关闭；若棘轮连续两个迭代不降，重新评审 |
| E-02 | 深色下静态边框对比度 1.25~2.39:1，低于 WCAG 1.4.11 的 3:1 | 要达 3:1 需把边框提到约 `#6E6E6E`，会让深色界面布满亮线、噪声压过内容；antd 官方 `darkAlgorithm` 的 `colorBorder` 同为 `#424242`，属业界通行取舍 | 输入控件边界在深色下辨识困难 | ①分隔线属装饰性，1.4.11 本身豁免；②输入控件改用更亮的 `--border-input`；③控件底色与容器底色错开一档；④focus 环用品牌橙（5.37:1）且加粗到 2px | `fengsong7889` | Phase 3 视觉核对时复评 |
| E-03 | 存量裸色值（CSS 3037 处 + 内联 9042 处 + 黑色 rgba 阴影 586 处）未按新规则立即清理 | 一次性改完会覆盖全仓，无法 review、与所有并行分支冲突 | 深色下未清理区域出现白底/黑字斑块 | 棘轮基线 `scripts/theme-token-baseline.json` 只降不升；按方案 §5.3 分 6 批推进；Phase 1 用 feature flag 关闭入口，避免半成品深色暴露给用户 | `fengsong7889` | Phase 4 归零 |
| E-04 | 浅色现状 4 项对比度债务：`--text-3` 3.36:1、品牌橙作文字 3.07:1、主按钮白字 3.07:1、`--text-4` 1.84:1 | 存量既有，非本次改造引入；其中 `--text-3` 全站 347 处依赖 | 被误认为主题改造引入的回归；浅色下弱文字可读性偏低 | 已在方案 §4.5 逐项登记为「独立议题」，禁止夹带进主题 PR；若要修必须先重定义 §N.4 的「≥3.4:1」口径（与 WCAG AA 正文 4.5:1 不一致） | `fengsong7889` | 单独立项 |

> 例外登记口径：**不在入库文件里写未关闭的安全缺口实况**（AGENTS.md「凭据泄露处置口径」同理），
> 本表只登记已评估、已给出补偿措施的**规范例外**，不包含任何凭据/密钥/未修复漏洞信息。

---

## 9.1 前端 UI 禁止清单（补充）

- 禁止在表单页头部右侧放保存/提交按钮（统一放页面底部 `.form-footer`）。
- 禁止使用 antd `Card title=... headStyle=...` 彩色标题头（表单页模块分组必须用白色 div 卡片）。
- 禁止在 `layout="vertical"` 的 Form 中给 Form.Item 使用 `labelCol={{ flex: 'XXXpx' }}`。
- 禁止详情页顶部放操作按钮（只读模式）。
- 禁止详情页底部显示完整操作日志表格（只允许「最后更新人 + 最后更新时间」）。
- 禁止列表页不用 `useColumnConfig` 自行实现列配置。
- 禁止把 `locked` 当硬限制：锁定字段必须能拖进非锁定区（非锁定区容器空白处需为 drop 目标）或用 × 解除锁定；
  也禁止为了放开排序而改掉三区外观或改成每行固定端下拉（外观变更需产品确认）。
- 禁止列表页把统计卡片放在搜索区 `.search-section` 上方（必须：搜索区 → 统计卡片 → 操作区 → 表格，见 §E.8）。
- 禁止分页 `showTotal` 插值变量用 `total`（必须用 `count`）。
- 禁止 pageSize 变化时不重置到第 1 页。
- 禁止部门选择用 Input / 普通 Select（必须用 TreeSelect）。
- 禁止提交申请类按钮不用 `Modal.confirm` + `custom-confirm-modal` 二次确认。
- 禁止先弹确认框后做表单校验（顺序必须是：校验 → 弹框 → API）。
- 禁止在 catch 里重复 `message.error`（`request.ts` 已统一弹，双弹会造成困扰）。
- 禁止用 `alert()` / `window.confirm()`。
- 禁止硬编码「暂无数据」等空态文案（必须用 `<Empty description={t('xxx.empty')} />`）。
- 禁止新增 i18n key 只加一个语言文件（必须 `zh-TW.json` + `en.json` 同步）。
- 禁止引入 SCSS / Less / Tailwind / CSS-in-JS / styled-components。
  > 2026-11-03：原本列在本条的「CSS Variables」已移除——它现为主题令牌层的必需设施（例外登记见 §M.1 E-01）。
- 禁止用 `@media` 做**布局**响应式断点（靠 Flex/Grid 自适应）；`prefers-color-scheme` / `prefers-reduced-motion` / `print` 三类非布局查询不在此限。
- 禁止在组件内重复定义全局 keyframes（必须复用 `global.css` 已注册的）。
- 禁止随意引入 §A.1 之外的新色值。
- **禁止在 CSS 与 JSX 新增裸色值**（`color: '#262626'`、`background: #fff`、`boxShadow: '0 2px 8px rgba(0,0,0,0.06)'`）；
  必须写 `var(--text-1)` / `var(--surface-2)` / `var(--shadow-1)`。新语义需先在 `TOKEN_VALUES` 登记再使用。
- **禁止引用 primitive 层令牌**（`--gray-*` / `--orange-*`）：它们只允许 `theme.css` 内部使用，业务代码只用 semantic / component 层。
- **禁止在业务代码里用 `if (isDark)` / 三元式决定颜色**：颜色差异一律由令牌承担，否则两套颜色会随页面数量线性膨胀且无法审计。
  仅三处例外：`@ant-design/charts` 的 `theme` 配置、leaflet 瓦片降亮、`html-to-image` 导出锁浅色。
- **禁止在深色下仅靠阴影表达卡片层次**（`rgba(0,0,0,x)` 在深底几乎不可见），必须同时应用 `--card-outline` 描边。
- **禁止手工在 4 个 `index.html` 各自维护主题防闪烁脚本**：必须走 vite `transformIndexHtml` 插件 +
  `scripts/lib/theme-boot-script.mjs` 单一真源（手工四份必然漂移，后果是刷新白闪）。
- **禁止向 antd `ConfigProvider` 的 token 传 `var(--x)` 字符串**：token 会经 derivative 算法派生，传变量会让派生色全错；必须传真实色值。
- **禁止在子应用（`frontend/apps/*`）重复装配主题或 Provider**：`mountApp()` 已是唯一装配点，重复装配会造成两套主题状态不同步。
- **禁止将令牌取值写进规则/方案文档当作真源**：文档只写语义与口径，取值一律指向 `TOKEN_VALUES`（多源必漂移）。
- 禁止按钮不用语义化 class（`.btn-export` / `.btn-import` / `.ant-btn-dangerous`）。
- 禁止给表格内可点元素另套配色：必须沿用操作列 `.ant-table .ant-btn-link` 的色彩语言
  （静态 `#E8720C`、hover `#F59432` + 浅橙底），页面 CSS 不得重写其文字色/背景；允许加描边，
  但描边只能取同一主色的透明度阶且不得引入新色相（见 §B.1.1）。
- 禁止用内联样式覆盖 `.form-footer` / `.detail-header` / `.detail-card` 全局类。
- 禁止新增/编辑/详情使用 Modal 弹窗（必须使用独立页面，路由跳转 `/add`、`/edit?id=xxx`、`/detail?id=xxx`）。
  - 仅以下简单操作允许使用 Modal：确认删除/批量操作等二次确认弹窗（`Modal.confirm`）、简单设置面板（如列配置 `ColumnConfig`）、纯展示型信息提示（`Modal.info` / `Modal.success`）。
  - 原因：独立页面信息承载力更强、URL 可分享可刷新、支持浏览器前进后退、复杂表单空间充裕。
- 禁止代码注释用繁体中文或英文（必须简体中文）。

---

## N. 门户与工作台（列表/详情/表单之外的第二类页面）

> 本套规范原有 §C/§D/§E 只覆盖新增编辑/详情/列表三类，门户、工作台、看板没有对应章节，
> 于是「一卡一色」「16 张卡 8 种节拍」这类决策只能靠手感，没有尺子。
> 本章为定版口径，来源：《企业门户界面设计评审 2026-10-24》。

### N.1 版式与首屏目标

| 项 | 强制值 |
|---|---|
| 卡片墙栅格 | `repeat(auto-fill, minmax(min(280px, 100%), 1fr))`，间距 `16px` |
| 卡片封面比例 | `320 / 140`（封面不高于卡高 50%） |
| 卡片正文 | `padding: 14px 18px 16px`；简介 `min-height: 36px; line-height: 1.6` |
| 首屏目标 | 保持业务域分组时：**1600×1000 下首屏可见 ≥ 6 张卡**（实测：4 张完整 + 2 张部分）；
「10 张」只在统一卡片墙（不分业务域）前提下成立，经产品确认**暂不追求**，不得为此取消分组 |
| 统计卡叠横幅 | 允许上提，但必须左右各内缩 `24px`，避免两层圆角打架 |
| 分组标题行 | 「图标 + 标题 + 计数」为唯一视觉单元；说明文字下沉到第二行；装饰分隔线 `max-width: 24px` |
| 指标卡口径 | 统一为「占比 + 绝对数」（如 `16 / 16`），不得四格混用个数/比率/总数三种量纲 |

### N.2 插画元素预算与文案

- **一卡一动作**：每张插画只讲一个动词（提交/对账/打卡/发布）；出现第二个动作就拆成 `variantScenes`。
- **元素预算 4 组**：主体 1 + 辅助 2 + 结果标记 1。超 4 组开始互相遮挡。
- **三段式构图**：左（输入）→ 中（处理）→ 右（结果），主体落在 `x≈120/320`；左右各留 ≥ 24px 安全区。
- **留白 ≥ 25%**：密度不够就放大主体，不要加零件。
- **文字 ≤ 2 处且必须走 i18n**：只允许「结果标签」与「数值」两类文字，一律用 `ArtworkText`（走 `portal.artwork.*`）；
  禁止硬编码 `<text>` 英文短语。数学公式属装饰记号，可保留但**不得承载业务信息、不得与其它构件叠压**。
- **不可点的东西不要长成按钮**：插画内的标签用「主色 10% 色块」或无底板文字，禁止白底 + 圆角 + 细边框胶囊。

### N.3 动效节拍

- **主周期统一 6s**，仅允许 1~2 个场景用 12s 慢镜头（当前仅 `rdm`）。
- **分镜四段**：0–20% 输入入场 → 20–55% 处理发生（大动作：≥ 8px 位移或 1.06 倍缩放）→
  55–80% 结果落地（品牌橙对勾，全片唯一橙色）→ 80–100% 静置呼吸。
- **播放策略**：卡片只在悬停时播放（同一时刻仅一张在动，因此不需要错峰 delay）；
  离屏暂停、`visibilitychange` 后台暂停、`prefers-reduced-motion` 全静态降级，这三条不得删。
- **keyframes 归属**：页面级 keyframes 留在页面 CSS（如 `src/pages/Portal/index.css`），
  但不得在组件内重复定义，也不得新增与 `global.css` 同名/同义的动画。

### N.4 「我的常用」专项（评审 F1–F7）

| 项 | 强制值 |
|---|---|
| 星标可见性 | **常显**（`opacity:1`，`#BFBFBF`），悬停/聚焦升到品牌橙 `#E8720C`；禁止用 `opacity:0` 仅靠 hover 显现 |
| 触屏 | 星标常显即天然覆盖触屏；若未来改回 hover 显隐，**必须**补 `@media (hover:none)` 兜底 |
| 提示文案 | `12px #8C8C8C`（对比度 ≥ 3.4:1），前面带 `☆` 图标；禁止 `#BFBFBF`（1.84:1） |
| 空态 | 无收藏且无最近使用时**照常渲染模块**，给虚线占位「還沒有常用系統 · 在卡片右上角點 ☆ 添加」 |
| 计数口径 | 必须等于**实际渲染条目数**（收藏 + 最近使用），不得只取收藏数 |
| 双轨样式 | 收藏 = 业务域淡色**实底** + ×（可删）；最近使用 = **无底色 + 1px 描边**（只读）；两排间距 `8px` |
| 删除交互 | × 仅 hover/聚焦显现；toast 必须带「撤銷」按钮，`duration: 5`，撤销后恢复本地与云端 |
| 限高 | 收藏超过 4 个时单行限高 `max-height:38px` + 「+N 展開」按钮，禁止无限 `flex-wrap` 把卡片墙挤下去 |
| 排序 | 最近添加在前（`[...favorites].reverse()`） |
| 颜色语义 | 收藏相关用品牌橙 `#E8720C` / 底 `#FFF7F0`；**禁止用警告色 `#FA8C16`/`#FAAD14`** 表达收藏 |
| 色点 | 业务域色点保留，但必须有 `title` 显示业务域名，让编码可学习 |

### N.5 检查清单（门户/工作台页交付前）

- [ ] 首屏可见卡片数达标（1600×1000 ≥ 10 张）？
- [ ] 统计卡左右内缩 24px，横幅圆角完整？
- [ ] 指标卡四格口径统一（占比 + 绝对数）？
- [ ] 新增 scene 已在 §A.1.1 登记且无重色？
- [ ] 插画内文案全部走 `portal.artwork.*`，无硬编码英文短语？
- [ ] 动效周期统一 6s，降级三条保留？
- [ ] 失败态：页面级 `Empty + Retry`，Tab 计数显示 `—`，不重复弹 toast？
- [ ] APP/外部入口页签的 9 个 `portal.app*` key 在 5 个语言包齐全？
- [ ] 「我的常用」星标常显、空态占位、计数口径与实际条目一致？

