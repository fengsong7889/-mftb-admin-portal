-- =====================================================================
-- 148: 資產台賬編號規則重構
--   1. 分類編碼遷移：舊長碼 (10001/10001001) → 每級2位全路径碼 (01/0101)
--   2. 級聯更新引用分類編碼的表：biz_eam_brand / biz_eam_model / biz_eam_asset
--   3. biz_eam_asset 新增 company_brand 列（公司品牌 1=閃蜂/TB, 2=mFood/MF）
--   4. 資產編號格式：{品牌編碼}-{倉庫編碼}-{分類碼}-{4位分類內序號}
--      示例：TB-ZH-0101-0001（閃蜂-珠海倉庫-手機分類-第1台）
-- 注意：
--   - 已有資產編號 (FA20260916xxx) 保留不動，僅新創資產使用新格式
--   - 分類編碼遷移後，前端分類樹展示的 code 也會同步變更
-- =====================================================================

-- ── 1. 分類編碼遷移 ─────────────────────────────────────────────

-- L1 分類（先改一級，避免與 L2 舊碼前綴衝突）
-- 使用臨時碼過渡：先改為带前缀的临时码，再改为目标码
UPDATE biz_eam_category SET code = '04' WHERE code = '10004' AND parent_id = 0;
UPDATE biz_eam_category SET code = '03' WHERE code = '10003' AND parent_id = 0;
UPDATE biz_eam_category SET code = '02' WHERE code = '10002' AND parent_id = 0;
UPDATE biz_eam_category SET code = '01' WHERE code = '10001' AND parent_id = 0;

-- L2 分類（直接改，因 L1 已改完不會衝突）
UPDATE biz_eam_category SET code = '0104' WHERE code = '10001004';
UPDATE biz_eam_category SET code = '0103' WHERE code = '10001003';
UPDATE biz_eam_category SET code = '0102' WHERE code = '10001002';
UPDATE biz_eam_category SET code = '0101' WHERE code = '10001001';
UPDATE biz_eam_category SET code = '0202' WHERE code = '10002002';
UPDATE biz_eam_category SET code = '0201' WHERE code = '10002001';
UPDATE biz_eam_category SET code = '0302' WHERE code = '10003002';
UPDATE biz_eam_category SET code = '0301' WHERE code = '10003001';

-- ── 2. 級聯更新引用表 ───────────────────────────────────────────

-- biz_eam_brand.category_code
UPDATE biz_eam_brand SET category_code = '04' WHERE category_code = '10004';
UPDATE biz_eam_brand SET category_code = '03' WHERE category_code = '10003';
UPDATE biz_eam_brand SET category_code = '02' WHERE category_code = '10002';
UPDATE biz_eam_brand SET category_code = '01' WHERE category_code = '10001';
UPDATE biz_eam_brand SET category_code = '0104' WHERE category_code = '10001004';
UPDATE biz_eam_brand SET category_code = '0103' WHERE category_code = '10001003';
UPDATE biz_eam_brand SET category_code = '0102' WHERE category_code = '10001002';
UPDATE biz_eam_brand SET category_code = '0101' WHERE category_code = '10001001';
UPDATE biz_eam_brand SET category_code = '0202' WHERE category_code = '10002002';
UPDATE biz_eam_brand SET category_code = '0201' WHERE category_code = '10002001';
UPDATE biz_eam_brand SET category_code = '0302' WHERE category_code = '10003002';
UPDATE biz_eam_brand SET category_code = '0301' WHERE category_code = '10003001';

-- biz_eam_model.category_code
UPDATE biz_eam_model SET category_code = '04' WHERE category_code = '10004';
UPDATE biz_eam_model SET category_code = '03' WHERE category_code = '10003';
UPDATE biz_eam_model SET category_code = '02' WHERE category_code = '10002';
UPDATE biz_eam_model SET category_code = '01' WHERE category_code = '10001';
UPDATE biz_eam_model SET category_code = '0104' WHERE category_code = '10001004';
UPDATE biz_eam_model SET category_code = '0103' WHERE category_code = '10001003';
UPDATE biz_eam_model SET category_code = '0102' WHERE category_code = '10001002';
UPDATE biz_eam_model SET category_code = '0101' WHERE category_code = '10001001';
UPDATE biz_eam_model SET category_code = '0202' WHERE category_code = '10002002';
UPDATE biz_eam_model SET category_code = '0201' WHERE category_code = '10002001';
UPDATE biz_eam_model SET category_code = '0302' WHERE category_code = '10003002';
UPDATE biz_eam_model SET category_code = '0301' WHERE category_code = '10003001';

-- biz_eam_asset.category_code
UPDATE biz_eam_asset SET category_code = '04' WHERE category_code = '10004';
UPDATE biz_eam_asset SET category_code = '03' WHERE category_code = '10003';
UPDATE biz_eam_asset SET category_code = '02' WHERE category_code = '10002';
UPDATE biz_eam_asset SET category_code = '01' WHERE category_code = '10001';
UPDATE biz_eam_asset SET category_code = '0104' WHERE category_code = '10001004';
UPDATE biz_eam_asset SET category_code = '0103' WHERE category_code = '10001003';
UPDATE biz_eam_asset SET category_code = '0102' WHERE category_code = '10001002';
UPDATE biz_eam_asset SET category_code = '0101' WHERE category_code = '10001001';
UPDATE biz_eam_asset SET category_code = '0202' WHERE category_code = '10002002';
UPDATE biz_eam_asset SET category_code = '0201' WHERE category_code = '10002001';
UPDATE biz_eam_asset SET category_code = '0302' WHERE category_code = '10003002';
UPDATE biz_eam_asset SET category_code = '0301' WHERE category_code = '10003001';

-- ── 3. biz_eam_asset 新增 company_brand 列 ──────────────────────

ALTER TABLE biz_eam_asset
    ADD COLUMN company_brand TINYINT DEFAULT NULL COMMENT '公司品牌：1=閃蜂(TB), 2=mFood(MF)' AFTER batch_id;
