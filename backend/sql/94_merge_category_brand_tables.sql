-- =====================================================
-- 方案二：合并分类/品牌表 + 删除计量单位菜单
-- 版本：v1.0
-- 说明：
-- 1. 合并 biz_consumable_category 到 biz_eam_category（新增 biz_type 字段）
-- 2. 合并 biz_consumable_brand 到 biz_eam_brand（新增 biz_type 字段）
-- 3. 删除 biz_consumable_unit 表
-- 4. 更新菜单结构
-- =====================================================

-- =====================================================
-- 1. 合并分类表
-- =====================================================

-- 1.1 给 biz_eam_category 添加 biz_type 字段（如果不存在）
ALTER TABLE biz_eam_category 
ADD COLUMN IF NOT EXISTS biz_type VARCHAR(20) DEFAULT 'ASSET' COMMENT '业务类型：ASSET-资产, CONSUMABLE-耗材';

-- 1.2 将 biz_consumable_category 数据迁移到 biz_eam_category
INSERT INTO biz_eam_category (category_code, category_name, parent_id, biz_type, sort_order, created_at, updated_at)
SELECT category_code, category_name, parent_id, 'CONSUMABLE', sort_order, created_at, updated_at
FROM biz_consumable_category
ON DUPLICATE KEY UPDATE biz_type = 'CONSUMABLE';

-- 1.3 删除 biz_consumable_category 表（数据已迁移）
DROP TABLE IF EXISTS biz_consumable_category;

-- =====================================================
-- 2. 合并品牌表
-- =====================================================

-- 2.1 给 biz_eam_brand 添加 biz_type 字段（如果不存在）
ALTER TABLE biz_eam_brand 
ADD COLUMN IF NOT EXISTS biz_type VARCHAR(20) DEFAULT 'ASSET' COMMENT '业务类型：ASSET-资产, CONSUMABLE-耗材';

-- 2.2 将 biz_consumable_brand 数据迁移到 biz_eam_brand
INSERT INTO biz_eam_brand (brand_name, biz_type, unit, sort_order, created_at, updated_at)
SELECT brand_name, 
       CASE 
           WHEN category_type = 'ASSET' THEN 'ASSET'
           WHEN category_type = 'CONSUMABLE' THEN 'CONSUMABLE'
           ELSE 'ASSET'
       END as biz_type,
       unit, sort_order, created_at, updated_at
FROM biz_consumable_brand
ON DUPLICATE KEY UPDATE biz_type = VALUES(biz_type);

-- 2.3 删除 biz_consumable_brand 表（数据已迁移）
DROP TABLE IF EXISTS biz_consumable_brand;

-- =====================================================
-- 3. 删除计量单位表
-- =====================================================

-- 3.1 删除 biz_consumable_unit 表
DROP TABLE IF EXISTS biz_consumable_unit;

-- =====================================================
-- 4. 更新菜单结构
-- =====================================================

-- 4.1 删除旧的菜单项（耗材基础数据、计量单位管理）
DELETE FROM sys_menu WHERE menu_name IN ('耗材基础数据', '计量单位管理');

-- 4.2 更新菜单名称（基础数据 -> 资产基础配置）
UPDATE sys_menu SET menu_name = '资产基础配置' WHERE menu_name = '基础数据';

-- 4.3 删除旧的子菜单（耗材分类库、耗材产品库）
DELETE FROM sys_menu WHERE menu_name IN ('耗材分类库', '耗材产品库');

-- 4.4 更新子菜单名称（分类库、品牌产品库）
UPDATE sys_menu SET menu_name = '分类库' WHERE menu_name = '资产分类库';
UPDATE sys_menu SET menu_name = '品牌产品库' WHERE menu_name = '品牌产品库';

-- =====================================================
-- 5. 记录迁移版本
-- =====================================================

INSERT INTO sys_schema_version (version_key, applied_at)
VALUES ('eam:merge-category-brand-v1.0', NOW())
ON DUPLICATE KEY UPDATE applied_at = NOW();
