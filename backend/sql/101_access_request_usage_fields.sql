-- 101_access_request_usage_fields.sql
-- 申請表字段改造：移除 estimated_requests，新增 usage_scenarios / usage_frequency

-- 1. 新增使用場景字段（JSON 數組）— 幂等：先檢查再添加
ALTER TABLE ai_access_request
    ADD COLUMN usage_scenarios JSON DEFAULT NULL
    COMMENT '使用場景 JSON 數組 e.g. ["copywriting","data_analysis"]'
    AFTER usage_description;

-- 2. 新增使用頻率字段
ALTER TABLE ai_access_request
    ADD COLUMN usage_frequency VARCHAR(20) DEFAULT NULL
    COMMENT '使用頻率: occasional/regular/heavy'
    AFTER usage_scenarios;

-- 3. 移除舊的預估使用量字段（MySQL 不支持 IF EXISTS，由 DataInitializer 捕獲異常）
ALTER TABLE ai_access_request DROP COLUMN estimated_requests;
