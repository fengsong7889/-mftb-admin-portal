-- 285: ai_quota_config 补「最后更新人」
--
-- 说明：本文件为一次性参考文档，真实 DDL 内联在
-- AiQuotaConfigUpdatedByInitializer（ai:quota-config-updated-by-v1.0）中，不参与启动执行。
--
-- 背景：员工专属额度 / 部门额度的列表已经展示「最後更新時間」，但同一张表没有
-- updated_by，改完额度后无法回答「是谁改的」。本次只补一列，旧代码忽略新列。
--
-- 幂等：ADD COLUMN 由 Java 迁移先查 INFORMATION_SCHEMA；无 DROP / 无删列。

ALTER TABLE ai_quota_config
    ADD COLUMN updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人(姓名)'
    AFTER status;
