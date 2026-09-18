-- =====================================================================
-- 161_eam_consumable_refactor.sql
-- 耗材管理二期：分类/品牌/计量单位独立化 + 领用流程简化
--
-- 设计要点：
--   1. biz_consumable_category  — 耗材独立分类体系（与 biz_eam_category 物理隔离）
--   2. biz_consumable_brand     — 耗材独立品牌库（含 category_type 标记 ASSET/CONSUMABLE/BOTH）
--   3. biz_consumable_unit      — 计量单位字典（替代前端硬编码）
--   4. biz_eam_consumable_item  — 新增 consumable_category_id / brand_id 字段
--   5. 菜单：耗材管理分组下新增 3 个基础配置子菜单
--   6. 种子数据：10 个默认计量单位
-- =====================================================================

-- ── 1. 耗材分类（独立于资产分类 biz_eam_category） ────────────────────
CREATE TABLE IF NOT EXISTS biz_consumable_category (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    code        VARCHAR(64)  NOT NULL COMMENT '分类编码（唯一）',
    name        VARCHAR(100) NOT NULL COMMENT '分类名称',
    parent_id   BIGINT       DEFAULT 0 COMMENT '父分类 ID（0=顶级）',
    sort_order  INT          DEFAULT 0 COMMENT '排序',
    status      VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
    remark      VARCHAR(500) DEFAULT '' COMMENT '备注',
    created_by  VARCHAR(64)  DEFAULT '' COMMENT '创建人',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by  VARCHAR(64)  DEFAULT '' COMMENT '最后更新人',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted     TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_code (code),
    KEY idx_parent (parent_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材分类（独立于资产分类）';

-- ── 2. 耗材品牌（独立于资产品牌 biz_eam_brand） ──────────────────────
CREATE TABLE IF NOT EXISTS biz_consumable_brand (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    name          VARCHAR(100) NOT NULL COMMENT '品牌名称',
    name_en       VARCHAR(100) DEFAULT '' COMMENT '英文名',
    category_type VARCHAR(20)  NOT NULL DEFAULT 'CONSUMABLE' COMMENT 'ASSET/CONSUMABLE/BOTH',
    logo          VARCHAR(500) DEFAULT '' COMMENT '品牌 Logo URL',
    status        VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
    remark        VARCHAR(500) DEFAULT '' COMMENT '备注',
    created_by    VARCHAR(64)  DEFAULT '' COMMENT '创建人',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by    VARCHAR(64)  DEFAULT '' COMMENT '最后更新人',
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted       TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_name (name),
    KEY idx_type (category_type),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材品牌（含 ASSET/CONSUMABLE/BOTH 标记）';

-- ── 3. 计量单位字典 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS biz_consumable_unit (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    name       VARCHAR(32) NOT NULL COMMENT '单位名称（如：個、盒）',
    abbr       VARCHAR(16) DEFAULT '' COMMENT '缩写（如：pcs、box）',
    sort_order INT         DEFAULT 0 COMMENT '排序',
    status     VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
    created_by VARCHAR(64) DEFAULT '' COMMENT '创建人',
    created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(64) DEFAULT '' COMMENT '最后更新人',
    updated_at DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted    TINYINT     NOT NULL DEFAULT 0,
    UNIQUE KEY uk_name (name),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材计量单位字典';

-- ── 4. 耗材主数据表增加分类/品牌关联字段 ─────────────────────────────
ALTER TABLE biz_eam_consumable_item
    ADD COLUMN IF NOT EXISTS consumable_category_id BIGINT DEFAULT NULL COMMENT '耗材分类 ID（biz_consumable_category）',
    ADD COLUMN IF NOT EXISTS brand_id BIGINT DEFAULT NULL COMMENT '耗材品牌 ID（biz_consumable_brand）',
    ADD KEY IF NOT EXISTS idx_consumable_category (consumable_category_id),
    ADD KEY IF NOT EXISTS idx_brand (brand_id);

-- ── 5. 计量单位种子数据 ──────────────────────────────────────────────
INSERT IGNORE INTO biz_consumable_unit (name, abbr, sort_order, status, created_by, updated_by)
VALUES
    ('個', 'pcs', 1, 'enabled', 'system', 'system'),
    ('支', 'pcs', 2, 'enabled', 'system', 'system'),
    ('盒', 'box', 3, 'enabled', 'system', 'system'),
    ('包', 'pack', 4, 'enabled', 'system', 'system'),
    ('箱', 'ctn', 5, 'enabled', 'system', 'system'),
    ('瓶', 'btl', 6, 'enabled', 'system', 'system'),
    ('卷', 'roll', 7, 'enabled', 'system', 'system'),
    ('張', 'sheet', 8, 'enabled', 'system', 'system'),
    ('套', 'set', 9, 'enabled', 'system', 'system'),
    ('袋', 'bag', 10, 'enabled', 'system', 'system');

-- ── 6. 耗材分类种子数据（常见耗材分类） ──────────────────────────────
INSERT IGNORE INTO biz_consumable_category (code, name, parent_id, sort_order, status, created_by, updated_by)
VALUES
    ('HC01', '辦公文具', 0, 1, 'enabled', 'system', 'system'),
    ('HC02', '辦公設備耗材', 0, 2, 'enabled', 'system', 'system'),
    ('HC03', '清潔用品', 0, 3, 'enabled', 'system', 'system'),
    ('HC04', '勞保用品', 0, 4, 'enabled', 'system', 'system'),
    ('HC05', '水電物料', 0, 5, 'enabled', 'system', 'system'),
    ('HC06', '其他', 0, 99, 'enabled', 'system', 'system');

-- ── 7. 耗材品牌种子数据 ──────────────────────────────────────────────
INSERT IGNORE INTO biz_consumable_brand (name, name_en, category_type, status, created_by, updated_by)
VALUES
    ('得力', 'Deli', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('晨光', 'M&G', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('真彩', 'Truecolor', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('廣博', 'GuangBo', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('齊心', 'Comix', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('惠普', 'HP', 'BOTH', 'enabled', 'system', 'system'),
    ('佳能', 'Canon', 'BOTH', 'enabled', 'system', 'system'),
    ('愛普生', 'Epson', 'BOTH', 'enabled', 'system', 'system'),
    ('兄弟', 'Brother', 'BOTH', 'enabled', 'system', 'system'),
    ('維達', 'Vinda', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('清風', 'Breeze', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('藍月亮', 'BlueMoon', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('立白', 'Liby', 'CONSUMABLE', 'enabled', 'system', 'system'),
    ('3M', '3M', 'BOTH', 'enabled', 'system', 'system');

-- ── 8. 菜单：耗材管理分组下新增 3 个基础配置子菜单 ────────────────────
-- 耗材分类管理
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, path, component, type, sort_order, icon, actions, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-category', '耗材分類管理', '/consumable-category', 'ConsumableCategory', 2, 6, 'AppstoreOutlined',
       '["view","create","edit","delete"]', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'consumable-ops' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-category' AND deleted = 0);

-- 耗材品牌管理
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, path, component, type, sort_order, icon, actions, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-brand', '耗材品牌管理', '/consumable-brand', 'ConsumableBrand', 2, 7, 'TagOutlined',
       '["view","create","edit","delete"]', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'consumable-ops' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-brand' AND deleted = 0);

-- 计量单位管理
INSERT IGNORE INTO sys_menu (parent_id, menu_key, name, path, component, type, sort_order, icon, actions, status, deleted, created_by, updated_by)
SELECT p.id, 'consumable-unit', '計量單位管理', '/consumable-unit', 'ConsumableUnit', 2, 8, 'ColumnWidthOutlined',
       '["view","create","edit","delete"]', 1, 0, 'system', 'system'
FROM sys_menu p WHERE p.menu_key = 'consumable-ops' AND p.deleted = 0
AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_key = 'consumable-unit' AND deleted = 0);

-- ── 9. admin 角色授权新菜单 ──────────────────────────────────────────
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions)
SELECT r.id, m.id, '["view","create","edit","delete"]'
FROM sys_role r, sys_menu m
WHERE r.code = 'admin'
  AND m.menu_key IN ('consumable-category', 'consumable-brand', 'consumable-unit')
  AND m.deleted = 0;

-- ── 10. 验证 ─────────────────────────────────────────────────────────
SELECT p.menu_key AS group_key, c.menu_key, c.name, c.sort_order
FROM sys_menu c JOIN sys_menu p ON c.parent_id = p.id
WHERE p.menu_key = 'consumable-ops' AND c.deleted = 0
ORDER BY c.sort_order;
