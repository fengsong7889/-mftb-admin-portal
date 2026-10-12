---
trigger: model_decision
description: 新增/编辑/详情类表单页面的全局统一风格规范（页面头部、模块卡片、行内标签、底部操作按钮）。凡新建或修改此类页面（如新增定价、新增算法、新增推广赠送等 XxxAdd / XxxEdit 页面）时必须遵循本规则。
---

# 全局新增/编辑界面风格规范

> 基准页面：`src/pages/Recommend/WaterfallAdd/index.tsx`（销售定价 → 无敌星星 → 新增定价）。
> 所有新增/编辑/详情表单页必须与该页面保持一致的视觉与结构，禁止使用 antd Card 彩色标题头等旧样式。

## 1. 页面整体结构（自上而下）

```
<div className="content-area">
  1. 页面头部（白色圆角卡片 + 橙色渐变动画条 + 返回按钮 + 标题）
  2. <Form layout="vertical"> 包裹的若干模块卡片（div 卡片，非 antd Card）
  3. 底部操作按钮 <div className="form-footer">（取消 + 保存/提交）
</div>
```

## 2. 页面头部模板

```tsx
<div style={{
  position: 'relative', background: '#fff', marginBottom: 16,
  borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
}}>
  <div style={{
    height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
    backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
  }} />
  <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
        style={{
          backgroundColor: '#E8720C', borderColor: '#E8720C',
          borderRadius: 8, height: 36, padding: '0 16px',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>返回</Button>
      <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>页面标题</h2>
    </div>
  </div>
</div>
```

- 标题按模式切换：`{isDetailMode ? 'XX詳情' : isEditMode ? '編輯XX' : '新增XX'}`。
- **头部右侧不放保存/提交按钮**，操作按钮统一放页面底部。

## 3. 模块卡片（核心规则）

每个功能分组用**白色 div 卡片**，禁止使用 `<Card title=... headStyle=...>`：

```tsx
<div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
  {/* 标题行 */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
    <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />
    </div>
    <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>模块标题</span>
    <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>可选标签</Tag>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    <span style={{ fontSize: 12, color: '#8c8c8c' }}>可选右侧说明文字</span>
  </div>
  {/* 内容区 */}
</div>
```

标题行组成：28×28 圆角 6 彩色色块图标 + 15px/600/#262626 标题 + 可选 Tag + 右侧延伸 1px `#f0f0f0` 分隔线 + 可选灰字说明/操作按钮。

### 图标色块配色约定

| 语义 | 底色 | 图标色 | Tag color |
|------|------|--------|-----------|
| 基础信息/选择类 | `#e6f7ff` | `#1890ff` | blue |
| 参数/策略/配置类 | `#fff7e6` | `#fa8c16` | orange |
| 图片/成功类 | `#f6ffed` | `#52c41a` | green |
| 高级/特殊类 | `#f9f0ff` | `#722ed1` | purple |

## 4. 表单字段布局

- 外层统一 `<Form layout="vertical" disabled={isDetailMode}>`。
- 常规字段用 grid 网格：`display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16`（字段少时可 2 列）。
- **禁止**在 `layout="vertical"` 的 Form 中给 Form.Item 使用 `labelCol={{ flex: 'XXXpx' }}`（垂直布局下会撑出大片空白）。

### 行内配置项（标签 + 控件同行）

参数类的短配置项用紧凑行布局，标签**固定宽度右对齐**：

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
  <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>定時器:</span>
  {/* 控件 + 行内灰字说明（fontSize 12, #8c8c8c） */}
</div>
```

## 5. 底部操作按钮（全局统一）

保存/取消按钮**必须放在页面底部**，使用全局 `.form-footer` 类（样式已在 `src/styles/components.css` 定义，居中排列、橙色主按钮，勿写内联样式覆盖）：

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

- 主按钮文案按业务定：`保存`（SaveOutlined）或 `提交申請`（SendOutlined）。
- 详情只读模式下隐藏底部按钮。

## 6. 已对齐该规范的页面（可作参考）

- `src/pages/Recommend/WaterfallAdd/index.tsx`（基准）
- `src/pages/Recommend/AlgorithmAdd.tsx`
- `src/pages/Recommend/OrganicTrafficScoreConfig.tsx`
- `src/pages/GiftManage/GiftAdd.tsx`
