-- 222: 耗材领用单回填承担部门 ID（department_id）
--
-- 背景：EamConsumableClaimServiceImpl.submit() 只写了部门名称快照 department，
--       从未写入 department_id，导致该列在存量库里全部为 NULL：
--         1) 列表页「所属部门」筛选必然落空（NULL 不等于任何部门 ID）；
--         2) 出库时写入流水表 txn.department_id 的成本归集字段同样为 NULL。
--       代码侧已同步修复：提交时写入 applicant 的 department_id，并在
--       ConsumableSchemaInitializer 用 applyOnce + 后置校验自动回填。
--
-- 真值定义处：ConsumableSchemaInitializer#backfillClaimDepartmentId
--             （versionKey = consumable:claim-dept-backfill-v1.0，一次性执行）。
-- 因此本脚本对已初始化的库是「可跳过」的——重启即自动对齐；保留脚本仅为
-- 让 DBA 在不便重启时手工核对，以及作为变更留档。
--
-- 幂等性：WHERE department_id IS NULL 保证重复执行安全；
--         显式写 updated_at = updated_at，避免 ON UPDATE CURRENT_TIMESTAMP
--         把历史单据的最后更新时间改写成迁移时间。

UPDATE biz_eam_consumable_claim c
JOIN sys_user u ON u.id = c.applicant_id
SET c.department_id = u.department_id,
    c.updated_by = 'system',
    c.updated_at = c.updated_at
WHERE c.department_id IS NULL
  AND u.department_id IS NOT NULL;

-- 核对：结果必须为 0，否则说明仍有申请人有部门而领用单缺部门 ID 的残留
SELECT COUNT(*) AS remaining_null_dept
FROM biz_eam_consumable_claim c
JOIN sys_user u ON u.id = c.applicant_id
WHERE c.department_id IS NULL
  AND u.department_id IS NOT NULL;
