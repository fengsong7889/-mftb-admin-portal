-- ============================================================
-- MFTB 搜广推系统 - 员工管理模块完整建表 + 种子数据
-- 在 01_init_system.sql + 02_employee_permission.sql 基础上执行
-- 数据库: MySQL 8.0+
-- ============================================================

USE mftb_admin;

-- ============================================================
-- 一、组织架构 - 部门表
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_department (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    code        VARCHAR(64)  NOT NULL                   COMMENT '部门编码',
    name        VARCHAR(128) NOT NULL                   COMMENT '部门名称',
    parent_id   BIGINT       NULL                       COMMENT '上级部门ID (顶级为null)',
    leader      VARCHAR(64)  NULL                       COMMENT '部门对接人',
    permissions TEXT         NULL                       COMMENT '部门授权菜单权限 JSON数组',
    status      INT          DEFAULT 1                  COMMENT '状态: 1=有效 0=无效',
    sort        INT          DEFAULT 0                  COMMENT '排序',
    updated_by  VARCHAR(64)  NULL                       COMMENT '最后更新人',
    deleted     INT          DEFAULT 0                  COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='集团组织架构-部门表';

-- ============================================================
-- 二、职位表
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_position (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    name        VARCHAR(128) NOT NULL                   COMMENT '职位名称',
    name_en     VARCHAR(128) NULL                       COMMENT '职位英文名称',
    sequence    VARCHAR(8)   NOT NULL                   COMMENT '职级序列: M=管理 T=技术 P=专业',
    job_level   VARCHAR(32) NOT NULL                   COMMENT '职级 (如 M3 / T5 / P2)',
    `rank`      VARCHAR(8)  NULL                       COMMENT '职等 R1~R5',
    updated_by  VARCHAR(64) NULL                       COMMENT '最后更新人',
    deleted     INT          DEFAULT 0                  COMMENT '逻辑删除',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='集团人事-职位表';

-- ============================================================
-- 三、确保 sys_user / sys_role 有新字段
-- ============================================================

-- sys_user 增加集团人事字段
SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN department_id BIGINT NULL COMMENT ''所在部门ID'' AFTER function_roles',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'department_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN position_id BIGINT NULL COMMENT ''职位ID'' AFTER department',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'position_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN job_level VARCHAR(32) NULL COMMENT ''职级快照'' AFTER position',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'job_level');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN position_en VARCHAR(128) NULL COMMENT ''职位英文名称快照'' AFTER position',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'position_en');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_user ADD COLUMN function_roles TEXT NULL COMMENT ''绑定的功能角色ID JSON数组'' AFTER role',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'function_roles');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sys_role 增加权限字段
SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_role ADD COLUMN permissions TEXT NULL COMMENT ''菜单权限 JSON数组'' AFTER description',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_role' AND COLUMN_NAME = 'permissions');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_role ADD COLUMN updated_by VARCHAR(64) NULL COMMENT ''最后更新人'' AFTER status',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_role' AND COLUMN_NAME = 'updated_by');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE sys_department ADD COLUMN updated_by VARCHAR(64) NULL COMMENT ''最后更新人'' AFTER sort',
    'SELECT 1') FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_department' AND COLUMN_NAME = 'updated_by');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 四、种子数据 - 部门
-- ============================================================

INSERT INTO sys_department (id, code, name, parent_id, leader, status, sort) VALUES
(1, 'HQ',   '集團總部', NULL, '張總',   1, 1),
(2, 'TECH', '技術部',   1,    '李工',   1, 1),
(3, 'OPS',  '運營部',   1,    '王經理', 1, 2),
(4, 'FIN',  '財務部',   1,    '趙會計', 1, 3),
(5, 'CS',   '客服部',   3,    '陳主管', 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), leader = VALUES(leader);

-- ============================================================
-- 五、种子数据 - 职位
-- ============================================================

INSERT INTO sys_position (id, name, sequence, job_level) VALUES
(1, '高級工程師', 'T', 'T7'),
(2, '中級工程師', 'T', 'T5'),
(3, '初級工程師', 'T', 'T3'),
(4, '高級產品經理', 'P', 'P7'),
(5, '產品經理',   'P', 'P5'),
(6, '運營專員',   'P', 'P3'),
(7, '部門經理',   'M', 'M5'),
(8, '總監',       'M', 'M7')
ON DUPLICATE KEY UPDATE name = VALUES(name), job_level = VALUES(job_level);

-- ============================================================
-- 六、种子数据 - 功能角色
-- ============================================================

INSERT INTO sys_role (id, name, code, description, status, permissions) VALUES
(1, '系統管理員', 'sys_admin',  '擁有全部菜單和操作權限', 1, '[]'),
(2, '運營管理員', 'ops_admin',  '擁有運營相關菜單權限', 1, '[]'),
(3, '財務專員',   'fin_staff',  '僅擁有財務模塊查看權限', 1, '[]'),
(4, '客服專員',   'cs_staff',   '僅擁有用戶反饋處理權限', 0, '[]')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- ============================================================
-- 七、更新 admin 用户关联部门和职位
-- ============================================================

UPDATE sys_user SET
    department_id = 1,
    department    = '集團總部',
    position_id   = 8,
    position      = '總監',
    job_level     = 'M7',
    function_roles = '[1]'
WHERE username = 'admin';

-- ============================================================
-- 八、种子数据 - 更多员工
-- ============================================================

-- 密码统一为 BCrypt 加密的 "123456" (占位, DataInitializer 会自动重置)
INSERT INTO sys_user (username, password, name, emp_id, avatar, role, department_id, department, position_id, position, job_level, status, function_roles) VALUES
('zhangsan', '$2a$10$placeholder', '張三', 'EMP002', 'pikachu-default', 'guest', 2, '技術部', 1, '高級工程師', 'T7', 1, '[2]'),
('lisi',     '$2a$10$placeholder', '李四', 'EMP003', 'pikachu-default', 'guest', 2, '技術部', 2, '中級工程師', 'T5', 1, '[2]'),
('wangwu',   '$2a$10$placeholder', '王五', 'EMP004', 'pikachu-default', 'guest', 3, '運營部', 6, '運營專員',   'P3', 1, '[2]'),
('zhaoliu',  '$2a$10$placeholder', '趙六', 'EMP005', 'pikachu-default', 'guest', 4, '財務部', NULL, NULL,      NULL, 0, '[3]')
ON DUPLICATE KEY UPDATE name = VALUES(name), emp_id = VALUES(emp_id);

-- ============================================================
-- 完成
-- ============================================================

SELECT '✅ 员工管理模块数据库初始化完成' AS result;
SELECT COUNT(*) AS employee_count FROM sys_user WHERE deleted = 0;
SELECT COUNT(*) AS department_count FROM sys_department WHERE deleted = 0;
SELECT COUNT(*) AS position_count FROM sys_position WHERE deleted = 0;
SELECT COUNT(*) AS role_count FROM sys_role WHERE deleted = 0;

