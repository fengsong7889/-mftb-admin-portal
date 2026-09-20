-- 175: 清空无领用记录但手动填写了使用人信息的资产数据
-- 场景：资产台账手动填写了使用人，但领用资产菜单无对应领用记录，
--       导致数据不一致（有使用人但无 activeClaimId）。
-- 修复：将 user_name / department / usage_date / current_holder_id / active_claim_id 清空，
--       并将 status 恢复为 idle。

UPDATE biz_eam_asset
SET user_name = NULL,
    department = NULL,
    usage_date = NULL,
    current_holder_id = NULL,
    active_claim_id = NULL,
    status = 'idle',
    updated_by = 'system',
    updated_at = NOW()
WHERE asset_no = 'XX-M-01-01-0001'
  AND deleted = 0
  AND active_claim_id IS NULL;
