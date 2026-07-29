-- ============================================================
-- MFTB 搜广推系统 - 完整数据库初始化脚本（幂等，可重复执行）
-- 数据库: MySQL 8.0+
-- 适用场景: Sealos 等云数据库全新初始化
-- 覆盖模块: 员工管理 / 组织架构 / 职位管理 / 功能角色
-- 注意: 使用 CREATE TABLE IF NOT EXISTS，不会破坏已有数据；
--       后端 DataInitializer 启动时也会做幂等字段迁移与密码初始化。
-- ============================================================

CREATE DATABASE IF NOT EXISTS mftb_admin
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_general_ci;

USE mftb_admin;

-- ============================================================
-- 一、用户表（员工）
-- 前端「员工管理」菜单对应表，工号 emp_id 即登录账号 username
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_user (
    id             BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    username       VARCHAR(50)  NOT NULL UNIQUE            COMMENT '登录账号(=工号)',
    password       VARCHAR(255) NOT NULL                   COMMENT '密码(BCrypt加密)',
    name           VARCHAR(50)                             COMMENT '姓名',
    emp_id         VARCHAR(20)                             COMMENT '员工工号',
    avatar         VARCHAR(255)                            COMMENT '头像',
    role           VARCHAR(20)  DEFAULT 'guest'            COMMENT '系统角色: admin/guest',
    function_roles TEXT                                    COMMENT '绑定的功能角色ID JSON数组, 如 [1,3]',
    department_id  BIGINT                                  COMMENT '所在部门ID (关联 sys_department.id)',
    department     VARCHAR(100)                            COMMENT '所在部门名称快照',
    position_id    BIGINT                                  COMMENT '职位ID (关联 sys_position.id)',
    position       VARCHAR(100)                            COMMENT '职位名称(中文)快照',
    position_en    VARCHAR(128)                            COMMENT '职位名称(英文)快照',
    `sequence`     VARCHAR(8)                              COMMENT '职级序列快照: M=管理 T=技术 P=专业 (随职位带出)',
    job_level      VARCHAR(32)                             COMMENT '职级快照 (如 M3/T5/P2, 随职位带出)',
    `rank`         VARCHAR(8)                              COMMENT '职等 R1~R5',
    status         TINYINT      DEFAULT 1                  COMMENT '状态: 1=启用 0=停用',
    deleted        TINYINT      DEFAULT 0                  COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_user_dept (department_id),
    KEY idx_user_position (position_id),
    KEY idx_user_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表(员工)';

-- ============================================================
-- 二、功能角色表
-- 前端「角色管理」菜单对应表，permissions 存菜单权限 JSON
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_role (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    name        VARCHAR(50)  NOT NULL                   COMMENT '角色名称',
    code        VARCHAR(50)  NOT NULL UNIQUE            COMMENT '角色编码',
    description VARCHAR(255)                            COMMENT '角色描述',
    permissions TEXT                                    COMMENT '菜单权限 JSON数组: [{"menuKey":"xxx","actions":["view","edit"]}]',
    status      TINYINT      DEFAULT 1                  COMMENT '状态: 1=启用 0=停用',
    updated_by  VARCHAR(64)                             COMMENT '最后更新人',
    deleted     TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功能角色表';

-- ============================================================
-- 三、组织架构-部门表
-- 前端「组织管理」菜单对应表，树形结构（parent_id 自关联）
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_department (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    code        VARCHAR(64)  NOT NULL                   COMMENT '部门编码',
    name        VARCHAR(128) NOT NULL                   COMMENT '部门名称',
    parent_id   BIGINT                                  COMMENT '上级部门ID (顶级为 NULL)',
    leader      VARCHAR(64)                             COMMENT '部门对接人',
    permissions TEXT                                    COMMENT '部门授权菜单权限 JSON数组',
    status      TINYINT      DEFAULT 1                  COMMENT '状态: 1=有效 0=无效',
    sort        INT          DEFAULT 0                  COMMENT '排序',
    updated_by  VARCHAR(64)                             COMMENT '最后更新人',
    deleted     TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_dept_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='集团组织架构-部门表';

-- ============================================================
-- 四、集团人事-职位表
-- 前端「职位管理」菜单对应表，员工选择职位后带出职级
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_position (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    name        VARCHAR(128) NOT NULL                   COMMENT '职位名称',
    name_en     VARCHAR(128) NULL                       COMMENT '职位英文名称',
    `sequence`  VARCHAR(8)   NOT NULL                   COMMENT '职级序列: M=管理 T=技术 P=专业',
    job_level   VARCHAR(32) NOT NULL                   COMMENT '职级 (如 M3/T5/P2)',
    `rank`      VARCHAR(8)  NULL                       COMMENT '职等 R1~R5',
    updated_by  VARCHAR(64)                             COMMENT '最后更新人',
    deleted     TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='集团人事-职位表';

-- ============================================================
-- 五、初始数据（幂等：仅当不存在时插入）
-- ============================================================

-- 内置管理员（登录账号统一为工号，工号按 MT 前缀自增；密码为占位符，后端 DataInitializer 首次启动时
-- 会自动重置为 BCrypt 值: MT0001=111222）
INSERT INTO sys_user (username, password, name, emp_id, avatar, role, department, position, status)
SELECT 'MT0001', '$2a$10$placeholder', 'Bee', 'MT0001', 'pikachu-default', 'admin', '集团总裁办', '高级副总裁', 1
WHERE NOT EXISTS (SELECT 1 FROM sys_user WHERE username = 'MT0001');

-- 初始功能角色
INSERT INTO sys_role (name, code, description, status)
SELECT '超级管理员', 'admin', '拥有系统所有权限', 1
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'admin');

INSERT INTO sys_role (name, code, description, status)
SELECT '访客', 'guest', '仅拥有查看权限', 1
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'guest');

-- 初始部门（顶级示例）
INSERT INTO sys_department (code, name, parent_id, leader, status, sort)
SELECT 'HQ', '集团总裁办', NULL, 'Bee', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM sys_department WHERE code = 'HQ');

INSERT INTO sys_department (code, name, parent_id, leader, status, sort)
SELECT 'TECH', '技术部', NULL, NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM sys_department WHERE code = 'TECH');

INSERT INTO sys_department (code, name, parent_id, leader, status, sort)
SELECT 'OPS', '运营部', NULL, NULL, 1, 2
WHERE NOT EXISTS (SELECT 1 FROM sys_department WHERE code = 'OPS');

-- 初始职位
INSERT INTO sys_position (name, `sequence`, job_level)
SELECT '高级副总裁', 'M', 'M5'
WHERE NOT EXISTS (SELECT 1 FROM sys_position WHERE name = '高级副总裁');

INSERT INTO sys_position (name, `sequence`, job_level)
SELECT '技术专家', 'T', 'T5'
WHERE NOT EXISTS (SELECT 1 FROM sys_position WHERE name = '技术专家');

INSERT INTO sys_position (name, `sequence`, job_level)
SELECT '运营专员', 'P', 'P2'
WHERE NOT EXISTS (SELECT 1 FROM sys_position WHERE name = '运营专员');

-- ============================================================
-- 验证: 执行完成后可用以下语句检查
--   SHOW TABLES;
--   SELECT id, username, name, emp_id, role, status FROM sys_user;
--   SELECT id, name, code FROM sys_role;
--   SELECT id, code, name FROM sys_department;
--   SELECT id, name, `sequence`, job_level FROM sys_position;
-- ============================================================

