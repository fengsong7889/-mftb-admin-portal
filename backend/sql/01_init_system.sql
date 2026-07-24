-- ============================================================
-- MFTB 通用管理平台 - 数据库初始化脚本
-- 数据库: MySQL 8.0+
-- 字符集: utf8mb4
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS mftb_admin
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_general_ci;

USE mftb_admin;

-- ============================================================
-- 一、系统基础表
-- ============================================================

-- 用户表
DROP TABLE IF EXISTS sys_user;
CREATE TABLE sys_user (
    id          BIGINT      PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    username    VARCHAR(50) NOT NULL UNIQUE            COMMENT '登录账号',
    password    VARCHAR(255) NOT NULL                  COMMENT '密码(BCrypt加密)',
    name        VARCHAR(50)                            COMMENT '姓名',
    emp_id      VARCHAR(20)                            COMMENT '员工工号',
    avatar      VARCHAR(255)                           COMMENT '头像',
    role        VARCHAR(20) DEFAULT 'guest'            COMMENT '角色: admin/guest',
    department  VARCHAR(100)                           COMMENT '所在部门',
    position    VARCHAR(100)                           COMMENT '职位',
    status      TINYINT     DEFAULT 1                  COMMENT '状态: 1=启用 0=停用',
    deleted     TINYINT     DEFAULT 0                  COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at  DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 角色表
DROP TABLE IF EXISTS sys_role;
CREATE TABLE sys_role (
    id          BIGINT      PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    name        VARCHAR(50) NOT NULL                   COMMENT '角色名称',
    code        VARCHAR(50) NOT NULL UNIQUE            COMMENT '角色编码',
    description VARCHAR(255)                           COMMENT '角色描述',
    status      TINYINT     DEFAULT 1                  COMMENT '状态: 1=启用 0=停用',
    deleted     TINYINT     DEFAULT 0                  COMMENT '逻辑删除',
    created_at  DATETIME    DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at  DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 用户-角色关联表
DROP TABLE IF EXISTS sys_user_role;
CREATE TABLE sys_user_role (
    user_id BIGINT NOT NULL COMMENT '用户ID',
    role_id BIGINT NOT NULL COMMENT '角色ID',
    PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';

-- 菜单/权限表
DROP TABLE IF EXISTS sys_menu;
CREATE TABLE sys_menu (
    id         BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    parent_id  BIGINT       DEFAULT 0                  COMMENT '父菜单ID: 0=顶级',
    name       VARCHAR(50)  NOT NULL                   COMMENT '菜单名称',
    path       VARCHAR(200)                            COMMENT '路由路径',
    icon       VARCHAR(100)                            COMMENT '图标',
    sort_order INT          DEFAULT 0                  COMMENT '排序',
    type       TINYINT                                 COMMENT '类型: 1=目录 2=菜单 3=按钮',
    permission VARCHAR(100)                            COMMENT '权限标识如 user:create',
    status     TINYINT      DEFAULT 1                  COMMENT '状态: 1=启用 0=停用',
    deleted    TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='菜单权限表';

-- 角色-菜单关联表
DROP TABLE IF EXISTS sys_role_menu;
CREATE TABLE sys_role_menu (
    role_id BIGINT NOT NULL COMMENT '角色ID',
    menu_id BIGINT NOT NULL COMMENT '菜单ID',
    PRIMARY KEY (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色菜单关联表';

-- ============================================================
-- 二、初始数据
-- ============================================================

-- 初始用户
-- 注意: 密码为 BCrypt 加密值。
--   admin 密码明文: 111222
--   guest 密码明文: 123456
-- 下方 BCrypt 值为占位符, 首次启动后端时会由 DataInitializer 自动重置为正确加密值。
INSERT INTO sys_user (username, password, name, emp_id, avatar, role, department, position, status) VALUES
('admin', '$2a$10$placeholder', 'Bee', 'SF0001', 'pikachu-default', 'admin', '集团总裁办', '高级副总裁', 1),
('guest', '$2a$10$placeholder', '訪客', 'G0001', 'pikachu-default', 'guest', NULL, NULL, 1);

-- 初始角色
INSERT INTO sys_role (name, code, description, status) VALUES
('超级管理员', 'admin', '拥有系统所有权限', 1),
('访客', 'guest', '仅拥有查看权限', 1);

-- 用户角色绑定 (admin->1, guest->2)
INSERT INTO sys_user_role (user_id, role_id) VALUES
(1, 1),
(2, 2);

