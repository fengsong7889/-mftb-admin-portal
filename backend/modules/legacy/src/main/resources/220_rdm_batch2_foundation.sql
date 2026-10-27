-- 220: 產研交付（RDM）Batch 2 — 分層並行底座（Phase 1A）
--      版本键: rdm:schema:v3.1
--      方言：MySQL 8.x，全部 CREATE TABLE IF NOT EXISTS，可重复执行（幂等）。
--      ALTER TABLE 新增列（rdm_delivery_item 范围版本列 / rdm_task_dependency 跨交付项依赖列）
--      与 idx_structure_parent 索引由 RdmSchemaMigrationInitializer 逐列条件添加（MySQL 8 无
--      ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS，写进脚本重跑会撞 duplicate）。

-- ── 1. 范围变更证据失效记录 ──
-- 交付项范围变更（scope_version+1）后，旧的测试批次/验收记录/发布检查都基于旧范围，
-- 不能删除（要留痕），但要显式登记「因范围变更而失效」，避免旧证据被当作当前范围的质量凭证。
CREATE TABLE IF NOT EXISTS rdm_evidence_invalidation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    delivery_item_id BIGINT NOT NULL COMMENT '交付项ID',
    evidence_type VARCHAR(32) NOT NULL COMMENT '证据类型:test_batch/acceptance/release_check',
    evidence_id BIGINT NOT NULL COMMENT '证据记录ID',
    old_scope_version INT NOT NULL COMMENT '旧范围版本',
    new_scope_version INT NOT NULL COMMENT '新范围版本',
    invalidated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '失效时间',
    invalidated_by BIGINT COMMENT '操作人',
    reason VARCHAR(300) COMMENT '失效原因',
    KEY idx_delivery_item (delivery_item_id),
    KEY idx_evidence (evidence_type, evidence_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM范围变更证据失效记录';

-- ── 2. 幂等请求日志 ──
-- 分层并行下的写接口（冻结范围/范围变更/跨交付项依赖）需支持客户端重试而不产生副作用，
-- 以 request_id 唯一键缓存首次结果，重复请求直接回放。
CREATE TABLE IF NOT EXISTS rdm_idempotent_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    request_id VARCHAR(64) NOT NULL COMMENT '请求幂等ID',
    biz_type VARCHAR(32) NOT NULL COMMENT '业务类型',
    result_json JSON COMMENT '缓存结果',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_request_id (request_id),
    KEY idx_biz_type (biz_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM幂等请求日志';
