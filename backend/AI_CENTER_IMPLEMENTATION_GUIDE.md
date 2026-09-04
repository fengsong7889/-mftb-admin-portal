# AI 智能中心后端实现指南

## 📦 已完成部分

### 1. ✅ 数据库设计 (sql/85_ai_center_tables.sql)
创建了 8 张核心表：

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| ai_provider | AI 供应商表 | provider_key, name, api_url_base, api_key |
| ai_model | AI 模型表 | model_key, provider_id, type, context_window, input_price, output_price |
| ai_department_auth | 部门模型权限表 | department_id, model_id, has_permission, limit_type, daily_limit, monthly_limit |
| ai_employee_auth | 员工模型权限表 | employee_id, model_id, has_permission, current_daily_usage, current_monthly_usage |
| ai_position_model_mapping | 职位模型权限映射表 | position_id, model_id, permission_level, priority |
| ai_role_model_mapping | 角色模型权限映射表 | role_id, model_id, permission_level, priority |
| ai_quota_config | 配额配置表 | quota_type, target_id, model_id, daily_quota, monthly_quota, auto_reset |
| ai_usage_log | 用量日志表 | target_type, target_id, model_id, request_tokens, response_tokens, cost_amount |
| ai_tool_registry | 工具注册表 | tool_key, name, category, version, api_endpoint |

**初始化数据：**
- 3 个测试供应商（OpenAI, Azure OpenAI, Anthropic）
- 4 个测试模型（GPT-4o, GPT-4o-mini, o1-preview, Claude 3.5 Sonnet）

### 2. ✅ Java Entity 层（8 个实体类）
```
src/main/java/com/mftb/admin/entity/
├── AiProvider.java          # AI 供应商
├── AiModel.java             # AI 模型
├── AiDepartmentAuth.java    # 部门权限
├── AiEmployeeAuth.java      # 员工权限
├── AiPositionModelMapping.java   # 职位权限映射
├── AiRoleModelMapping.java         # 角色权限映射
├── AiUsageLog.java          # 用量日志
├── AiQuotaConfig.java       # 配额配置
└── AiToolRegistry.java      # 工具注册
```

### 3. ✅ Mapper 层（8 个接口）
```
src/main/java/com/mftb/admin/mapper/
├── AiProviderMapper.java
├── AiModelMapper.java
├── AiDepartmentAuthMapper.java
├── AiEmployeeAuthMapper.java
├── AiPositionModelMapper.java
├── AiRoleModelMapper.java
├── AiUsageLogMapper.java
├── AiQuotaConfigMapper.java
└── AiToolRegistryMapper.java
```

---

## 🚀 下一步实施步骤

### Step 1: 执行数据库脚本 ⚠️ **必须先执行！**

```bash
# 连接到您的开发数据库
mysql -u your_username -p your_database < sql/85_ai_center_tables.sql
```

或者在 MySQL 客户端中直接执行该 SQL 文件。

---

### Step 2: 继续创建剩余代码

由于项目规模较大，我将分批提供以下文件：

#### A. DTO 层（待补充）
需要创建以下 DTO 文件（我已创建了一个示例 `AiProviderDTO.java`）：

- `AiModelDTO.java` - 模型相关 DTO
- `AiDepartmentAuthDTO.java` - 部门权限 DTO
- `AiEmployeeAuthDTO.java` - 员工权限 DTO
- `AiPositionAuthDTO.java` - 职位权限 DTO
- `AiRoleAuthDTO.java` - 角色权限 DTO
- `AiQuotaDTO.java` - 配额管理 DTO
- `AiUsageLogDTO.java` - 用量日志 DTO
- `AiToolRegistryDTO.java` - 工具注册 DTO

#### B. Service 层（待创建）
为每个实体创建 Service：

- `AiProviderService.java` / `AiProviderServiceImpl.java`
- `AiModelService.java` / `AiModelServiceImpl.java`
- `AiAuthService.java` / `AiAuthServiceImpl.java` （处理权限逻辑）
- `AiQuotaService.java` / `AiQuotaServiceImpl.java` （处理配额逻辑）
- `AiUsageLogService.java` / `AiUsageLogServiceImpl.java`
- `AiToolRegistryService.java` / `AiToolRegistryServiceImpl.java`

#### C. Controller 层（待创建）
RESTful API 接口：

- `AiProviderController.java` - 供应商 CRUD
- `AiModelController.java` - 模型 CRUD
- `AiAuthController.java` - 权限管理
- `AiQuotaController.java` - 配额管理
- `AiUsageLogController.java` - 用量查询
- `AiToolRegistryController.java` - 工具管理

---

## 📝 API 接口设计草案

### 1. AI 供应商管理 (`/api/ai/providers`)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/ai/providers` | 获取供应商列表 |
| POST | `/api/ai/providers` | 新增供应商 |
| PUT | `/api/ai/providers/{id}` | 更新供应商 |
| DELETE | `/api/ai/providers/{id}` | 删除供应商 |
| GET | `/api/ai/providers/{id}` | 获取单个供应商详情 |

### 2. AI 模型管理 (`/api/ai/models`)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/ai/models` | 获取模型列表（支持分页） |
| POST | `/api/ai/models` | 新增模型 |
| PUT | `/api/ai/models/{id}` | 更新模型 |
| DELETE | `/api/ai/models/{id}` | 删除模型 |

### 3. 权限管理 (`/api/ai/auth`)

#### 部门权限
- GET `/api/ai/auth/departments` - 获取部门权限列表
- PUT `/api/ai/auth/departments` - 批量设置部门权限

#### 员工权限
- GET `/api/ai/auth/employees` - 获取员工权限列表
- PUT `/api/ai/auth/employees` - 设置员工权限

#### 职位权限
- GET `/api/ai/auth/positions` - 获取职位权限映射
- PUT `/api/ai/auth/positions` - 配置职位权限

#### 角色权限
- GET `/api/ai/auth/roles` - 获取角色权限映射
- PUT `/api/ai/auth/roles` - 配置角色权限

### 4. 配额管理 (`/api/ai/quota`)

- GET `/api/ai/quota/departments` - 查询部门配额
- PUT `/api/ai/quota/departments` - 设置部门配额
- GET `/api/ai/quota/employees` - 查询员工配额
- PUT `/api/ai/quota/employees` - 设置员工配额
- GET `/api/ai/quota/positions` - 查询职位配额（Tab）
- PUT `/api/ai/quota/positions` - 设置职位配额
- GET `/api/ai/quota/roles` - 查询角色配额（Tab）
- PUT `/api/ai/quota/roles` - 设置角色配额

### 5. 用量统计 (`/api/ai/usage`)

- GET `/api/ai/usage/statistics` - 获取用量统计（图表数据）
- GET `/api/ai/usage/logs` - 查询用量明细列表
- GET `/api/ai/usage/detail/{targetId}` - 获取单个目标用量详情

### 6. 工具注册 (`/api/ai/tools`)

- GET `/api/ai/tools` - 获取工具列表
- POST `/api/ai/tools` - 注册新工具
- PUT `/api/ai/tools/{id}` - 更新工具信息
- DELETE `/api/ai/tools/{id}` - 删除工具

---

## 🔧 前端路由路径对应

根据菜单结构，前端路由应如下配置：

```typescript
// App.tsx 或路由配置文件
{
  path: '/ai',
  element: <AIContainer />,
  children: [
    { path: 'model-provider', component: 'AiModelProvider' },     // 供应商管理
    { path: 'model-list', component: 'AiModelList' },             // 模型信息
    { 
      path: 'auth-manage',
      children: [
        { path: 'departments', component: 'AiDeptAuth' },         // 部门模型权控
        { 
          path: 'employees',
          children: [
            { path: 'positions', component: 'AiPosAuth' },         // 按职位授权
            { path: 'roles', component: 'AiRoleAuth' },            // 角色授权
          ]
        }
      ]
    },
    {
      path: 'quota-manage',
      children: [
        { path: 'departments', component: 'AiDeptQuota' },         // 部门额度
        {
          path: 'employees',
          children: [
            { path: 'positions', component: 'AiPosQuota' },        // 按职位额度 ⚠️新增
            { path: 'roles', component: 'AiRoleQuota' },           // 角色额度
          ]
        }
      ]
    },
    { path: 'tool-registry', component: 'AiToolRegistry' },       // 工具注册中心
    { path: 'usage-stats', component: 'AiUsageStats' },          // 能耗统计
    { path: 'energy-detail', component: 'AiEnergyDetail' },      // 能耗明细
  ]
}
```

---

## 🎯 优先完成顺序建议

根据您的实际需求和前端完成情况，建议按以下优先级实施：

### P0 - 核心功能（本周完成）
1. ✅ 数据库表创建和初始化
2. ✅ Entity + Mapper 基础框架
3. ⬅️ **AI Provider 供应商管理**（CRUD）
4. ⬅️ **AI Model 模型管理**（CRUD）
5. ⬅️ **AiQuota 配额管理 API**（部门 + 员工 + 职位 + 角色）

### P1 - 权限功能（下周）
6. AI 权限管理系统（部门/员工/职位/角色）
7. 用量日志记录

### P2 - 扩展功能
8. 工具注册中心
9. 用量统计和报表

---

## 📌 注意事项

1. **数据库连接**: 确保使用正确的数据库连接配置
2. **API Key 加密**: `ai_provider.api_key` 必须加密存储
3. **用量限额校验**: 每次调用 AI 服务前需检查配额限制
4. **自动重置**: 需要定时任务处理每日/每月配额重置
5. **权限继承**: 员工权限可能继承自职位/角色，需注意计算逻辑

---

## ✨ 快速开始命令

```bash
# 1. 执行数据库脚本
mysql -u admin -p YourPassword fengsong_test < sql/85_ai_center_tables.sql

# 2. 启动后端服务（如果需要）
./run-local.sh

# 3. 访问 Swagger UI 查看 API 文档
http://localhost:8080/swagger-ui.html
```

---

## 📞 需要我做什么？

请告诉我：
1. 是否需要我现在开始创建完整的 Service 和 Controller？
2. 前端是否已经有部分 API 需求文档？
3. 是否有特定的字段或业务规则需要调整？
4. 是否需要我生成测试代码？

确认后我将继续生成完整代码！🚀
