-- ============================================================
-- 94_emp_quota_policy.sql
-- 員工額度策略：職位額度 + 角色額度
-- ============================================================

-- 1. 職位額度策略表
CREATE TABLE IF NOT EXISTS ai_emp_quota_policy (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    config_code         VARCHAR(32)     NULL COMMENT '配置ID（按编号生成规则 ai_emp_pos_quota 生成）',
    name                VARCHAR(100)    NOT NULL COMMENT '策略名稱',
    description         VARCHAR(500)    DEFAULT '' COMMENT '策略描述',
    sequences           JSON            NULL COMMENT '職級序列數組 e.g. ["M","R"]',
    job_levels          JSON            NULL COMMENT '職級數組 e.g. ["R3","R4"]',
    total_employee_count INT            DEFAULT 0 COMMENT '覆蓋人數',
    period              VARCHAR(20)     NOT NULL COMMENT '限額周期: daily/monthly',
    quota_type          VARCHAR(20)     NOT NULL COMMENT '限額類型: token/cost/request',
    quota_value         DECIMAL(20,2)   NOT NULL DEFAULT 0 COMMENT '限額值',
    currency            VARCHAR(10)     NOT NULL DEFAULT 'CNY' COMMENT '計價幣種',
    soft_threshold      INT             NOT NULL DEFAULT 80 COMMENT '軟限額提醒閾值(%)',
    over_limit_action   VARCHAR(20)     NOT NULL DEFAULT 'reject' COMMENT '超額動作: reject/approve/downgrade',
    downgrade_model_id  BIGINT          DEFAULT NULL COMMENT '降級目標模型ID',
    used_value          DECIMAL(20,2)   NOT NULL DEFAULT 0 COMMENT '本期已用量',
    status              TINYINT         NOT NULL DEFAULT 1 COMMENT '狀態: 1=啟用 0=停用',
    deleted             TINYINT         NOT NULL DEFAULT 0 COMMENT '邏輯刪除',
    created_by          VARCHAR(50)     DEFAULT NULL COMMENT '創建人',
    updated_by          VARCHAR(50)     DEFAULT NULL COMMENT '最後更新人',
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    INDEX idx_period (period),
    INDEX idx_status (status),
    INDEX idx_quota_type (quota_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='員工職位額度策略';

-- 2. 角色額度策略表
CREATE TABLE IF NOT EXISTS ai_role_quota_policy (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    config_code         VARCHAR(32)     NULL COMMENT '配置ID（按编号生成规则 ai_emp_role_quota 生成）',
    role_name           VARCHAR(100)    NOT NULL COMMENT '角色名稱',
    description         VARCHAR(500)    DEFAULT '' COMMENT '角色描述',
    user_ids            JSON            NULL COMMENT '綁定員工ID數組',
    user_names          JSON            NULL COMMENT '綁定員工姓名數組（冗餘展示）',
    total_employee_count INT            DEFAULT 0 COMMENT '綁定人數',
    period              VARCHAR(20)     NOT NULL COMMENT '限額周期: daily/monthly',
    quota_type          VARCHAR(20)     NOT NULL COMMENT '限額類型: token/cost/request',
    quota_value         DECIMAL(20,2)   NOT NULL DEFAULT 0 COMMENT '限額值',
    currency            VARCHAR(10)     NOT NULL DEFAULT 'CNY' COMMENT '計價幣種',
    soft_threshold      INT             NOT NULL DEFAULT 80 COMMENT '軟限額提醒閾值(%)',
    over_limit_action   VARCHAR(20)     NOT NULL DEFAULT 'reject' COMMENT '超額動作: reject/approve/downgrade',
    downgrade_model_id  BIGINT          DEFAULT NULL COMMENT '降級目標模型ID',
    used_value          DECIMAL(20,2)   NOT NULL DEFAULT 0 COMMENT '本期已用量',
    status              TINYINT         NOT NULL DEFAULT 1 COMMENT '狀態: 1=啟用 0=停用',
    deleted             TINYINT         NOT NULL DEFAULT 0 COMMENT '邏輯刪除',
    created_by          VARCHAR(50)     DEFAULT NULL COMMENT '創建人',
    updated_by          VARCHAR(50)     DEFAULT NULL COMMENT '最後更新人',
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    INDEX idx_role_name (role_name),
    INDEX idx_status (status),
    INDEX idx_quota_type (quota_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='員工角色額度策略';
