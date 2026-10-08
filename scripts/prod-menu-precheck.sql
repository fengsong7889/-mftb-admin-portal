-- ============================================================================
-- 生产库上线前只读核查（RDM 菜单拆分 v3.11 + 阶段3-6 结构补丁）
-- 用途：确认切换后端镜像前，启动期的菜单迁移与结构断言不会让服务起不来。
-- 全部是 SELECT，不写任何数据；可整段贴进阿里云 DMS / 客户端执行。
-- ============================================================================

-- ┌─ 风险 1（最关键）──────────────────────────────────────────────┐
-- │ rdm-intake 的当前名字。启动断言要求它最终等于「需求管理」，而改名只 │
-- │ 命中旧默认名：若有人工自定义名，RENAMES 不覆盖 → 断言失败 → ready DOWN │
-- └────────────────────────────────────────────────────────────┘
SELECT menu_key, name, name_en, path, type, sort_order, parent_id, actions, status, deleted
FROM sys_menu
WHERE menu_key IN ('rdm-intake', 'rdm-requirement', 'rdm-workbench', 'rdm-acceptance')
ORDER BY menu_key;
-- 期望：rdm-intake 的 name 仍是「需求池·分配」或「需求池/分配」二者之一。
-- 若是其它自定义名，请在「菜单配置」里先改回「需求池·分配」再切后端，或接受我改宽断言。

-- ┌─ 风险 2 ──────────────────────────────────────────────┐
-- │ 两个新菜单 key 是否已被人工建过（含软删残留）。存活同名会撞唯一索引，   │
-- │ 软删残留虽会被初始化器清理，但要先知道它的存在与归属                    │
-- └────────────────────────────────────────────────────────────┘
SELECT menu_key, name, path, type, deleted
FROM sys_menu
WHERE menu_key IN ('rdm-pool-group', 'rdm-intake-approval');
-- 期望：0 行。有行就是把结果带回来，我按情况调整种子而不是硬建。

-- ┌─ 风险 3 ──────────────────────────────────────────────┐
-- │ 菜单图标全局唯一是本项目硬规范。确认新用的两个图标没被占用              │
-- └────────────────────────────────────────────────────────────┘
SELECT icon, COUNT(*) AS used, GROUP_CONCAT(menu_key) AS owners
FROM sys_menu
WHERE deleted = 0 AND icon IN ('ContainerOutlined', 'SendOutlined')
GROUP BY icon;
-- 期望：0 行。非 0 我就换一对未占用的图标。

-- ┌─ 风险 4 ──────────────────────────────────────────────┐
-- │ 授权补齐与断言都依赖 sys_role.code='admin' 这一行存在且启用；           │
-- │ 缺失时 grantAdminMenus 写 0 行，随后 assertAdminHoldsAction 直接抛错。  │
-- └────────────────────────────────────────────────────────────┘
SELECT id, code, name, status, deleted FROM sys_role WHERE code = 'admin';
SELECT COUNT(*) AS admin_rdm_grants
FROM sys_role_menu rm
JOIN sys_role r ON r.id = rm.role_id AND r.code = 'admin' AND r.deleted = 0
JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 AND m.system_code = 'rdm';
-- 期望：admin 角色 1 行且 status=1；admin_rdm_grants > 0。

-- ┌─ 风险 5 ──────────────────────────────────────────────┐
-- │ 系统准入锚点：生产是否已有 rdm 子系统与菜单（决定首次启动的工作量）    │
-- └────────────────────────────────────────────────────────────┘
SELECT COUNT(*) AS rdm_menus, SUM(system_code = 'rdm') AS rdm_by_code
FROM sys_menu WHERE deleted = 0 AND (system_code = 'rdm' OR menu_key LIKE 'rdm%');
SELECT system_code, COUNT(*) AS cnt FROM sys_department_system GROUP BY system_code;
-- 期望：rdm_menus ≥ 22（当前种子菜单数）。若为 0/很少，说明生产还没装 RDM，
-- 那这次要先做的是完整安装而不是菜单切换。

-- ┌─ 风险 6 ──────────────────────────────────────────────┐
-- │ 阶段 3-6 的结构补丁能否在生产跑通：已记账版本 + 放行链路的列与种子      │
-- └────────────────────────────────────────────────────────────┘
SELECT version_key, applied_at FROM sys_schema_version
WHERE version_key LIKE 'rdm:%' ORDER BY version_key;
-- 期望：生产最多到 rdm:schema:v2.x 的早期版本；缺的都由本次启动补齐（v1.5→v2.4 + 菜单 v3.11）。

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'rdm_release' AND COLUMN_NAME IN ('applicant_emp_no', 'expire_at', 'checks_json'))
    OR (TABLE_NAME = 'rdm_hr_suggestion' AND COLUMN_NAME = 'budget_used_ratio')
    OR (TABLE_NAME = 'rdm_requirement' AND COLUMN_NAME IN ('flow_version', 'actual_release_date', 'complexity'))
    OR (TABLE_NAME = 'hr_perf_score_item' AND COLUMN_NAME IN ('suggested_score', 'suggested_source', 'suggested_at')));
-- 关键：budget_used_ratio 必须是 decimal(9,2)（v2.3 扩列）。仍是 decimal(5,2) 且生产已有
-- 占用超 999.99% 的预算配置时，聚合建议会在生产重演 Out of range。

SELECT rule_key, status FROM sys_biz_seq_rule WHERE rule_key IN ('rdm_release', 'rdm_acceptance', 'rdm_prd');
-- 期望：rdm_release 存在且 status=1，否则发起放行会报「編號生成規則未配置」。

SELECT dict_type, code, name, status FROM sys_hr_dict
WHERE dict_type = 'PERF_INDICATOR_TYPE' AND deleted = 0 ORDER BY sort_order;
-- 期望：含 RDM_OUTPUT（v2.4 注册）。缺失则 RDM 建议推送通道在生产配不出来。

-- ┌─ 风险 7 ──────────────────────────────────────────────┐
-- │ 生产是否有会在断言上炸的脏数据：同名重复需求编号、孤儿里程碑等         │
-- └────────────────────────────────────────────────────────────┘
SELECT COUNT(*) AS dup_prd_no FROM (
  SELECT prd_no FROM rdm_prd WHERE deleted = 0 GROUP BY prd_no HAVING COUNT(*) > 1
) t;
SELECT COUNT(*) AS dup_acceptance_attempt FROM (
  SELECT req_id, stage, attempt FROM rdm_acceptance WHERE deleted = 0
  GROUP BY req_id, stage, attempt HAVING COUNT(*) > 1
) t;
-- 第二条非 0 时 v1.9 的轮次唯一键会被跳过并 log.warn（不会炸，但要知情）。

-- ┌─ 附：数据体量参考（只为评估重算/快照耗时，不影响能否启动）──┐
SELECT
  (SELECT COUNT(*) FROM rdm_requirement WHERE deleted = 0)    AS requirements,
  (SELECT COUNT(*) FROM rdm_work_task WHERE deleted = 0)      AS tasks,
  (SELECT COUNT(*) FROM rdm_score_record WHERE deleted = 0)   AS score_records,
  (SELECT COUNT(*) FROM rdm_metric_snapshot)                  AS metric_snapshots;
