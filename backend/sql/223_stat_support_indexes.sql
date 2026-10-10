-- 223: 统计口径收口所需的支撑索引（领用员工汇总 / 用车超时未还）
--
-- 背景：列表页统计卡从「前端拉全量再算」收口为「服务端按当前筛选条件出数」后，
-- 计数与聚合改由数据库承担。原有索引覆盖不到新的查询形态，数据量增长后会退化成
-- 大范围回表扫描，正是本次要消除的问题。
--
-- 实际幂等执行由 Java 迁移负责（见下方「执行入口」），本文件是一次性参考文档。

-- 1) 领用员工汇总：biz_eam_claim
--    查询形态：WHERE deleted = 0 AND employee_id IN (...) GROUP BY employee_id
--              并对 status / signature_status / claim_date 做条件求和
--    原有 idx_employee / idx_status / idx_signature 均为单列索引，只能定住一个前缀，
--    其余列全部回表；覆盖索引可让聚合走 index-only 扫描。
--    执行入口：EamSchemaMigrationInitializer#addClaimSummaryIndex
--             （versionKey = eam:schema-v35-claim-summary-index）
ALTER TABLE biz_eam_claim
    ADD INDEX idx_claim_emp_summary (employee_id, deleted, status, signature_status, claim_date);

-- 2) 用车超时未还统计：biz_vehicle_use
--    查询形态：status IN ('in_use','to_confirm') AND planned_end < NOW()
--    已有 idx_vehicle_use_status 的第二列是 planned_start，定不住 planned_end；
--    待办统计改为服务端出数后这条 COUNT 每次进入办理页都会执行。
--    执行入口：VehicleSchemaMigrationInitializer#repairSchema（REQUIRED_INDEXES，每次启动先查后加）
ALTER TABLE biz_vehicle_use
    ADD INDEX idx_vehicle_use_overdue (status, planned_end);

-- 回滚（仅在索引造成写入劣化时执行；两条都是纯新增索引，删除不影响数据）：
-- DROP INDEX idx_claim_emp_summary ON biz_eam_claim;
-- DROP INDEX idx_vehicle_use_overdue ON biz_vehicle_use;
