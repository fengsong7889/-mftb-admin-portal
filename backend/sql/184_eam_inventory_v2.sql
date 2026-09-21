-- =====================================================================
-- 184: 资产盘点 v2（范围快照 / 账实核对 / 并发版本 / 结构化统计 / 操作日志）
-- ---------------------------------------------------------------------
-- 说明：本文件为一次性参考文档，实际幂等迁移由
--       EamSchemaMigrationInitializer 的 applyOnce("eam:schema-v33-inventory-v2") 执行。
-- 兼容：新列均允许历史为空；旧任务 contract_version=1，新任务=2；不 DROP/TRUNCATE。
-- =====================================================================

-- ---------- 盘点任务主表扩列 ----------
ALTER TABLE biz_eam_inventory_task ADD COLUMN contract_version INT NOT NULL DEFAULT 1 COMMENT '契约版本(1=历史,2=新版)';
ALTER TABLE biz_eam_inventory_task ADD COLUMN scope_mode VARCHAR(16) NULL COMMENT '范围模式 CONDITION/ALL';
ALTER TABLE biz_eam_inventory_task ADD COLUMN scope_json TEXT NULL COMMENT '范围原始条件快照 JSON';
ALTER TABLE biz_eam_inventory_task ADD COLUMN scope_resolved_json TEXT NULL COMMENT '展开后范围 ID/名称快照 JSON';
ALTER TABLE biz_eam_inventory_task ADD COLUMN scope_hash VARCHAR(64) NULL COMMENT '范围指纹';
ALTER TABLE biz_eam_inventory_task ADD COLUMN snapshot_at DATETIME NULL COMMENT '应盘清单冻结时间';
ALTER TABLE biz_eam_inventory_task ADD COLUMN owner_id BIGINT NULL COMMENT '盘点负责人 sys_user.id';
ALTER TABLE biz_eam_inventory_task ADD COLUMN owner_emp_no VARCHAR(32) NULL COMMENT '盘点负责人工号';
ALTER TABLE biz_eam_inventory_task ADD COLUMN owner_name VARCHAR(128) NULL COMMENT '盘点负责人姓名';
ALTER TABLE biz_eam_inventory_task ADD COLUMN created_by_id BIGINT NULL COMMENT '创建人 sys_user.id';
ALTER TABLE biz_eam_inventory_task ADD COLUMN created_by_emp_no VARCHAR(32) NULL COMMENT '创建人工号';
ALTER TABLE biz_eam_inventory_task ADD COLUMN task_revision INT NOT NULL DEFAULT 0 COMMENT '任务修订号(并发控制)';
ALTER TABLE biz_eam_inventory_task ADD COLUMN checked_count INT NOT NULL DEFAULT 0 COMMENT '已核对数';
ALTER TABLE biz_eam_inventory_task ADD COLUMN confirmed_count INT NOT NULL DEFAULT 0 COMMENT '实物确认数(完好+损坏)';
ALTER TABLE biz_eam_inventory_task ADD COLUMN anomaly_count INT NOT NULL DEFAULT 0 COMMENT '异常资产去重数';
ALTER TABLE biz_eam_inventory_task ADD COLUMN not_checked_count INT NOT NULL DEFAULT 0 COMMENT '未完成核对数';
ALTER TABLE biz_eam_inventory_task ADD COLUMN missing_count INT NOT NULL DEFAULT 0 COMMENT '未找到数';
ALTER TABLE biz_eam_inventory_task ADD COLUMN damaged_count INT NOT NULL DEFAULT 0 COMMENT '实物损坏数';
ALTER TABLE biz_eam_inventory_task ADD COLUMN location_diff_count INT NOT NULL DEFAULT 0 COMMENT '位置差异数';
ALTER TABLE biz_eam_inventory_task ADD COLUMN holder_diff_count INT NOT NULL DEFAULT 0 COMMENT '持有人差异数';
ALTER TABLE biz_eam_inventory_task ADD COLUMN recheck_count INT NOT NULL DEFAULT 0 COMMENT '期间业务变更待复核数';
ALTER TABLE biz_eam_inventory_task ADD COLUMN close_type VARCHAR(16) NULL COMMENT '结束方式 COMPLETE/PARTIAL/CANCEL';
ALTER TABLE biz_eam_inventory_task ADD COLUMN close_reason VARCHAR(500) NULL COMMENT '结束原因';
ALTER TABLE biz_eam_inventory_task ADD COLUMN closed_at DATETIME NULL COMMENT '结束时间';
ALTER TABLE biz_eam_inventory_task ADD COLUMN closed_by VARCHAR(128) NULL COMMENT '结束操作人';
ALTER TABLE biz_eam_inventory_task ADD COLUMN closed_by_id BIGINT NULL COMMENT '结束操作人 ID';
ALTER TABLE biz_eam_inventory_task ADD COLUMN cancelled_at DATETIME NULL COMMENT '取消时间';
ALTER TABLE biz_eam_inventory_task ADD COLUMN cancelled_by VARCHAR(128) NULL COMMENT '取消操作人';
ALTER TABLE biz_eam_inventory_task ADD COLUMN cancel_reason VARCHAR(500) NULL COMMENT '取消原因';
ALTER TABLE biz_eam_inventory_task ADD COLUMN create_request_key VARCHAR(64) NULL COMMENT '创建幂等键';
ALTER TABLE biz_eam_inventory_task ADD COLUMN create_request_hash VARCHAR(64) NULL COMMENT '创建请求摘要';
ALTER TABLE biz_eam_inventory_task ADD UNIQUE KEY uk_task_create_request (created_by_id, create_request_key);
ALTER TABLE biz_eam_inventory_task ADD INDEX idx_task_owner (owner_id);
ALTER TABLE biz_eam_inventory_task ADD INDEX idx_task_created_by (created_by);

-- ---------- 盘点明细表扩列 ----------
ALTER TABLE biz_eam_inventory_item ADD COLUMN contract_version INT NOT NULL DEFAULT 1 COMMENT '契约版本(1=历史,2=新版)';
ALTER TABLE biz_eam_inventory_item ADD COLUMN book_snapshot_json TEXT NULL COMMENT '发起时账面快照 JSON';
ALTER TABLE biz_eam_inventory_item ADD COLUMN ledger_fingerprint VARCHAR(64) NULL COMMENT '发起时台账关键字段指纹';
ALTER TABLE biz_eam_inventory_item ADD COLUMN actual_location_id BIGINT NULL COMMENT '实际位置 ID';
ALTER TABLE biz_eam_inventory_item ADD COLUMN actual_location_name VARCHAR(256) NULL COMMENT '实际位置名称快照';
ALTER TABLE biz_eam_inventory_item ADD COLUMN actual_location_other VARCHAR(256) NULL COMMENT '其他位置自由文本';
ALTER TABLE biz_eam_inventory_item ADD COLUMN location_check_result VARCHAR(16) NULL COMMENT '位置核对 CONSISTENT/DIFF/PENDING/NA';
ALTER TABLE biz_eam_inventory_item ADD COLUMN actual_holder_type VARCHAR(16) NULL COMMENT '实际持有人类型 EMPLOYEE/NONE/EXTERNAL/PENDING';
ALTER TABLE biz_eam_inventory_item ADD COLUMN actual_holder_id BIGINT NULL COMMENT '实际持有人 sys_user.id';
ALTER TABLE biz_eam_inventory_item ADD COLUMN actual_holder_emp_no VARCHAR(32) NULL COMMENT '实际持有人工号';
ALTER TABLE biz_eam_inventory_item ADD COLUMN actual_holder_name VARCHAR(128) NULL COMMENT '实际持有人姓名';
ALTER TABLE biz_eam_inventory_item ADD COLUMN actual_holder_external VARCHAR(128) NULL COMMENT '外部保管名称';
ALTER TABLE biz_eam_inventory_item ADD COLUMN holder_check_result VARCHAR(16) NULL COMMENT '持有人核对 CONSISTENT/DIFF/PENDING/NA';
ALTER TABLE biz_eam_inventory_item ADD COLUMN check_method VARCHAR(16) NULL COMMENT '核对方式 ONSITE/HOLDER/DOC';
ALTER TABLE biz_eam_inventory_item ADD COLUMN checked_at DATETIME NULL COMMENT '核对时间';
ALTER TABLE biz_eam_inventory_item ADD COLUMN checked_by VARCHAR(128) NULL COMMENT '核对操作人';
ALTER TABLE biz_eam_inventory_item ADD COLUMN checked_by_id BIGINT NULL COMMENT '核对操作人 ID';
ALTER TABLE biz_eam_inventory_item ADD COLUMN checked_by_emp_no VARCHAR(32) NULL COMMENT '核对操作人工号';
ALTER TABLE biz_eam_inventory_item ADD COLUMN item_revision INT NOT NULL DEFAULT 0 COMMENT '明细修订号(并发控制)';
ALTER TABLE biz_eam_inventory_item ADD COLUMN current_snapshot_json TEXT NULL COMMENT '核对时台账快照 JSON';
ALTER TABLE biz_eam_inventory_item ADD COLUMN closed_snapshot_json TEXT NULL COMMENT '结束时台账比对快照 JSON';
ALTER TABLE biz_eam_inventory_item ADD COLUMN recheck_required TINYINT NOT NULL DEFAULT 0 COMMENT '期间业务变更待复核';
ALTER TABLE biz_eam_inventory_item ADD COLUMN anomaly_flag TINYINT NOT NULL DEFAULT 0 COMMENT '是否异常资产(去重统计)';
ALTER TABLE biz_eam_inventory_item ADD COLUMN holder_name VARCHAR(128) NULL COMMENT '发起时使用人姓名快照';
ALTER TABLE biz_eam_inventory_item ADD COLUMN holder_emp_no VARCHAR(32) NULL COMMENT '发起时使用人工号快照';
ALTER TABLE biz_eam_inventory_item ADD COLUMN holder_dept VARCHAR(128) NULL COMMENT '发起时资产归属部门快照';

-- 新版明细 (task_id, asset_id) 条件唯一（仅 contract_version>=2 生效），历史重复不冲突
ALTER TABLE biz_eam_inventory_item ADD COLUMN unique_scope_asset BIGINT
    GENERATED ALWAYS AS (CASE WHEN contract_version >= 2 THEN asset_id ELSE NULL END) STORED COMMENT '新版行资产唯一作用域';
ALTER TABLE biz_eam_inventory_item ADD UNIQUE KEY uk_item_task_asset_new (task_id, unique_scope_asset);
ALTER TABLE biz_eam_inventory_item ADD INDEX idx_item_status (status);
ALTER TABLE biz_eam_inventory_item ADD INDEX idx_item_anomaly (task_id, anomaly_flag);

-- ---------- 盘点操作日志表 ----------
CREATE TABLE IF NOT EXISTS biz_eam_inventory_event (
    id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    task_id          BIGINT       NOT NULL COMMENT '盘点任务 ID',
    item_id          BIGINT       NULL     COMMENT '盘点明细 ID(任务级动作为空)',
    action           VARCHAR(32)  NOT NULL COMMENT '动作 create/check/batch/reset/complete/partial/cancel',
    request_key      VARCHAR(64)  NULL     COMMENT '幂等键',
    request_hash     VARCHAR(64)  NULL     COMMENT '请求摘要',
    before_json      TEXT         NULL     COMMENT '变更前值 JSON',
    after_json       TEXT         NULL     COMMENT '变更后值 JSON',
    reason           VARCHAR(500) NULL     COMMENT '原因/说明',
    operator_id      BIGINT       NULL     COMMENT '登录操作人 ID',
    operator_name    VARCHAR(128) NULL     COMMENT '操作人姓名',
    operator_emp_no  VARCHAR(32)  NULL     COMMENT '操作人工号',
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    UNIQUE KEY uk_event_request (task_id, request_key),
    KEY idx_event_task (task_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产盘点操作日志表';
