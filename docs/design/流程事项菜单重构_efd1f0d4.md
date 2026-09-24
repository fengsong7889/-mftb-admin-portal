# 流程事项菜单重构方案

## 目标 Tab 结构

```
流程事項 (/oa-requests)
├── Tab 1: 我發起的     — 当前用户发起的所有流程（所有状态）
├── Tab 2: 待我審批     — 当前用户待审批的流程（仅 pending，有审批/详情按钮）
├── Tab 3: 我已審批的   — 当前用户已审批过的流程（approved/rejected 任务）
└── Tab 4: 全部流程     — 当前用户作为部门 leader 所在部门的所有流程（条件显示）
```

---

## 一、后端改造

### 1. OaRequestQuery 新增 `scope` 参数

**文件**: `backend/src/main/java/com/mftb/admin/dto/OaRequestQuery.java`

```java
/** 查询范围: my_applied / pending_my_approval / my_approved / department_all */
private String scope;
```

### 2. OaRequestServiceImpl.page() 按 scope 分支查询

**文件**: `backend/src/main/java/com/mftb/admin/service/impl/OaRequestServiceImpl.java`

| scope | 查询逻辑 |
|-------|---------|
| `my_applied` | `applicant LIKE '%userName%'`（现有逻辑） |
| `pending_my_approval` | 从 `biz_oa_approval_task` 查 approver 包含当前用户 + taskStatus=pending 的 requestId 集合（排除会签已审） |
| `my_approved` | 从 `biz_oa_approval_task` 查 approvedBy 包含当前用户 或 (approver 包含当前用户 + approveTime 不为空) 的 requestId 集合 |
| `department_all` | 先通过 `sys_department.leader = userName` 找到部门 ID，再查 `sys_user.department_id = deptId` 获取部门成员名单，最后过滤 `applicant IN (成员名单)` |

- 移除现有的 `approverName` 参数逻辑，统一由 `scope` 驱动
- 保留 `flowNo`、`processCode`、`applicant`、`flowStatus`、`applyFrom/To` 等通用过滤条件

### 3. 新增「部门 leader 检测」接口

**文件**: `backend/src/main/java/com/mftb/admin/controller/OaRequestController.java`

```
GET /api/oa/requests/is-dept-leader
→ 返回 { isLeader: true/false, departmentName: "xxx" }
```

逻辑：查 `sys_department` 表中 `leader` 字段包含当前用户姓名且 `status=1` 的记录。

### 4. 清理旧的 approverName 参数

- `OaRequestQuery` 中移除 `approverName` 字段
- `OaRequestServiceImpl.page()` 中移除 `filterByApprover` 相关逻辑，替换为 `scope` 分支

---

## 二、前端改造

### 1. Tab 结构重构

**文件**: `src/pages/OACenter/OaRequests/index.tsx`

将现有 2 Tab 替换为 4 Tab：

| Tab key | 标签 | 数据来源 | 操作列 |
|---------|------|---------|--------|
| `my` | 我發起的 | `scope=my_applied` | 详情 / 撤销(draft/pending) |
| `pending` | 待我審批 | `scope=pending_my_approval` | 审批 + 详情 |
| `approved` | 我已審批的 | `scope=my_approved` | 详情 |
| `all` | 全部流程 | `scope=department_all` | 详情 |

- Tab 4 仅在 `isDeptLeader=true` 时显示
- 每个 Tab 独立的搜索表单、列配置、数据加载函数

### 2. 列配置调整

**「我發起的」Tab**:
- 流程编号、流程名称、流程标签、申请时间、状态、当前审批节点、当前审批人、操作

**「待我審批」Tab**:
- 流程编号、流程名称、流程标签、申请人、申请时间、状态、审核人、审核时间、操作(审批+详情)
- 审核人 = 当前用户，审核时间 = 空（待审）

**「我已審批的」Tab**:
- 流程编号、流程名称、流程标签、申请人、申请时间、状态、审核人、审核时间、操作(详情)
- 审核人 = 当前用户，审核时间 = 实际审批时间

**「全部流程」Tab**:
- 流程编号、流程名称、流程标签、申请人、申请时间、状态、当前审批节点、当前审批人、操作(详情)

### 3. API 调用

**文件**: `src/api/oaRequest.ts`

- `OaRequestQuery` 新增 `scope` 字段，移除 `approverName`
- 新增 `checkIsDeptLeader()` API 调用 `GET /api/oa/requests/is-dept-leader`

### 4. i18n 更新

**文件**: `src/i18n/locales/zh-TW.json` + `en.json`

```
oaRequests.tabMy → oaRequests.tabMyApplied  (我發起的)
oaRequests.tabPending 保持不变               (待我審批)
新增 oaRequests.tabMyApproved               (我已審批的)
新增 oaRequests.tabAll                      (全部流程)
```

---

## 三、实施步骤

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1 | 后端: OaRequestQuery 新增 scope，移除 approverName | OaRequestQuery.java |
| 2 | 后端: page() 按 scope 分支查询 | OaRequestServiceImpl.java |
| 3 | 后端: 新增 is-dept-leader 接口 | OaRequestController.java + OaRequestService.java |
| 4 | 前端: API 类型更新 | oaRequest.ts |
| 5 | 前端: 重构 4 Tab 结构 | OaRequests/index.tsx |
| 6 | 前端: i18n 新增 key | zh-TW.json + en.json |
| 7 | 构建重启后端 | - |

---

## 四、关键设计决策

1. **scope 驱动 vs 多接口**: 选择单接口 + scope 参数，避免接口膨胀，前端切换 Tab 只需改 scope 值
2. **部门 leader 判断**: 复用现有 `sys_department.leader` 字段（部门对接人），无需新增表/字段
3. **「待我審批」与「我已審批的」分离**: 对齐行业标准，让用户清晰区分「需要我处理的」和「我已经处理过的」
4. **全部流程 Tab 条件显示**: 仅部门负责人可见，普通员工不感知此功能