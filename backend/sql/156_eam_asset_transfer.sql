-- 156: 資產調撥單表
-- 調撥（Transfer）= 物資部將單件在用資產轉移至新使用人/新歸屬部門（in_use → in_use，與交接的批量場景互補）
-- 落單快照 from/to 前後對比，同步更新 biz_eam_asset 的 currentHolderId / user_name / department
-- 建表同時由 EamSchemaMigrationInitializer (eam:schema-v4) 幂等執行，本腳本供生產手動執行/審計留檔

CREATE TABLE IF NOT EXISTS biz_eam_transfer (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transfer_no VARCHAR(64) NOT NULL COMMENT '調撥單號（DB+YYYYMMDD+4位）',
    asset_id BIGINT NOT NULL COMMENT '資產ID',
    asset_no VARCHAR(64) NOT NULL COMMENT '資產編號快照',
    asset_name VARCHAR(200) DEFAULT '' COMMENT '資產名稱快照',
    from_user_id BIGINT NULL COMMENT '原使用人ID',
    from_user_name VARCHAR(128) DEFAULT '' COMMENT '原使用人快照',
    from_department VARCHAR(128) DEFAULT '' COMMENT '原歸屬部門快照',
    to_user_id BIGINT NULL COMMENT '新使用人ID',
    to_user_name VARCHAR(128) NOT NULL COMMENT '新使用人姓名',
    to_user_emp_id VARCHAR(32) DEFAULT '' COMMENT '新使用人工號',
    to_department VARCHAR(128) NOT NULL COMMENT '新歸屬部門',
    transfer_date DATE NOT NULL COMMENT '調撥日期',
    reason VARCHAR(500) NOT NULL COMMENT '調撥原因',
    status VARCHAR(32) NOT NULL DEFAULT 'done' COMMENT '狀態：done/cancelled',
    operator_id BIGINT NULL COMMENT '操作人ID',
    operator_name VARCHAR(128) NOT NULL COMMENT '操作人姓名',
    remark VARCHAR(512) NULL COMMENT '備註',
    created_by VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(128) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted TINYINT NOT NULL DEFAULT 0,
    UNIQUE KEY uk_transfer_no (transfer_no),
    KEY idx_asset_id (asset_id),
    KEY idx_asset_no (asset_no),
    KEY idx_transfer_date (transfer_date),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='資產調撥單';
