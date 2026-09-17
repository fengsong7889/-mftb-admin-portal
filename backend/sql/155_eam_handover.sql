-- ============================================================
-- 155: EAM 交接管理表結構
-- biz_eam_handover      交接單主表（離職/調崗批量交接）
-- biz_eam_handover_item 交接單明細（每件資產一行）
-- ============================================================

CREATE TABLE IF NOT EXISTS biz_eam_handover (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    handover_no     VARCHAR(64)  NOT NULL COMMENT '交接單號（JJ+YYYYMMDD+4位）',
    from_user_id    BIGINT       NULL     COMMENT '交出人 ID（sys_user.id，可能已離職為 NULL）',
    from_user_name  VARCHAR(128) NOT NULL COMMENT '交出人姓名快照',
    from_department VARCHAR(128) NOT NULL COMMENT '交出人部門快照',
    to_user_id      BIGINT       NULL     COMMENT '接收人 ID',
    to_user_name    VARCHAR(128) NOT NULL COMMENT '接收人姓名',
    to_department   VARCHAR(128) NOT NULL COMMENT '接收人部門',
    handover_date   DATE         NOT NULL COMMENT '交接日期',
    asset_count     INT          NOT NULL DEFAULT 0 COMMENT '交接資產數量',
    reason          VARCHAR(32)  NOT NULL COMMENT '交接原因：resign/transfer/other',
    status          VARCHAR(32)  NOT NULL DEFAULT 'done' COMMENT '狀態：done/cancelled',
    operator_id     BIGINT       NULL     COMMENT '操作人 ID',
    operator_name   VARCHAR(128) NOT NULL COMMENT '操作人姓名',
    remark          VARCHAR(512) NULL     COMMENT '備註',
    created_by      VARCHAR(128) NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(128) NULL,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted         TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_handover_no (handover_no),
    INDEX idx_from_user (from_user_name),
    INDEX idx_to_user (to_user_name),
    INDEX idx_handover_date (handover_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='資產交接單';

CREATE TABLE IF NOT EXISTS biz_eam_handover_item (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    handover_id     BIGINT       NOT NULL COMMENT '關聯交接單 ID',
    asset_id        BIGINT       NOT NULL COMMENT '資產 ID',
    asset_no        VARCHAR(64)  NOT NULL COMMENT '資產編號快照',
    asset_name      VARCHAR(256) NOT NULL COMMENT '資產名稱快照',
    asset_type      VARCHAR(128) NULL     COMMENT '資產分類快照',
    old_department  VARCHAR(128) NULL     COMMENT '交接前部門',
    new_department  VARCHAR(128) NULL     COMMENT '交接後部門',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_handover_id (handover_id),
    INDEX idx_asset_id (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='資產交接單明細';
