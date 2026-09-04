-- ============================================================
-- 88_dept_auth_group.sql
-- 部门模型权控 - 策略分组模式
-- 说明：支持一条策略关联多个部门，共享同一组模型授权 + 能力开关配置
-- ============================================================

-- ----------------------------
-- 1. 部门授权策略主表
-- ----------------------------
DROP TABLE IF EXISTS `ai_dept_auth_group`;
CREATE TABLE `ai_dept_auth_group` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `name` VARCHAR(100) NOT NULL COMMENT '策略名称',
    `data_residency` TINYINT DEFAULT 0 COMMENT '数据不出域：1=启用 0=未启用',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `total_employee_count` INT DEFAULT 0 COMMENT '关联部门总人数（冗余缓存）',
    `updated_by` VARCHAR(50) DEFAULT NULL COMMENT '最后更新人',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除：0=未删除 1=已删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门模型授权策略主表';

-- ----------------------------
-- 2. 策略-部门关联表
-- ----------------------------
DROP TABLE IF EXISTS `ai_dept_auth_group_dept`;
CREATE TABLE `ai_dept_auth_group_dept` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `group_id` BIGINT NOT NULL COMMENT '策略组 ID',
    `department_id` BIGINT NOT NULL COMMENT '部门 ID',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_group_dept` (`group_id`, `department_id`),
    INDEX `idx_group_id` (`group_id`),
    INDEX `idx_department_id` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略-部门关联表';

-- ----------------------------
-- 3. 策略-模型授权表（含能力开关）
-- ----------------------------
DROP TABLE IF EXISTS `ai_dept_auth_group_model`;
CREATE TABLE `ai_dept_auth_group_model` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `group_id` BIGINT NOT NULL COMMENT '策略组 ID',
    `model_id` BIGINT NOT NULL COMMENT '模型 ID',
    `vision_support` TINYINT DEFAULT 1 COMMENT '视觉理解：1=开放 0=关闭',
    `function_calling` TINYINT DEFAULT 1 COMMENT '工具调用：1=开放 0=关闭',
    `json_mode` TINYINT DEFAULT 1 COMMENT 'JSON 模式：1=开放 0=关闭',
    `streaming` TINYINT DEFAULT 1 COMMENT '流式响应：1=开放 0=关闭',
    `thinking_mode` TINYINT DEFAULT 1 COMMENT '思考模式：1=开放 0=关闭',
    `priority` INT DEFAULT 0 COMMENT '优先级（数字越大越优先）',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_group_model` (`group_id`, `model_id`),
    INDEX `idx_group_id` (`group_id`),
    INDEX `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略-模型授权与能力配置表';
