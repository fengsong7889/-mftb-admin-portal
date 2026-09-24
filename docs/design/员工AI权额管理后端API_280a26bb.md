# 员工AI权额管理 — 后端 API 与数据库实现

## 现状分析

后端已有完整的四维度数据体系：
- **模型授权**: `ai_dept_auth_group`(部门) / `ai_emp_pos_auth_strategy`(职位) / `ai_emp_role_auth`(角色) / `ai_employee_auth`(员工)
- **额度配置**: `ai_quota_config`(部门/员工) / `ai_emp_quota_policy`(职位) / `ai_role_quota_policy`(角色) / `ai_quota_override`(审批授予)
- **用量追踪**: `biz_llm_usage`
- **聚合逻辑**: `AiMyCenterServiceImpl` 已有 `myModels()` 和 `collectAllDims()` 方法（但仅面向当前登录用户）
- **员工信息**: `sys_user` 表（含 name/empId/department/position/sequence/jobLevel）

缺失：管理员视角的「查看任意员工权额」聚合接口 + 额度调整日志表。

---

## Phase 1: 数据库 — 额度调整日志表

**文件**: `backend/sql/108_emp_quota_adjust_log.sql`

```sql
CREATE TABLE IF NOT EXISTS ai_emp_quota_adjust_log (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id  BIGINT NOT NULL COMMENT '被调整员工ID (sys_user.id)',
  source       VARCHAR(32) NOT NULL COMMENT '来源维度: department/position/role/approval',
  source_desc  VARCHAR(200) COMMENT '来源描述',
  quota_type   VARCHAR(16) NOT NULL COMMENT 'token/request',
  quota_period VARCHAR(16) NOT NULL COMMENT 'daily/monthly',
  old_value    DECIMAL(15,2) NOT NULL DEFAULT 0,
  new_value    DECIMAL(15,2) NOT NULL,
  reason       VARCHAR(300) COMMENT '调整原因',
  operator     VARCHAR(64) NOT NULL COMMENT '操作人',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_emp (employee_id),
  INDEX idx_time (created_at)
) COMMENT='员工额度调整日志';
```

---

## Phase 2: 后端 — Entity + Mapper

**新建文件**:
- `entity/AiEmpQuotaAdjustLog.java` — 对应 `ai_emp_quota_adjust_log` 表
- `mapper/AiEmpQuotaAdjustLogMapper.java` — MyBatis-Plus BaseMapper

---

## Phase 3: 后端 — DTO 设计

**新建文件**: `dto/AiEmpPermissionDTO.java`（内部类组织）

```java
public class AiEmpPermissionDTO {

    // ---- 列表页单行 ----
    public static class SummaryVO {
        Long employeeId;
        String employeeName;    // sys_user.name
        String empId;           // sys_user.emp_id
        String department;      // sys_user.department
        Long deptId;            // sys_user.department_id
        String position;        // sys_user.position
        String jobLevel;        // sys_user.job_level
        int modelCount;         // 启用模型数
        List<ModelBrief> models;// 授权模型列表
        List<QuotaBrief> quotas;// 聚合额度（含已用/总额）
        String lastUpdatedBy;   // 最近操作人
        String lastUpdatedAt;   // 最近操作时间
    }

    // ---- 模型简要（列表用）----
    public static class ModelBrief {
        Long modelId;
        String modelName;
        String source;          // department/position/role/employee/approval
    }

    // ---- 额度简要（列表用）----
    public static class QuotaBrief {
        String source;
        String sourceDesc;
        String quotaType;       // token/request
        String quotaPeriod;     // daily/monthly
        BigDecimal quotaValue;
        BigDecimal usedValue;
        int status;
    }

    // ---- 详情页 ----
    public static class DetailVO {
        SummaryVO basic;                    // 基本信息
        List<ModelPermissionVO> models;     // 模型权限明细（含能力开关）
        List<QuotaGrantVO> quotas;          // 额度明细
    }

    public static class ModelPermissionVO {
        Long modelId;
        String modelName;
        String source;
        String sourceDesc;
        int visionSupport;      // 0/1
        int functionCalling;
        int jsonMode;
        int streaming;
        int thinkingMode;
        int status;             // 1=启用 0=禁用
        String grantedAt;
    }

    public static class QuotaGrantVO {
        Long id;
        String source;
        String sourceDesc;
        String quotaType;
        String quotaPeriod;
        BigDecimal quotaValue;
        BigDecimal usedValue;
        String effectiveType;   // permanent/temporary
        String effectiveAt;
        String expireAt;
        String overLimitAction;
        int status;
    }

    // ---- 保存请求 ----
    public static class SaveReq {
        Long employeeId;
        List<ModelCapToggle> modelToggles;  // 能力开关变更
        List<QuotaAdjust> quotaAdjusts;     // 额度值变更
        String reason;
    }

    public static class ModelCapToggle {
        Long modelId;
        String field;           // visionSupport/functionCalling/...
        int value;              // 0 or 1
    }

    public static class QuotaAdjust {
        Long quotaId;           // 对应额度记录ID
        BigDecimal newValue;
    }

    // ---- 调整日志 VO ----
    public static class AdjustLogVO {
        String time;
        String sourceDesc;
        BigDecimal oldValue;
        BigDecimal newValue;
        String operator;
        String reason;
    }
}
```

---

## Phase 4: 后端 — Service 层

**新建文件**:
- `service/AiEmpPermissionService.java`（接口）
- `service/impl/AiEmpPermissionServiceImpl.java`（实现）

### 核心方法

**`listSummaries(query)`** — 列表聚合:
1. 查 `sys_user`（status=1, deleted=0），支持按姓名/工号/部门/职级筛选
2. 对每个员工，复用 `AiMyCenterServiceImpl` 中的四维度模型收集逻辑（需提取为可传入 userId 参数的公共方法）
3. 对每个员工，复用 `collectAllDims()` 的额度聚合逻辑
4. 通过 `biz_llm_usage` 按 userId 聚合已用量
5. 从四维度配置表中取 MAX(updated_at) 和对应 updated_by 作为 lastUpdatedBy/lastUpdatedAt
6. 组装 SummaryVO 返回

**实现策略**: 在 `AiMyCenterServiceImpl` 中提取/重载 `myModels(Long userId)` 和 `collectAllDims(Long userId)` 变体（当前版本硬编码了当前登录用户 ID），使管理页可查询任意员工。

**`getDetail(employeeId)`** — 详情:
1. 查员工基本信息
2. 四维度模型权限明细（含能力开关 + 来源）
3. 四维度额度明细（含已用量）
4. 组装 DetailVO

**`save(employeeId, SaveReq)`** — 保存:
1. 遍历 modelToggles → 更新 `ai_employee_auth` 表对应能力字段（无记录则 INSERT）
2. 遍历 quotaAdjusts → 更新对应额度表值（需根据 source 定位到具体表和行）
3. 批量 INSERT `ai_emp_quota_adjust_log`（记录旧值 → 新值 + 原因 + 操作人）

**`getAdjustLogs(employeeId)`** — 查询调整历史:
1. 查 `ai_emp_quota_adjust_log` WHERE employee_id = ? ORDER BY created_at DESC

---

## Phase 5: 后端 — Controller

**新建文件**: `controller/AiEmpPermissionController.java`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ai/emp-permission/list` | 列表（支持 queryName/queryDept/querySource/queryQuotaStatus/queryUpdatedBy/queryUpdateTime 参数） |
| GET | `/api/ai/emp-permission/{empId}` | 详情 |
| PUT | `/api/ai/emp-permission/{empId}` | 保存编辑 |
| GET | `/api/ai/emp-permission/{empId}/adjust-log` | 调整日志 |

权限注解: `@RequirePermission(menu = "ai-emp-permission", action = "view|edit")`

---

## Phase 6: 前端 — API 层对接

**修改文件**: `src/api/mock/aiEmpPermissionMock.ts`
- 保留类型定义（EmpPermissionSummary / EmpModelPermission / EmpQuotaGrant 等）
- 新增 `fetchEmpPermissionList(params)` → `GET /api/ai/emp-permission/list`
- 新增 `fetchEmpPermissionDetail(empId)` → `GET /api/ai/emp-permission/{empId}`
- 新增 `saveEmpPermission(empId, data)` → `PUT /api/ai/emp-permission/{empId}`
- 新增 `fetchAdjustLogs(empId)` → `GET /api/ai/emp-permission/{empId}/adjust-log`
- 保留 `fetchMockEmpPermissions()` 作为降级/开发备用

**修改文件**: `src/pages/AiEmpPermission/index.tsx`
- 将 `fetchMockEmpPermissions()` 替换为 `fetchEmpPermissionList(applied)`
- 搜索参数直接透传给后端（后端做过滤，去掉前端 filtered 逻辑）

**修改文件**: `src/pages/AiEmpPermission/AiEmpPermissionDetail.tsx`
- 将 `fetchMockEmpPermissions()` + `.find()` 替换为 `fetchEmpPermissionDetail(empId)`
- `handleSave` 改为调用 `saveEmpPermission(empId, payload)`
- 调整记录改为调用 `fetchAdjustLogs(empId)`（查看模式下加载）

---

## 实施顺序

1. SQL 迁移脚本 → 2. Entity + Mapper → 3. DTO → 4. Service（含重构 AiMyCenterServiceImpl 提取公共方法）→ 5. Controller → 6. 前端 API 对接 → 7. TypeScript 编译验证
