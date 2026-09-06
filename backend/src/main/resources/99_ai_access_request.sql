-- 99_ai_access_request.sql
-- AI 使用申請表：員工申請模型權限與額度的審批流程記錄
CREATE TABLE IF NOT EXISTS ai_access_request (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID',
    applicant_id        BIGINT NOT NULL COMMENT '申請人ID (sys_user.id)',
    applicant_name      VARCHAR(64) DEFAULT NULL COMMENT '申請人姓名（冗餘）',
    department_id       BIGINT DEFAULT NULL COMMENT '申請人部門ID',
    department_name     VARCHAR(128) DEFAULT NULL COMMENT '部門名稱（冗餘）',
    position_id         BIGINT DEFAULT NULL COMMENT '職位ID',
    position_name       VARCHAR(64) DEFAULT NULL COMMENT '職位名稱（冗餘）',
    request_type        VARCHAR(32) NOT NULL COMMENT '申請類型: model_only / model_and_quota / quota_only',
    requested_models    TEXT DEFAULT NULL COMMENT '期望模型ID列表 JSON数组',
    usage_description   VARCHAR(1000) NOT NULL COMMENT '用途說明（必填）',
    usage_scenarios     JSON DEFAULT NULL COMMENT '使用場景 JSON 數組 e.g. ["copywriting","data_analysis"]',
    usage_frequency     VARCHAR(20) DEFAULT NULL COMMENT '使用頻率: occasional/regular/heavy',
    status              VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '狀態: pending/approved/rejected',
    workflow_instance_id BIGINT DEFAULT NULL COMMENT '關聯的審批流程實例ID',
    -- 審批人填寫的授權結果 --
    approved_models     TEXT DEFAULT NULL COMMENT '最終授權模型ID列表 JSON数组',
    approved_quota_type VARCHAR(32) DEFAULT NULL COMMENT '限額類型: requests/tokens',
    approved_quota_value DECIMAL(18,2) DEFAULT NULL COMMENT '限額值',
    approved_quota_period VARCHAR(16) DEFAULT NULL COMMENT '限額週期: daily/monthly',
    approved_over_limit_action VARCHAR(16) DEFAULT NULL COMMENT '超閾動作: reject/approve/downgrade',
    -- 審批信息 --
    approver_id         BIGINT DEFAULT NULL COMMENT '審批人ID',
    approver_name       VARCHAR(64) DEFAULT NULL COMMENT '審批人姓名',
    approve_remark      VARCHAR(500) DEFAULT NULL COMMENT '審批意見',
    approved_at         DATETIME DEFAULT NULL COMMENT '審批時間',
    -- 通用字段 --
    created_by          VARCHAR(64) DEFAULT NULL COMMENT '創建人',
    updated_by          VARCHAR(64) DEFAULT NULL COMMENT '更新人',
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    deleted             TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除: 0=正常 1=已刪除',
    INDEX idx_applicant (applicant_id),
    INDEX idx_status (status),
    INDEX idx_request_type (request_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI使用申請表';
