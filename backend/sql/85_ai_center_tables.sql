-- ============================================================
-- MFTB 搜广推系统 - AI 智能中心完整数据库脚本
-- 版本：v2026.09.03
-- 说明：包含 AI 供应商、模型、权限、配额、工具注册、能耗统计等 8 张表
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- 1. AI 供应商表
-- ----------------------------
DROP TABLE IF EXISTS `ai_provider`;
CREATE TABLE `ai_provider` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `provider_key` VARCHAR(50) NOT NULL UNIQUE COMMENT '供应商标识',
    `name` VARCHAR(100) NOT NULL COMMENT '供应商名称',
    `description` VARCHAR(500) DEFAULT NULL COMMENT '供应商描述',
    `api_base_url` VARCHAR(500) DEFAULT NULL COMMENT 'API 基础 URL',
    `api_key` VARCHAR(500) DEFAULT NULL COMMENT 'API Key(加密存储)',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `is_default` TINYINT DEFAULT 0 COMMENT '是否默认供应商: 0=否 1=是',
    `config_json` TEXT DEFAULT NULL COMMENT '配置信息 JSON',
    `sort_order` INT DEFAULT 0 COMMENT '排序',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除：0=未删除 1=已删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_provider_key` (`provider_key`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 供应商表';

-- ----------------------------
-- 2. AI 模型表
-- ----------------------------
DROP TABLE IF EXISTS `ai_model`;
CREATE TABLE `ai_model` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `provider_id` BIGINT DEFAULT NULL COMMENT '供应商 ID（外键）',
    `model_key` VARCHAR(50) NOT NULL COMMENT '模型标识',
    `name` VARCHAR(100) NOT NULL COMMENT '模型名称',
    `description` VARCHAR(500) DEFAULT NULL COMMENT '模型描述',
    `type` VARCHAR(50) DEFAULT 'chat' COMMENT '模型类型：chat/completion/embedding/token_count',
    `context_window` INT DEFAULT 0 COMMENT '上下文窗口大小（tokens）',
    `max_output_tokens` INT DEFAULT 0 COMMENT '最大输出 tokens',
    `input_price` DECIMAL(10,6) DEFAULT 0.000000 COMMENT '输入价格（每千 tokens）',
    `output_price` DECIMAL(10,6) DEFAULT 0.000000 COMMENT '输出价格（每千 tokens）',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `sort_order` INT DEFAULT 0 COMMENT '排序',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除：0=未删除 1=已删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_model_key` (`model_key`),
    INDEX `idx_provider_id` (`provider_id`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 模型表';

-- ----------------------------
-- 3. 部门模型权限表
-- ----------------------------
DROP TABLE IF EXISTS `ai_department_auth`;
CREATE TABLE `ai_department_auth` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `department_id` BIGINT NOT NULL COMMENT '部门 ID',
    `model_id` BIGINT NOT NULL COMMENT '模型 ID',
    `has_permission` TINYINT DEFAULT 1 COMMENT '是否有权限：1=有权限 0=无权限',
    `limit_type` VARCHAR(20) DEFAULT 'none' COMMENT '限制类型：none/daily/monthly/custom',
    `daily_limit` INT DEFAULT 0 COMMENT '每日限额（tokens）',
    `monthly_limit` INT DEFAULT 0 COMMENT '月度限额（tokens）',
    `custom_limit` INT DEFAULT 0 COMMENT '自定义限额',
    `start_date` DATE DEFAULT NULL COMMENT '生效开始日期',
    `end_date` DATE DEFAULT NULL COMMENT '生效结束日期',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_dept_model` (`department_id`, `model_id`),
    INDEX `idx_department_id` (`department_id`),
    INDEX `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门模型权限表';

-- ----------------------------
-- 4. 员工模型权限表
-- ----------------------------
DROP TABLE IF EXISTS `ai_employee_auth`;
CREATE TABLE `ai_employee_auth` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `employee_id` BIGINT NOT NULL COMMENT '员工 ID',
    `model_id` BIGINT NOT NULL COMMENT '模型 ID',
    `has_permission` TINYINT DEFAULT 1 COMMENT '是否有权限：1=有权限 0=无权限',
    `limit_type` VARCHAR(20) DEFAULT 'none' COMMENT '限制类型：none/daily/monthly/custom',
    `daily_limit` INT DEFAULT 0 COMMENT '每日限额（tokens）',
    `monthly_limit` INT DEFAULT 0 COMMENT '月度限额（tokens）',
    `custom_limit` INT DEFAULT 0 COMMENT '自定义限额',
    `current_daily_usage` BIGINT DEFAULT 0 COMMENT '当日已用量（tokens）',
    `current_monthly_usage` BIGINT DEFAULT 0 COMMENT '当月已用量（tokens）',
    `reset_date` DATE DEFAULT NULL COMMENT '限额重置日期',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_employee_model` (`employee_id`, `model_id`),
    INDEX `idx_employee_id` (`employee_id`),
    INDEX `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工模型权限表';

-- ----------------------------
-- 5. 职位模型权限映射表
-- ----------------------------
DROP TABLE IF EXISTS `ai_position_model_mapping`;
CREATE TABLE `ai_position_model_mapping` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `position_id` BIGINT NOT NULL COMMENT '职位 ID',
    `model_id` BIGINT NOT NULL COMMENT '模型 ID',
    `permission_level` VARCHAR(20) DEFAULT 'full' COMMENT '权限级别：full/restricted/none',
    `daily_limit` INT DEFAULT 0 COMMENT '每日限额（tokens）',
    `monthly_limit` INT DEFAULT 0 COMMENT '月度限额（tokens）',
    `priority` INT DEFAULT 0 COMMENT '优先级（数字越大优先级越高）',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_position_model` (`position_id`, `model_id`),
    INDEX `idx_position_id` (`position_id`),
    INDEX `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='职位模型权限映射表';

-- ----------------------------
-- 6. 角色模型权限映射表
-- ----------------------------
DROP TABLE IF EXISTS `ai_role_model_mapping`;
CREATE TABLE `ai_role_model_mapping` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `role_id` BIGINT NOT NULL COMMENT '角色 ID',
    `model_id` BIGINT NOT NULL COMMENT '模型 ID',
    `permission_level` VARCHAR(20) DEFAULT 'full' COMMENT '权限级别：full/restricted/none',
    `daily_limit` INT DEFAULT 0 COMMENT '每日限额（tokens）',
    `monthly_limit` INT DEFAULT 0 COMMENT '月度限额（tokens）',
    `priority` INT DEFAULT 0 COMMENT '优先级（数字越大优先级越高）',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_role_model` (`role_id`, `model_id`),
    INDEX `idx_role_id` (`role_id`),
    INDEX `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色模型权限映射表';

-- ----------------------------
-- 7. AI 用量日志表
-- ----------------------------
DROP TABLE IF EXISTS `ai_usage_log`;
CREATE TABLE `ai_usage_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `target_type` VARCHAR(20) NOT NULL COMMENT '目标类型：employee/department',
    `target_id` BIGINT NOT NULL COMMENT '目标 ID（员工 ID 或部门 ID）',
    `model_id` BIGINT NOT NULL COMMENT '模型 ID',
    `user_id` BIGINT DEFAULT NULL COMMENT '操作员工 ID',
    `request_tokens` INT DEFAULT 0 COMMENT '请求 tokens 数',
    `response_tokens` INT DEFAULT 0 COMMENT '响应 tokens 数',
    `total_tokens` INT DEFAULT 0 COMMENT '总 tokens 数',
    `cost_amount` DECIMAL(10,6) DEFAULT 0.000000 COMMENT '消耗金额',
    `prompt_text` TEXT DEFAULT NULL COMMENT '提示词摘要（前 500 字符）',
    `error_message` VARCHAR(500) DEFAULT NULL COMMENT '错误信息',
    `duration_ms` INT DEFAULT 0 COMMENT '耗时（毫秒）',
    `request_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '请求时间',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    INDEX `idx_target_type_id` (`target_type`, `target_id`),
    INDEX `idx_model_id` (`model_id`),
    INDEX `idx_request_time` (`request_time`),
    INDEX `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 用量日志表';

-- ----------------------------
-- 8. 部门/员工额度配置表
-- ----------------------------
DROP TABLE IF EXISTS `ai_quota_config`;
CREATE TABLE `ai_quota_config` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `quota_type` VARCHAR(20) NOT NULL COMMENT '配额类型：department/employee',
    `target_id` BIGINT NOT NULL COMMENT '目标 ID（部门 ID 或员工 ID）',
    `model_id` BIGINT DEFAULT NULL COMMENT '模型 ID（NULL=全局配额）',
    `daily_quota` INT DEFAULT 0 COMMENT '每日配额（tokens）',
    `monthly_quota` INT DEFAULT 0 COMMENT '月度配额（tokens）',
    `used_today` BIGINT DEFAULT 0 COMMENT '今日已用',
    `used_month` BIGINT DEFAULT 0 COMMENT '本月已用',
    `quota_period_start` DATE DEFAULT NULL COMMENT '配额周期开始日期',
    `quota_period_end` DATE DEFAULT NULL COMMENT '配额周期结束日期',
    `auto_reset` TINYINT DEFAULT 1 COMMENT '是否自动重置：1=是 0=否',
    `reset_day_of_month` TINYINT DEFAULT 1 COMMENT '每月重置日（1-31）',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_quota_target_model` (`quota_type`, `target_id`, `model_id`),
    INDEX `idx_quota_type_id` (`quota_type`, `target_id`),
    INDEX `idx_model_id` (`model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门/员工额度配置表';

-- ----------------------------
-- 9. AI 工具注册表
-- ----------------------------
DROP TABLE IF EXISTS `ai_tool_registry`;
CREATE TABLE `ai_tool_registry` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
    `tool_key` VARCHAR(50) NOT NULL UNIQUE COMMENT '工具标识',
    `name` VARCHAR(100) NOT NULL COMMENT '工具名称',
    `description` VARCHAR(500) DEFAULT NULL COMMENT '工具描述',
    `category` VARCHAR(50) DEFAULT 'general' COMMENT '分类：general/tool/data/other',
    `version` VARCHAR(20) DEFAULT '1.0.0' COMMENT '版本号',
    `author` VARCHAR(100) DEFAULT NULL COMMENT '作者/提供方',
    `icon` VARCHAR(100) DEFAULT NULL COMMENT '图标',
    `api_endpoint` VARCHAR(500) DEFAULT NULL COMMENT 'API 端点',
    `config_schema` TEXT DEFAULT NULL COMMENT '配置 Schema JSON',
    `is_enabled` TINYINT DEFAULT 1 COMMENT '是否启用：1=是 0=否',
    `sort_order` INT DEFAULT 0 COMMENT '排序',
    `status` TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',
    `deleted` TINYINT DEFAULT 0 COMMENT '逻辑删除',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_category` (`category`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 工具注册表';

-- ----------------------------
-- 初始化数据：测试供应商和模型
-- ----------------------------
BEGIN;

INSERT INTO `ai_provider` (`provider_key`, `name`, `api_base_url`, `api_key`, `status`, `is_default`, `sort_order`) VALUES
('openai', 'OpenAI', 'https://api.openai.com/v1', 'sk-test_openai_api_key_placeholder', 1, 1, 1),
('azure-openai', 'Azure OpenAI', 'https://your-resource.openai.azure.com', 'sk-test_azure_api_key_placeholder', 1, 0, 2),
('anthropic', 'Anthropic Claude', 'https://api.anthropic.com/v1', 'sk-test_anthropic_api_key_placeholder', 1, 0, 3);

INSERT INTO `ai_model` (`provider_id`, `model_key`, `name`, `description`, `type`, `context_window`, `max_output_tokens`, `input_price`, `output_price`, `status`, `sort_order`) VALUES
(1, 'gpt-4o', 'GPT-4o', 'OpenAI GPT-4o 模型', 'chat', 128000, 4096, 5.000000, 15.000000, 1, 1),
(1, 'gpt-4o-mini', 'GPT-4o Mini', 'OpenAI GPT-4o Mini 模型', 'chat', 128000, 4096, 0.150000, 0.600000, 1, 2),
(1, 'o1-preview', 'o1 Preview', 'OpenAI o1 预览版', 'chat', 128000, 100000, 15.000000, 60.000000, 1, 3),
(3, 'claude-3-5-sonnet', 'Claude 3.5 Sonnet', 'Anthropic Claude 3.5 Sonnet', 'chat', 200000, 4096, 3.000000, 15.000000, 1, 4);

COMMIT;

SET FOREIGN_KEY_CHECKS = 1;
