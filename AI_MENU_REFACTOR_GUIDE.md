# AI 智能中心菜单拆分方案 - 实施说明

## 📋 概览

已完成的修改：
1. ✅ 数据库迁移 SQL (`backend/sql/74_split_ai_menus.sql`)
2. ✅ 后端种子数据 (DataInitializer.java)
3. ✅ 供应商管理页面 (AiModelProvider/index.tsx)
4. ⏳ 模型列表页面 (AiModelList/index.tsx) - 需要修复类型错误
5. ⏳ 权限管理/额度策略页面 (从 AiQuotaAuth 拆分)
6. ⏳ 路由配置 (App.tsx)

---

## 🎯 最终菜单结构

```
智能中心 (AI)
├── 模型管理
│   ├── 供应商管理        → /ai-model-providers    → AiModelProvider.tsx
│   └── 模型列表          → /ai-model-list         → AiModelList.tsx
├── 授权与配额
│   ├── 权限管理          → /ai-auth               → AiQuotaAuth/AiAuth.tsx (需创建)
│   └── 额度策略          → /ai-quota              → AiQuotaAuth/AiQuota.tsx (需创建)
├── 工具注册中心
│   └── /ai-tool-registry → AiToolRegistry.tsx (保持不变)
└── 能耗统计
    └── /ai-usage-stats → AiUsageStats.tsx (保持不变)
```

---

## 🛠️ 剩余实施步骤

### Step 1: 修复 AiModelList 类型错误

问题：
- `CAPABILITY_TAG_COLOR` 未导出
- `AiModel`接口缺少`providerName`属性
- `providerType`未定义

解决方案：
在 `AiModelList/index.tsx`内部添加常量定义：
```tsx
const CAPABILITY_TAG_COLOR: Record<ModelCapability, string> = {
  chat: '#1890FF',
  longContext: '#722ED1',
  code: '#E8720C',
  functionCall: '#13C2C2',
}
```

简化 providerName 映射逻辑（使用硬编码映射或移除私有化部署统计卡）

### Step 2: 从 AiQuotaAuth 拆分两个新页面

**方案 A：复制 + 简化（推荐）**

1. 复制 `AiQuotaAuth/index.tsx` 到 `AiQuotaAuth/AiAuth.tsx`
   - 只保留"Tab1: 部门模型授权"和"Tab1: 员工覆盖"部分
   - 删除其他 Tabs
   - 移除相关状态变量和函数

2. 复制 `AiQuotaAuth/index.tsx` 到 `AiQuotaAuth/AiQuota.tsx`  
   - 只保留"Tab2: 额度策略"、"Tab3: 路由策略"、"Tab4: 账号白名单"
   - 删除"部门模型授权"部分
   - 重新组织布局

3. 在 `AiQuotaAuth`目录下创建 index.tsx 作为重定向页（可选）

**方案 B：保持现有页面，通过路由参数控制显示内容**

在当前 `AiQuotaAuth/index.tsx`中添加 Tab 选择器：
```tsx
<Tabs activeKey={activeTab} onChange={(tab) => setActiveTab(tab)}>
  {config.items.map(item => ({ key: item.key, label: item.label }))}
</Tabs>
```

### Step 3: App.tsx 路由配置

在懒加载部分添加：
```tsx
const AiModelProvider = lazy(() => import('./pages/AiModelProvider'))
const AiModelList = lazy(() => import('./pages/AiModelList'))
const AiAuth = lazy(() => import('./pages/AiQuotaAuth/AiAuth'))
const AiQuota = lazy(() => import('./pages/AiQuotaAuth/AiQuota'))
```

在 Routes 部分添加：
```tsx
<Route path="/ai-model-provider" element={<AiModelProvider />} />
<Route path="/ai-model-list" element={<AiModelList />} />
<Route path="/ai-auth" element={<AiAuth />} />
<Route path="/ai-quota" element={<AiQuota />} />
```

同时注释或删除旧的路由：
```tsx
// <Route path="/ai-model-hub" element={<AiModelHub />} />
// <Route path="/ai-quota-auth" element={<AiQuotaAuth />} />
```

### Step 4: 前端菜单组件更新（可选）

如果有硬编码的侧边栏菜单，需要在 `Sidebar.tsx` 中调整：

```tsx
{
  key: 'ai-assistant',
  label: '智能中心 (AI)',
  children: [
    { key: 'ai-models', label: '模型管理', type: 'submenu' },
    { key: 'ai-model-provider', label: '供应商管理' },
    { key: 'ai-model-list', label: '模型列表' },
    { key: 'ai-auth-quota', label: '授权与配额', type: 'submenu' },
    { key: 'ai-auth', label: '权限管理' },
    { key: 'ai-quota', label: '额度策略' },
    // ... 其他不变
  ]
}
```

---

## 🧪 测试验证清单

- [ ] 运行数据库脚本 `74_split_ai_menus.sql`
- [ ] 重启后端应用，确认种子数据加载成功
- [ ] 访问 `/ai-model-provider` → 供应商管理页面正常显示
- [ ] 访问 `/ai-model-list` → 模型列表页面正常显示  
- [ ] 访问 `/ai-auth` → 权限管理页面正常显示
- [ ] 访问 `/ai-quota` → 额度策略页面正常显示
- [ ] 列配置功能正常工作（显示/隐藏、排序）
- [ ] 首页"我的用量"显示今日剩余百分比并正确变色

---

## 📝 备注

- 旧页面 `AiModelHub`和`AiQuotaAuth` 可作为占位菜单保留，防止 403 错误
- 或者将它们的内容迁移到新页面后删除旧路由
- 所有页面遵循设计规范：无顶部标题、右侧操作区、列配置按钮
