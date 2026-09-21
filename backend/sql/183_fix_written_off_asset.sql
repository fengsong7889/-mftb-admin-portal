-- 183: 校正归还处置为「遗失核销」但资产台账仍停留在 in_use 的异常数据
-- 场景：归还验收选择「遗失」并核销(written_off)后，历史逻辑只更新了遗失单状态，
--       未同步资产台账，导致资产仍显示 in_use / current_holder_id / active_claim_id 残留，
--       交接页按持有人查询时会多显示已核销的资产（如职员办公桌 TB-Z-02-01-0007）。
-- 修复：将「关联遗失单已核销(written_off)」但仍 in_use 的资产置为 written_off 终态，
--       并清除持有人/使用人/领用关联。幂等：仅命中 status='in_use' 的行。
-- 实际幂等保证由 Java 迁移 EamSchemaMigrationInitializer v32 负责。

UPDATE biz_eam_asset a
INNER JOIN biz_eam_loss l
    ON l.asset_id = a.id AND l.status = 'written_off' AND l.deleted = 0
SET a.status = 'written_off',
    a.current_holder_id = NULL,
    a.user_name = NULL,
    a.active_claim_id = NULL,
    a.updated_by = 'system',
    a.updated_at = NOW()
WHERE a.status = 'in_use'
  AND a.deleted = 0;
