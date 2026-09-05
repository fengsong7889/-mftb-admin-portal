-- ============================================================
-- 96_emp_pos_role_auth.sql
-- 员工模型权控 - 职位授权策略 + 自定义角色授权落库
-- 说明：前端员工模型权控页（按职位授权 / 角色授权 tab）原为 localStorage mock，
--       本脚本将两类配置持久化，使首页「我的授权模型」可按策略命中结果聚合。
-- 与 DataInitializer.migrateAiCenterTables() 内嵌建表语句保持等效（幂等）。
-- ============================================================

-- ----------------------------
-- 1. 职位授权策略表（职级序列 + 职级 范围匹配）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `ai_emp_pos_auth_strategy` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `config_code` VARCHAR(32) DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_emp_pos_model_auth 生成）',
    `strategy_name` VARCHAR(128) NOT NULL COMMENT '策略名称',
    `sequences` TEXT NOT NULL COMMENT '职级序列 JSON 数组',
    `job_levels` TEXT NOT NULL COMMENT '职级 JSON 数组',
    `model_configs` TEXT NOT NULL COMMENT '授权模型能力配置 JSON 数组',
    `data_residency` TINYINT DEFAULT 0 COMMENT '数据不出域：1=启用 0=未启用',
    `description` VARCHAR(512) DEFAULT NULL COMMENT '策略描述',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `created_by` VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    `updated_by` VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除：0=未删除 1=已删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工模型权控-职位授权策略表';

-- ----------------------------
-- 2. 自定义角色授权表（绑定员工 ID 匹配）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `ai_emp_role_auth` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `config_code` VARCHAR(32) DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_emp_role_model_auth 生成）',
    `role_code` VARCHAR(64) NOT NULL COMMENT '角色编码（前端展示 ID，唯一）',
    `role_name` VARCHAR(128) NOT NULL COMMENT '角色名称',
    `description` VARCHAR(512) DEFAULT NULL COMMENT '角色描述',
    `user_ids` TEXT NOT NULL COMMENT '绑定员工 ID JSON 数组',
    `model_configs` TEXT NOT NULL COMMENT '授权模型能力配置 JSON 数组',
    `data_residency` TINYINT DEFAULT 0 COMMENT '数据不出域：1=启用 0=未启用',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `created_by` VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    `updated_by` VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除：0=未删除 1=已删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_role_code` (`role_code`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工模型权控-自定义角色授权表';
