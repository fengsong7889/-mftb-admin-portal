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
基准来源：`.qoder/rules/form-page-style.md`、`src/styles/components.css`、`src/styles/global.css`、`src/hooks/useColumnConfig.tsx`、`src/api/request.ts`。

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
| 列显隐/顺序配置 | `useColumnConfig(pageKey, columnMeta, defaultConfig)` | 自行实现 |
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
- [ ] **没有**用 `@media` 响应式断点？

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

## 9.1 前端 UI 禁止清单（补充）

- 禁止在表单页头部右侧放保存/提交按钮（统一放页面底部 `.form-footer`）。
- 禁止使用 antd `Card title=... headStyle=...` 彩色标题头（表单页模块分组必须用白色 div 卡片）。
- 禁止在 `layout="vertical"` 的 Form 中给 Form.Item 使用 `labelCol={{ flex: 'XXXpx' }}`。
- 禁止详情页顶部放操作按钮（只读模式）。
- 禁止详情页底部显示完整操作日志表格（只允许「最后更新人 + 最后更新时间」）。
- 禁止列表页不用 `useColumnConfig` 自行实现列配置。
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
- 禁止引入 SCSS / Less / Tailwind / CSS-in-JS / styled-components / CSS Variables。
- 禁止用 `@media` 响应式断点（靠 Flex/Grid 自适应）。
- 禁止在组件内重复定义全局 keyframes（必须复用 `global.css` 已注册的）。
- 禁止随意引入 §A.1 之外的新色值。
- 禁止按钮不用语义化 class（`.btn-export` / `.btn-import` / `.ant-btn-dangerous`）。
- 禁止用内联样式覆盖 `.form-footer` / `.detail-header` / `.detail-card` 全局类。
- 禁止新增/编辑/详情使用 Modal 弹窗（必须使用独立页面，路由跳转 `/add`、`/edit?id=xxx`、`/detail?id=xxx`）。
  - 仅以下简单操作允许使用 Modal：确认删除/批量操作等二次确认弹窗（`Modal.confirm`）、简单设置面板（如列配置 `ColumnConfig`）、纯展示型信息提示（`Modal.info` / `Modal.success`）。
  - 原因：独立页面信息承载力更强、URL 可分享可刷新、支持浏览器前进后退、复杂表单空间充裕。
- 禁止代码注释用繁体中文或英文（必须简体中文）。
