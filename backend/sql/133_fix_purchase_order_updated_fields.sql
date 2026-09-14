-- =====================================================================
-- 133_fix_purchase_order_updated_fields.sql
-- 1. 修復採購訂單：為已有記錄補填 updated_by / updated_at
-- 2. 訂單編號規則變更：前綴 PO → DDCG（DDCG+年月日+4位自增序號）
--
-- 注意：每條語句獨立執行，表不存在時該條會報錯，跳過即可
-- =====================================================================

-- ── 1. 修復 updated_at（表不存在則跳過） ────────────────────────────
UPDATE biz_eam_purchase_order
SET updated_at = COALESCE(
    NULLIF(updated_at, '0000-00-00 00:00:00'),
    created_at,
    NOW()
)
WHERE updated_at IS NULL
   OR updated_at = '0000-00-00 00:00:00';

-- ── 2. 修復 updated_by（表不存在則跳過） ────────────────────────────
UPDATE biz_eam_purchase_order
SET updated_by = CASE
    WHEN purchaser IS NOT NULL AND purchaser != '' THEN purchaser
    ELSE 'system'
END
WHERE updated_by IS NULL
   OR updated_by = '';

-- ── 3. 更新編號生成規則：前綴 PO → DDCG ─────────────────────────────
UPDATE sys_biz_seq_rule
SET prefix     = 'DDCG',
    remark     = '{prefix} + YYYYMMDD + {n}位自增序號'
WHERE rule_key = 'eam_purchase_order';

-- ── 4. 清理舊前綴的序號計數（sys_biz_seq 表） ───────────────────────
DELETE FROM sys_biz_seq WHERE prefix = 'PO';
