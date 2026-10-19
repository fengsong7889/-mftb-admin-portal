-- 263: rdm_status_def.stage 由旧 6 段细化为 9 段（研发/测试分开、PRD设计/评审排期分开、验收/上线分开）
-- 参考文档：实际执行由 RdmSchemaMigrationInitializer 走 rdm:schema:v3.17
--          （按 code 定位的幂等 UPDATE + 后置校验「无旧值残留 + 关键分档已生效」）完成。
--
-- 为什么要做：详情页状态条与需求看板列已改为 9 段（前端 RDM_STATUS_STAGE 为真值），
--   但本表 stage 仍是旧 6 段值，于是看板「各階段平均停留」按旧口径聚合、
--   需求配置页「所屬階段」显示旧阶段名 —— 同一需求在两处给出两套阶段说法。本迁移把两侧收同源。
--
-- 幂等口径：按 code 精确定位（code 有 uk_rdm_status_code 唯一键），且 WHERE 带上旧 stage 值 ——
--   管理员若在「需求配置」页自定义过阶段，不会被本迁移覆盖。重跑不产生二次变更。
-- 不做破坏性操作：只 UPDATE 既有行的 stage 列，不动 code/label/sort_order/final_flag/status。

-- product → design / review（产品写 PRD 与 研发评审排期 是两个不同催法）
UPDATE rdm_status_def SET stage = 'design' WHERE code = 'accepted'       AND stage = 'product';
UPDATE rdm_status_def SET stage = 'design' WHERE code = 'prd_designing'  AND stage = 'product';
UPDATE rdm_status_def SET stage = 'review' WHERE code = 'reviewing'      AND stage = 'product';
UPDATE rdm_status_def SET stage = 'review' WHERE code = 'review_passed'  AND stage = 'product';

-- delivery → dev / test（本次核心诉求：分不清是研发卡住还是测试卡住）
-- 「已排期」归 dev 段开头：PM 关心的是「排进去了为什么还没开工」，归 review 会误读成评审未完。
UPDATE rdm_status_def SET stage = 'dev'    WHERE code = 'scheduled'      AND stage = 'delivery';
UPDATE rdm_status_def SET stage = 'dev'    WHERE code = 'designing'      AND stage = 'delivery';
UPDATE rdm_status_def SET stage = 'dev'    WHERE code = 'developing'     AND stage = 'delivery';
UPDATE rdm_status_def SET stage = 'dev'    WHERE code = 'integration'    AND stage = 'delivery';
UPDATE rdm_status_def SET stage = 'test'   WHERE code = 'testing'        AND stage = 'delivery';
UPDATE rdm_status_def SET stage = 'test'   WHERE code = 'test_passed'    AND stage = 'delivery';

-- acceptance → uat / release（卡在业务验收 vs 已上线待归档 是两件事）
UPDATE rdm_status_def SET stage = 'uat'     WHERE code = 'uat_pending'   AND stage = 'acceptance';
UPDATE rdm_status_def SET stage = 'uat'     WHERE code = 'uat_rejected'  AND stage = 'acceptance';
UPDATE rdm_status_def SET stage = 'release' WHERE code = 'released'      AND stage = 'acceptance';
UPDATE rdm_status_def SET stage = 'release' WHERE code = 'verified'      AND stage = 'acceptance';
UPDATE rdm_status_def SET stage = 'release' WHERE code = 'closed'        AND stage = 'acceptance';

-- 保持不变的 8 行（draft=submit / intake_pending,intake_rejected=intake /
-- pool,assigned,evaluating,rejected,on_hold=dispatch）无需 UPDATE。

-- 遗留描述（故意不在本脚本修）：rdm_status_def.stage 的列 COMMENT 仍写着
--   '所属阶段: submit/intake/dispatch/product/delivery/acceptance'
-- 它来自历史建表文件 204_rdm_core_tables.sql，而规则禁止修改已发布的迁移脚本；
-- 且改 COMMENT 需 ALTER TABLE ... MODIFY 重写列定义，风险与收益不成比例。
-- 实际值域以本迁移后的 9 段为准：
--   submit / intake / dispatch / design / review / dev / test / uat / release
-- 后续新增状态行时，种子里的 stage 必须写这 9 个值之一。
