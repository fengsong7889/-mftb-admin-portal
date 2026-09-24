-- 192: 统一门户与分系统改造 · 基础结构（阶段 B）
-- 参考文档：docs/system-portal/inventory.md
-- 关联方案：统一门户_分系统_权限改造_bcdcf6bc.md
--
-- 生产实际执行由 com.mftb.admin.config.SystemPortalSchemaInitializer 通过
-- SchemaVersionTracker.applyOnce('core:system-portal:v1.0', doMigrate, verify) 完成，
-- 本文件仅作为一次性参考文档，不参与自动执行。

-- 1. 系统清单
CREATE TABLE IF NOT EXISTS sys_system (
  code VARCHAR(32) PRIMARY KEY COMMENT '系统编码，唯一且不可修改，参考 docs/system-portal/inventory.md',
  name VARCHAR(64) NOT NULL COMMENT '系统中文名',
  name_en VARCHAR(64) COMMENT '系统英文名',
  description VARCHAR(255) COMMENT '系统简介',
  icon VARCHAR(64) COMMENT '前端图标 key',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '门户排序',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted TINYINT NOT NULL DEFAULT 0,
  KEY idx_sys_system_sort (sort_order)
) COMMENT='系统清单（用于统一门户与系统准入）';

-- 2. 菜单归属系统
ALTER TABLE sys_menu ADD COLUMN system_code VARCHAR(32) DEFAULT NULL COMMENT '归属系统编码；顶级菜单必填，叶子菜单继承父级；NULL 表示暂未归属';
ALTER TABLE sys_menu ADD INDEX idx_menu_system_code (system_code);

-- 3. 角色 × 系统 准入
CREATE TABLE IF NOT EXISTS sys_role_system (
  role_id BIGINT NOT NULL COMMENT 'sys_role.id',
  system_code VARCHAR(32) NOT NULL COMMENT 'sys_system.code',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, system_code),
  KEY idx_role_system_code (system_code)
) COMMENT='角色与系统准入关联；与 sys_role_menu 独立，撤销菜单授权不影响系统准入';

-- 4. 部门 × 系统 准入
CREATE TABLE IF NOT EXISTS sys_department_system (
  dept_id BIGINT NOT NULL COMMENT 'sys_department.id',
  system_code VARCHAR(32) NOT NULL COMMENT 'sys_system.code',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dept_id, system_code),
  KEY idx_dept_system_code (system_code)
) COMMENT='部门与系统准入关联；与 sys_department_menu 独立';

-- 5. 系统种子（10 个业务系统；portal 作为哨兵不落库）
INSERT INTO sys_system (code, name, name_en, description, icon, sort_order, status, deleted) VALUES
  ('ads',      '廣告與推廣系統',  'Ads & Promotion',   '广告销售、商家推广、推广通、团购秒杀',       'CampaignOutlined',          10,  1, 0),
  ('merchant', '商戶運營系統',    'Merchant Ops',      '商户集团、门店、门店数据、地图规划',         'ShopOutlined',              20,  1, 0),
  ('search',   '搜索運營系統',    'Search Ops',        '搜索词库、引导、策略、校验、报表',           'SearchOutlined',            30,  1, 0),
  ('finance',  '財務系統',        'Finance',           '账户余额、批次、明细、对账、审批中心',       'AccountBookOutlined',       40,  1, 0),
  ('ai',       'AI 管理系統',     'AI Hub',            '模型、配额、授权、MCP、审计、能耗',          'RobotOutlined',             50,  1, 0),
  ('hr',       'HR 系統',         'Human Resources',   '员工、组织、职位、员工动态',                 'TeamOutlined',              60,  1, 0),
  ('eam',      '物資管理系統',    'EAM',               '资产、耗材、采购、库存、盘点',               'InboxOutlined',             70,  1, 0),
  ('oa',       'OA 系統',         'OA',                '流程中心、流程事项、审批配置、员工自助',     'SolutionOutlined',          80,  1, 0),
  ('iam',      '權限中心',        'IAM',               '角色、功能授权、数据授权、菜单配置',         'SafetyCertificateOutlined', 90,  1, 0),
  ('platform', '平台配置',        'Platform',          '通知、多语言、规则、版本、翻译工作台',       'SettingOutlined',          100,  1, 0)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  name_en = VALUES(name_en),
  description = VALUES(description),
  icon = VALUES(icon),
  sort_order = VALUES(sort_order);

-- 6. 顶级菜单 system_code 回填
UPDATE sys_menu SET system_code = 'portal'   WHERE menu_key = 'home';
UPDATE sys_menu SET system_code = 'merchant' WHERE menu_key = 'merchant_group';
UPDATE sys_menu SET system_code = 'ads'      WHERE menu_key IN ('merchant_promotion', 'promotion_tool', 'group-purchase');
UPDATE sys_menu SET system_code = 'search'   WHERE menu_key = 'search';
UPDATE sys_menu SET system_code = 'finance'  WHERE menu_key = 'finance';
UPDATE sys_menu SET system_code = 'ai'       WHERE menu_key = 'ai-assistant';
UPDATE sys_menu SET system_code = 'hr'       WHERE menu_key = 'hr';
UPDATE sys_menu SET system_code = 'eam'      WHERE menu_key = 'asset-management';
UPDATE sys_menu SET system_code = 'oa'       WHERE menu_key = 'oa-center';
UPDATE sys_menu SET system_code = 'iam'      WHERE menu_key = 'permission';
UPDATE sys_menu SET system_code = 'platform' WHERE menu_key IN ('system-config', 'i18n-center');

-- 例外：菜单配置归 iam（治理面）
UPDATE sys_menu SET system_code = 'iam' WHERE menu_key = 'menu-config';

-- 7. 叶子菜单继承顶级（递归一次到 depth=3；DataInitializer 迁移代码用循环更稳妥）
UPDATE sys_menu c
  JOIN sys_menu p ON c.parent_id = p.id
   SET c.system_code = p.system_code
 WHERE c.system_code IS NULL AND p.system_code IS NOT NULL AND c.deleted = 0;

-- 8. 一次性迁移：从菜单授权反推系统准入
INSERT IGNORE INTO sys_role_system (role_id, system_code)
SELECT DISTINCT rm.role_id, m.system_code
  FROM sys_role_menu rm
  JOIN sys_menu m    ON m.id = rm.menu_id AND m.deleted = 0 AND m.status = 1 AND m.system_code IS NOT NULL
  JOIN sys_role r    ON r.id = rm.role_id AND r.deleted = 0 AND r.status = 1
 WHERE r.code <> 'admin' AND m.system_code <> 'portal';

INSERT IGNORE INTO sys_department_system (dept_id, system_code)
SELECT DISTINCT dm.dept_id, m.system_code
  FROM sys_department_menu dm
  JOIN sys_menu m       ON m.id = dm.menu_id AND m.deleted = 0 AND m.status = 1 AND m.system_code IS NOT NULL
  JOIN sys_department d ON d.id = dm.dept_id AND d.deleted = 0 AND d.status = 1
 WHERE m.system_code <> 'portal';
