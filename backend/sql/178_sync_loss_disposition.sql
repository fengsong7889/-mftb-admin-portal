-- 178: 修复历史数据——归还处置=遗失核销时同步更新遗失单状态
-- 此前 dispose() 方法遗漏了遗失单状态同步，导致遗失单仍为 searching 状态
-- Java 迁移: EamSchemaMigrationInitializer.syncLossDispositionFromReturn() (v27)

UPDATE biz_eam_loss l
INNER JOIN biz_eam_return r ON l.return_id = r.id
SET l.status = 'written_off',
    l.write_off_date = r.disposition_date,
    l.write_off_reason = '歸還處置遺失核銷（歷史數據修復）',
    l.updated_at = NOW()
WHERE l.status = 'searching'
  AND r.asset_condition = 'lost'
  AND r.disposition = 'written_off'
  AND l.deleted = 0 AND r.deleted = 0;
