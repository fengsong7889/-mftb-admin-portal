-- 145: 资产遗失找回模块表结构
-- 新建 biz_eam_loss（遗失单主表）+ biz_eam_loss_event（遗失事件日志表）
-- 资产状态扩展：lost / pending_inspection / written_off
-- 赔付表增加 loss_id 关联列
-- 报废表增加 loss_id 关联列（区分实物报废与遗失核销）

-- ══════════════════════════════════════════════════════════════
-- 1. biz_eam_loss 遗失单主表
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS biz_eam_loss (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    loss_no VARCHAR(32) NOT NULL COMMENT '遗失编号（YS+YYYYMMDD+4位）',
    source_type VARCHAR(16) NOT NULL COMMENT '来源类型：claim/borrow/return/direct',
    source_id BIGINT NOT NULL DEFAULT 0 COMMENT '来源 ID（claim_id / borrow_id / return_id / 0=直接报失）',
    return_id BIGINT NULL COMMENT '关联归还记录 ID（来源为归还时有值）',
    asset_id BIGINT NOT NULL COMMENT '资产 ID',
    asset_no VARCHAR(64) NOT NULL COMMENT '资产编号（快照）',
    asset_name VARCHAR(200) NOT NULL COMMENT '资产名称（快照）',
    asset_type VARCHAR(100) NULL COMMENT '资产分类（快照）',
    brand VARCHAR(100) NULL COMMENT '品牌（快照）',
    original_holder_id BIGINT NULL COMMENT '原持有人 ID（快照）',
    original_holder_name VARCHAR(64) NULL COMMENT '原持有人姓名（快照）',
    original_department VARCHAR(128) NULL COMMENT '原归属部门（快照）',
    last_known_location VARCHAR(200) NULL COMMENT '最后已知位置',
    loss_date DATE NOT NULL COMMENT '遗失日期（发生或发现日期）',
    loss_reason VARCHAR(500) NOT NULL COMMENT '报失原因',
    reporter_id BIGINT NULL COMMENT '报失登记人 ID',
    reporter_name VARCHAR(64) NULL COMMENT '报失登记人姓名',
    status VARCHAR(20) NOT NULL DEFAULT 'searching' COMMENT '状态：searching/found_pending/recovered/written_off',
    recovered_date DATE NULL COMMENT '找回日期',
    recovered_location VARCHAR(200) NULL COMMENT '找回地点',
    recovered_by_id BIGINT NULL COMMENT '找回登记人 ID',
    recovered_by_name VARCHAR(64) NULL COMMENT '找回登记人姓名',
    recovered_note VARCHAR(500) NULL COMMENT '找回说明',
    inspection_result VARCHAR(20) NULL COMMENT '验收结果：normal/damaged/scrapped',
    inspection_date DATE NULL COMMENT '验收日期',
    inspection_note VARCHAR(500) NULL COMMENT '验收说明',
    write_off_date DATE NULL COMMENT '核销日期',
    write_off_reason VARCHAR(500) NULL COMMENT '核销原因',
    write_off_evidence_id BIGINT NULL COMMENT '核销凭证 ID',
    compensation_id BIGINT NULL COMMENT '关联赔付记录 ID',
    repair_id BIGINT NULL COMMENT '关联维修记录 ID',
    scrap_id BIGINT NULL COMMENT '关联报废记录 ID',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    request_key VARCHAR(64) NULL COMMENT '幂等请求键',
    from_migration TINYINT NOT NULL DEFAULT 0 COMMENT '是否历史回填：0=否 1=是',
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(64) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted TINYINT NOT NULL DEFAULT 0,
    UNIQUE KEY uk_loss_no (loss_no),
    UNIQUE KEY uk_asset_open (asset_id, status) COMMENT '同一资产至多一条未结束遗失单（written_off/recovered 为终态）',
    KEY idx_loss_no (loss_no),
    KEY idx_asset_id (asset_id),
    KEY idx_status (status),
    KEY idx_source (source_type, source_id),
    KEY idx_return_id (return_id),
    KEY idx_compensation_id (compensation_id),
    KEY idx_loss_date (loss_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产遗失单';

-- ═══════════════════════════════════════════════════════════════
-- 2. biz_eam_loss_event 遗失事件日志表
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS biz_eam_loss_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    loss_id BIGINT NOT NULL COMMENT '关联遗失单 ID',
    event_type VARCHAR(32) NOT NULL COMMENT '事件类型：create/edit/recover/inspect/write_off/follow_up/compensation_linked',
    event_desc VARCHAR(500) NOT NULL COMMENT '事件描述',
    before_value TEXT NULL COMMENT '变更前值（JSON）',
    after_value TEXT NULL COMMENT '变更后值（JSON）',
    change_reason VARCHAR(500) NULL COMMENT '变更原因（编辑时必填）',
    operator_id BIGINT NULL COMMENT '操作人 ID',
    operator_name VARCHAR(64) NULL COMMENT '操作人姓名',
    evidence_id BIGINT NULL COMMENT '关联凭证 ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted TINYINT NOT NULL DEFAULT 0,
    KEY idx_loss_id (loss_id),
    KEY idx_event_type (event_type),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产遗失事件日志';

-- ═══════════════════════════════════════════════════════════════
-- 3. 赔付表增加 loss_id 关联列
-- ═══════════════════════════════════════════════════════════════
-- 使用 INFORMATION_SCHEMA 检查列是否存在（MySQL 8 不支持 ADD COLUMN IF NOT EXISTS）
SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_compensation' AND COLUMN_NAME = 'loss_id'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE biz_eam_compensation ADD COLUMN loss_id BIGINT NULL COMMENT ''关联遗失单 ID'' AFTER return_id',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为 loss_id 添加索引
SET @idx_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_compensation' AND INDEX_NAME = 'idx_loss_id'
);
SET @sql2 = IF(@idx_exists = 0,
    'ALTER TABLE biz_eam_compensation ADD INDEX idx_loss_id (loss_id)',
    'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ═══════════════════════════════════════════════════════════════
-- 4. 报废表增加 loss_id 关联列
-- ═══════════════════════════════════════════════════════════════
SET @col_exists2 = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_eam_scrap' AND COLUMN_NAME = 'loss_id'
);
SET @sql3 = IF(@col_exists2 = 0,
    'ALTER TABLE biz_eam_scrap ADD COLUMN loss_id BIGINT NULL COMMENT ''关联遗失单 ID（遗失核销时有值）'' AFTER return_id',
    'SELECT 1'
);
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;
