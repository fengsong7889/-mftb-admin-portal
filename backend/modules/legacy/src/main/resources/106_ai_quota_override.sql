-- ============================================================
-- 106_ai_quota_override.sql
-- AI 訪問申請閉環：額度獨立授予表 + 申請表擴展字段
--
-- 1. ai_quota_override：員工通過審批獲得的「獨立/額外額度」，
--    不修改底層組織架構（部門/職位/角色）配置，僅對本人生效；
--    查詢時動態過濾過期記錄（expire_at），無需定時任務。
-- 2. ai_access_request 擴展：
--    - 申請側：apply_reason（場景入口）、credentials（憑證附件）
--    - 審批側：approved_model_configs（模型能力配置）、
--              quota_effective_type / quota_expire_at（臨時/永久額度）
-- 幂等腳本，可重複執行（列已存在時由 DataInitializer 捕獲異常忽略）
-- ============================================================

-- 1. 員工獨立額度授予表（審批下發）
CREATE TABLE IF NOT EXISTS ai_quota_override (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID',
    user_id             BIGINT NOT NULL COMMENT '員工ID (sys_user.id)',
    username            VARCHAR(64) NOT NULL COMMENT '員工賬號（冗餘，用量聚合鍵）',
    source_request_id   BIGINT DEFAULT NULL COMMENT '來源申請ID (ai_access_request.id)',
    model_id            BIGINT DEFAULT NULL COMMENT '限定模型ID（NULL=全部模型）',
    quota_type          VARCHAR(32) NOT NULL DEFAULT 'token' COMMENT '限額類型: token/request',
    quota_value         DECIMAL(18,2) NOT NULL COMMENT '限額值',
    quota_period        VARCHAR(16) NOT NULL DEFAULT 'daily' COMMENT '限額週期: daily/monthly',
    effective_type      VARCHAR(16) NOT NULL DEFAULT 'permanent' COMMENT '生效類型: permanent=永久 temporary=臨時',
    effective_at        DATETIME DEFAULT NULL COMMENT '生效時間',
    expire_at           DATETIME DEFAULT NULL COMMENT '臨時額度到期時間（NULL=永久）',
    over_limit_action    VARCHAR(16) DEFAULT NULL COMMENT '超閾動作: reject/approve/downgrade',
    status              TINYINT NOT NULL DEFAULT 1 COMMENT '狀態: 1=啟用 0=停用',
    created_by          VARCHAR(64) DEFAULT NULL COMMENT '創建人',
    updated_by          VARCHAR(64) DEFAULT NULL COMMENT '更新人',
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    deleted             TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除: 0=正常 1=已刪除',
    UNIQUE KEY uk_user_request (user_id, source_request_id),
    INDEX idx_user (user_id),
    INDEX idx_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='員工獨立額度授予表（審批下發）';

-- 2. 申請表擴展字段（申請側）
ALTER TABLE ai_access_request
    ADD COLUMN apply_reason VARCHAR(32) DEFAULT NULL
    COMMENT '申請場景入口: no-models/no-quota/no-both/topup/add-model/quota-exhausted/needs-approval'
    AFTER request_type;

ALTER TABLE ai_access_request
    ADD COLUMN credentials TEXT DEFAULT NULL
    COMMENT '申請憑證附件 JSON數組 [{name,type,size,dataUrl}]'
    AFTER usage_frequency;

-- 3. 申請表擴展字段（審批側：授權結果）
ALTER TABLE ai_access_request
    ADD COLUMN approved_model_configs TEXT DEFAULT NULL
    COMMENT '授權模型能力配置 JSON數組 [{modelId,visionSupport,functionCalling,jsonMode,streaming,thinkingMode}]'
    AFTER approved_models;

ALTER TABLE ai_access_request
    ADD COLUMN quota_effective_type VARCHAR(16) DEFAULT NULL
    COMMENT '額度生效類型: permanent=永久 temporary=臨時'
    AFTER approved_over_limit_action;

ALTER TABLE ai_access_request
    ADD COLUMN quota_expire_at DATETIME DEFAULT NULL
    COMMENT '臨時額度到期時間'
    AFTER quota_effective_type;
