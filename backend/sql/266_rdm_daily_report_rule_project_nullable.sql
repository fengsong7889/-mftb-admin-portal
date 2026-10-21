-- 266: 日报推送规则允许不挂项目（未挂项目的迭代，如紧急修复）
--
-- 参照文档：实际幂等执行由 RdmSchemaMigrationInitializer 的 rdm:schema:v3.20 负责
-- （MODIFY COLUMN 可重放，仍由 applyOnce 门控 + 后置 IS_NULLABLE 校验，缺一则不记版本）。
--
-- 背景：v3.19 的规则模型是「项目 + 可选迭代」，project_id NOT NULL；
-- 但迭代排期（v3.15）允许紧急修复（hotfix）迭代不挂项目。
-- 用户选到这类迭代时，规则应以迭代为唯一范围保存，不要求也不允许再指定项目。
-- 只放宽可空性，不动列上数据与 idx_rdm_daily_report_rule_project 索引，属非破坏性变更。
ALTER TABLE rdm_daily_report_rule
    MODIFY COLUMN project_id BIGINT DEFAULT NULL
        COMMENT '目标项目ID（来自项目总览）；NULL=规则只以未挂项目的迭代（紧急修复）为范围';

-- 回滚（如需）：先清理无项目规则，再收紧约束——
--   DELETE FROM rdm_daily_report_rule WHERE project_id IS NULL;
--   ALTER TABLE rdm_daily_report_rule MODIFY COLUMN project_id BIGINT NOT NULL COMMENT '目标项目ID（来自项目总览）';
