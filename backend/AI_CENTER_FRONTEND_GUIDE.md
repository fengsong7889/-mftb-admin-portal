# AI 智能中心 - 前端路由与组件映射指南

## 📍 菜单结构 → 路由路径对照表

根据您提供的菜单结构，以下是完整的路由对应关系：

### 顶级菜单
```
智能中心 (AI) → /ai 或作为容器路由
```

### 二级菜单及子路由详细配置

#### 1️⃣ **模型管理** (`/ai/model`)
```typescript
{
  path: 'model',
  component: () => import('@/views/ai/model/index.vue'),
  meta: { title: '模型管理' },
  children: [
    // 供应商管理（Tab 1）
    {
      path: 'providers',
      name: 'AiModelProviders',
      component: () => import('@/views/ai/model/providers/index.vue'),
      meta: { title: '供应商管理' }
    },
    // 模型信息（Tab 2）
    {
      path: 'models',
      name: 'AiModelList',
      component: () => import('@/views/ai/model/models/index.vue'),
      meta: { title: '模型信息' }
    }
  ]
}
```

#### 2️⃣ **模型权控** (`/ai/auth`)
```typescript
{
  path: 'auth',
  component: () => import('@/views/ai/auth/index.vue'),
  meta: { title: '模型权控' },
  children: [
    // 部门模型权控（Tab 1）
    {
      path: 'departments',
      name: 'AiDeptAuth',
      component: () => import('@/views/ai/auth/departments/index.vue'),
      meta: { title: '部门模型权控' }
    },
    // 员工模型权控（Tab 2，内含子 Tab）
    {
      path: 'employees',
      name: 'AiEmpAuth',
      component: () => import('@/views/ai/auth/employees/index.vue'),
      meta: { title: '员工模型权控' },
      children: [
        // 按职位授权（Tab 3）⭐新增
        {
          path: 'positions',
          name: 'AiPosAuth',
          component: () => import('@/views/ai/auth/employees/positions.vue'),
          meta: { title: '按职位授权' }
        },
        // 角色授权（Tab 4）
        {
          path: 'roles',
          name: 'AiRoleAuth',
          component: () => import('@/views/ai/auth/employees/roles.vue'),
          meta: { title: '角色授权' }
        }
      ]
    }
  ]
}
```

#### 3️⃣ **配额管理** (`/ai/quota`)
```typescript
{
  path: 'quota',
  component: () => import('@/views/ai/quota/index.vue'),
  meta: { title: '配额管理' },
  children: [
    // 部门额度（Tab 1）
    {
      path: 'departments',
      name: 'AiDeptQuota',
      component: () => import('@/views/ai/quota/departments/index.vue'),
      meta: { title: '部门额度' }
    },
    // 员工额度（Tab 2，内含子 Tab）⭐新增
    {
      path: 'employees',
      name: 'AiEmpQuota',
      component: () => import('@/views/ai/quota/employees/index.vue'),
      meta: { title: '员工额度' },
      children: [
        // 按职位额度（Tab 3）⭐新增
        {
          path: 'positions',
          name: 'AiPosQuota',
          component: () => import('@/views/ai/quota/employees/positions.vue'),
          meta: { title: '按职位额度' }
        },
        // 角色额度（Tab 4）
        {
          path: 'roles',
          name: 'AiRoleQuota',
          component: () => import('@/views/ai/quota/employees/roles.vue'),
          meta: { title: '角色额度' }
        }
      ]
    }
  ]
}
```

#### 4️⃣ **工具注册中心** (`/ai/tools`)
```typescript
{
  path: 'tools',
  component: () => import('@/views/ai/tools/index.vue'),
  meta: { title: '工具注册中心' }
}
```

#### 5️⃣ **能耗统计** (`/ai/stats`)
```typescript
{
  path: 'stats',
  component: () => import('@/views/ai/stats/index.vue'),
  meta: { title: '能耗统计' }
}
```

#### 6️⃣ **能耗明细** (`/ai/logs`)
```typescript
{
  path: 'logs',
  component: () => import('@/views/ai/logs/index.vue'),
  meta: { title: '能耗明细' }
}
```

---

## 🔗 完整 App.tsx 路由配置示例

```typescript
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  // ...其他路由
  
  {
    path: '/ai',
    name: 'AIAssistant',
    component: () => import('@/views/ai/AIContainer.vue'),
    meta: { title: '智能中心 (AI)' },
    children: [
      // 模型管理
      {
        path: 'model',
        name: 'AiModel',
        redirect: '/ai/model/providers',
        children: [
          { 
            path: 'providers', 
            component: () => import('@/views/ai/model/providers/index.vue') 
          },
          { 
            path: 'models', 
            component: () => import('@/views/ai/model/models/index.vue') 
          }
        ]
      },
      
      // 模型权控
      {
        path: 'auth',
        name: 'AiAuth',
        redirect: '/ai/auth/departments',
        children: [
          {
            path: 'departments',
            component: () => import('@/views/ai/auth/departments/index.vue')
          },
          {
            path: 'employees',
            redirect: '/ai/auth/employees/positions',
            children: [
              {
                path: 'positions',
                component: () => import('@/views/ai/auth/employees/positions.vue'),
                name: 'AiPosAuth' // 按职位授权 ⭐
              },
              {
                path: 'roles',
                component: () => import('@/views/ai/auth/employees/roles.vue'),
                name: 'AiRoleAuth' // 角色授权
              }
            ]
          }
        ]
      },
      
      // 配额管理
      {
        path: 'quota',
        name: 'AiQuota',
        redirect: '/ai/quota/departments',
        children: [
          {
            path: 'departments',
            component: () => import('@/views/ai/quota/departments/index.vue')
          },
          {
            path: 'employees',
            redirect: '/ai/quota/employees/positions',
            children: [
              {
                path: 'positions',
                component: () => import('@/views/ai/quota/employees/positions.vue'),
                name: 'AiPosQuota' // 按职位额度 ⭐新增
              },
              {
                path: 'roles',
                component: () => import('@/views/ai/quota/employees/roles.vue'),
                name: 'AiRoleQuota' // 角色额度
              }
            ]
          }
        ]
      },
      
      // 工具注册中心
      {
        path: 'tools',
        component: () => import('@/views/ai/tools/index.vue')
      },
      
      // 能耗统计
      {
        path: 'stats',
        component: () => import('@/views/ai/stats/index.vue')
      },
      
      // 能耗明细
      {
        path: 'logs',
        component: () => import('@/views/ai/logs/index.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
```

---

## 🌐 API 接口完整列表

### 基础 URL
所有接口均以 `/api/ai` 开头

### 1. 供应商管理 (`/api/ai/providers`)

| 方法 | 路径 | 描述 | 请求参数 |
|------|------|------|----------|
| GET | `/providers` | 获取供应商列表 | query: providerKey, name, status |
| GET | `/providers/{id}` | 获取单个供应商 | path: id |
| POST | `/providers` | 新增供应商 | body: ProviderSaveRequest |
| PUT | `/providers/{id}` | 更新供应商 | path: id, body: ProviderSaveRequest |
| DELETE | `/providers/{id}` | 删除供应商 | path: id |

**请求示例：**
```javascript
// 获取供应商列表
GET /api/ai/providers?name=OpenAI&status=1

// 新增供应商
POST /api/ai/providers
{
  "providerKey": "google",
  "name": "Google Vertex AI",
  "description": "Google 大模型平台",
  "apiUrlBase": "https://us-central1-aiplatform.googleapis.com/v1",
  "apiKey": "...",
  "status": 1,
  "sortOrder": 4
}
```

---

### 2. 模型管理 (`/api/ai/models`)

| 方法 | 路径 | 描述 | 请求参数 |
|------|------|------|----------|
| GET | `/models` | 获取模型列表 | query: modelKey, name, type, status |
| GET | `/models/{id}` | 获取单个模型 | path: id |
| POST | `/models` | 新增模型 | body: ModelSaveRequest |
| PUT | `/models/{id}` | 更新模型 | path: id, body: ModelSaveRequest |
| DELETE | `/models/{id}` | 删除模型 | path: id |

**请求示例：**
```javascript
// 新增模型
POST /api/ai/models
{
  "modelKey": "gemini-pro",
  "name": "Gemini Pro",
  "providerId": 4,
  "description": "Google Gemini Pro 模型",
  "type": "chat",
  "contextWindow": 1000000,
  "maxOutputTokens": 8192,
  "inputPrice": 0.0005,
  "outputPrice": 0.0015,
  "status": 1,
  "sortOrder": 5
}
```

---

### 3. 配额管理 (`/api/ai/quota`)

#### 3.1 部门配额

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/quota/departments` | 查询部门配额列表 |
| POST | `/quota/departments` | 批量设置部门配额 |
| DELETE | `/quota/departments/{targetId}` | 删除部门配额 |

**请求示例：**
```javascript
// 批量设置部门配额
POST /api/ai/quota/departments
{
  "quotas": [
    {
      "quotaType": "department",
      "targetId": 10,
      "modelId": null, // NULL 表示全局配额
      "dailyQuota": 1000000,
      "monthlyQuota": 30000000,
      "autoReset": 1,
      "resetDayOfMonth": 1
    },
    {
      "quotaType": "department",
      "targetId": 10,
      "modelId": 1, // GPT-4o 特定配额
      "dailyQuota": 500000,
      "monthlyQuota": 15000000,
      "autoReset": 1,
      "resetDayOfMonth": 1
    }
  ]
}
```

#### 3.2 员工配额

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/quota/employees` | 查询员工配额列表 |
| POST | `/quota/employees` | 批量设置员工配额 |
| DELETE | `/quota/employees/{targetId}` | 删除员工配额 |

**请求示例：**
```javascript
// 批量设置员工配额
POST /api/ai/quota/employees
{
  "quotas": [
    {
      "quotaType": "employee",
      "targetId": 100,
      "dailyQuota": 100000,
      "monthlyQuota": 3000000,
      "autoReset": 1
    }
  ]
}
```

---

### 4. 权限管理 - 职位维度 (`/api/ai/auth/positions`)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/auth/positions` | 查询职位权限列表 |
| POST | `/auth/positions/batch` | 批量配置职位权限 |
| DELETE | `/auth/positions/{positionId}/{modelId}` | 删除职位权限映射 |

**请求示例：**
```javascript
// 批量配置职位权限
POST /api/ai/auth/positions/batch
{
  "items": [
    {
      "positionId": 5,
      "modelId": 1,
      "permissionLevel": "full",
      "dailyLimit": 500000,
      "monthlyLimit": 15000000,
      "priority": 10
    },
    {
      "positionId": 5,
      "modelId": 2,
      "permissionLevel": "restricted",
      "dailyLimit": 100000,
      "monthlyLimit": 0,
      "priority": 5
    }
  ]
}
```

---

### 5. 权限管理 - 角色维度 (`/api/ai/auth/roles`)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/auth/roles` | 查询角色权限列表 |
| POST | `/auth/roles/batch` | 批量配置角色权限 |
| DELETE | `/auth/roles/{roleId}/{modelId}` | 删除角色权限映射 |

---

## 🎨 Vue 组件文件结构建议

```
src/views/ai/
├── AIContainer.vue                    # AI 中心容器
├── model/
│   ├── index.vue                      # 模型管理页面（含 Tabs）
│   ├── providers/
│   │   └── index.vue                  # 供应商管理 CRUD 表格
│   └── models/
│       └── index.vue                  # 模型信息 CRUD 表格
├── auth/
│   ├── index.vue                      # 模型权控页面（含 Tabs）
│   ├── departments/
│   │   └── index.vue                  # 部门模型权控
│   └── employees/
│       ├── index.vue                  # 员工模型权控父级
│       ├── positions.vue             # 按职位授权（Tab 1）⭐
│       └── roles.vue                 # 角色授权（Tab 2）
├── quota/
│   ├── index.vue                      # 配额管理页面（含 Tabs）
│   ├── departments/
│   │   └── index.vue                  # 部门额度
│   └── employees/
│       ├── index.vue                  # 员工额度父级
│       ├── positions.vue             # 按职位额度（Tab 1）⭐新增
│       └── roles.vue                 # 角色额度（Tab 2）
├── tools/
│   └── index.vue                      # 工具注册中心
├── stats/
│   └── index.vue                      # 能耗统计图表
└── logs/
    └── index.vue                      # 能耗明细列表
```

---

## ⚡ 快速开发提示

### 1. 使用 Element Plus 的 Tabs 组件

```vue
<template>
  <el-tabs v-model="activeTab">
    <el-tab-pane label="部门" name="departments"></el-tab-pane>
    <el-tab-pane label="按职位" name="positions"></el-tab-pane>
    <el-tab-pane label="角色" name="roles"></el-tab-pane>
  </el-tabs>
</template>
```

### 2. 使用 ElTable 展示数据

```vue
<template>
  <el-table :data="tableData" style="width: 100%">
    <el-table-column prop="positionName" label="职位名称" />
    <el-table-column prop="modelName" label="模型名称" />
    <el-table-column prop="permissionLevel" label="权限级别">
      <template #default="{ row }">
        <el-tag>{{ getPermissionLevelLabel(row.permissionLevel) }}</el-tag>
      </template>
    </el-table-column>
  </el-table>
</template>
```

### 3. API 调用示例（Axios）

```javascript
import axios from 'axios'

const aiApi = axios.create({
  baseURL: '/api/ai',
  timeout: 10000
})

// 获取职位权限列表
export function getPositionPermissions(params) {
  return aiApi.get('/auth/positions', { params })
}

// 批量配置职位权限
export function batchSetPositionPermissions(data) {
  return aiApi.post('/auth/positions/batch', data)
}

// 获取员工配额列表
export function getEmployeeQuotas(params) {
  return aiApi.get('/quota/employees', { params })
}

// 批量设置员工配额
export function batchSetEmployeeQuotas(data) {
  return aiApi.post('/quota/employees', data)
}
```

---

## ✅ 完成清单

- [x] 数据库表创建 (sql/85_ai_center_tables.sql)
- [x] Java Entity 层 (8 个实体类)
- [x] Java Mapper 层 (8 个 Mapper)
- [x] Java Controller 层 (7 个 Controller)
- [x] DTO 定义 (4 个核心 DTO 文件)
- [ ] Service 层（可选，当前可直接使用 Mapper + Controller）
- [ ] 前端路由配置
- [ ] 前端组件开发

---

## 🎯 下一步建议

### 优先级 1：前端开发（本周）
1. 配置路由
2. 开发「按职位额度」Tab 组件
3. 开发「角色额度」Tab 组件
4. 对接 API 接口

### 优先级 2：后端完善（下周）
1. 创建 Service 层（添加业务逻辑）
2. 添加用量统计功能
3. 添加用量日志记录功能
4. 添加定时任务处理配额重置

### 优先级 3：优化与测试
1. 单元测试
2. 集成测试
3. API 文档完善（Swagger）
4. 性能优化

---

## 📞 需要确认的问题

1. **Service 层**: 是否需要我继续创建完整的 Service 层？还是可以直接在 Controller 中使用 Mapper？
2. **用量统计**: 前端是否有特殊的图表需求（ECharts、折线图、饼图等）？
3. **实时配额检查**: 需要在每次调用时实时检查配额限制吗？

请告诉我您的需求，我可以立即生成剩余代码！🚀
