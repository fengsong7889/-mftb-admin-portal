-- ============================================================
-- MFTB 搜广推系统 - 菜单配置表迁移
-- 兼容 01_init_system.sql 中已有的 sys_menu 定义
-- 首次启动时 DataInitializer 会自动完成等效迁移, 本脚本供手动执行参考
-- ============================================================

-- 1. 若表不存在则按新结构创建
CREATE TABLE IF NOT EXISTS sys_menu (
    id         BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    parent_id  BIGINT       NULL                       COMMENT '父菜单ID, 顶级为 NULL',
    menu_key   VARCHAR(64)  NOT NULL                   COMMENT '菜单标识, 用于权限判断与前端路由key',
    name       VARCHAR(50)  NOT NULL                   COMMENT '菜单名称',
    path       VARCHAR(200) NULL                       COMMENT '路由路径',
    component  VARCHAR(200) NULL                       COMMENT '前端组件路径',
    icon       VARCHAR(100) NULL                       COMMENT '图标',
    type       TINYINT      NULL                       COMMENT '类型: 1=目录 2=菜单 3=按钮',
    sort_order INT          DEFAULT 0                  COMMENT '排序',
    actions    TEXT         NULL                       COMMENT '可用操作 JSON数组: ["view","create","edit","delete"]',
    status     TINYINT      DEFAULT 1                  COMMENT '状态: 1=启用 0=停用',
    updated_by VARCHAR(64)  NULL                       COMMENT '最后更新人',
    deleted    TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE INDEX uk_menu_key (menu_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统菜单配置表';

-- 2. 兼容旧结构: 补充新列
SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_menu ADD COLUMN menu_key VARCHAR(64) NULL COMMENT ''菜单标识, 用于权限判断与前端路由key'' AFTER parent_id',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND COLUMN_NAME = 'menu_key');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_menu ADD COLUMN component VARCHAR(200) NULL COMMENT ''前端组件路径'' AFTER path',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND COLUMN_NAME = 'component');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_menu ADD COLUMN actions TEXT NULL COMMENT ''可用操作 JSON数组'' AFTER sort_order',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND COLUMN_NAME = 'actions');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_menu ADD COLUMN updated_by VARCHAR(64) NULL COMMENT ''最后更新人'' AFTER status',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND COLUMN_NAME = 'updated_by');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 为存量数据生成 menu_key 并去重
UPDATE sys_menu SET menu_key = CONCAT('menu_', id) WHERE menu_key IS NULL OR menu_key = '';
UPDATE sys_menu m2 JOIN sys_menu m1 ON m1.id < m2.id AND m1.menu_key = m2.menu_key
    SET m2.menu_key = CONCAT(m2.menu_key, '_', m2.id);

-- 4. 确保 menu_key 非空并建立唯一索引
ALTER TABLE sys_menu MODIFY COLUMN menu_key VARCHAR(64) NOT NULL COMMENT '菜单标识, 用于权限判断与前端路由key';
SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_menu ADD UNIQUE INDEX uk_menu_key (menu_key)',
    'SELECT 1') FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND INDEX_NAME = 'uk_menu_key');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
