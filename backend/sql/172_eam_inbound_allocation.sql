-- 172: 验收入库多结果分配模型支持
-- 为批次明细添加前端稳定 ID 和换货来源关联列；为批次添加契约版本和幂等请求键
-- 对应方案 §5（正式提交契约）、§6（换货来源链）

-- 1. 批次明细：前端生成的稳定行 ID（提交时传入，用于幂等对照和草稿恢复）
ALTER TABLE biz_eam_inbound_batch_item
    ADD COLUMN client_line_id VARCHAR(64) NULL COMMENT '前端稳定ID（InspectionAllocation.clientLineId）';

-- 2. 批次明细：来源换货明细 ID（换货重验时关联原换货批次明细）
ALTER TABLE biz_eam_inbound_batch_item
    ADD COLUMN source_exchange_item_id BIGINT NULL COMMENT '来源换货明细ID（换货重验关联）';

-- 3. 批次：契约版本（v2 支持多结果明细、让步接收、换货来源链）
ALTER TABLE biz_eam_inbound_batch
    ADD COLUMN contract_version INT NULL DEFAULT NULL COMMENT '契约版本（v2=多结果分配）';

-- 4. 批次：幂等请求键
ALTER TABLE biz_eam_inbound_batch
    ADD COLUMN request_key VARCHAR(64) NULL COMMENT '幂等请求键';

-- 5. 索引
ALTER TABLE biz_eam_inbound_batch_item
    ADD INDEX idx_batch_item_client_line (client_line_id);

ALTER TABLE biz_eam_inbound_batch_item
    ADD INDEX idx_batch_item_source_exchange (source_exchange_item_id);

ALTER TABLE biz_eam_inbound_batch
    ADD UNIQUE INDEX uk_batch_request_key (po_id, request_key);
