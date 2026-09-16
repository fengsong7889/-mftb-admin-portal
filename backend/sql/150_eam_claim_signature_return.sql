-- =====================================================================
-- 150: 领用管理——签名、归还及事件闭环
--   biz_eam_claim           领用登记主表
--   biz_eam_claim_evidence  领用凭证（签名图片等）
--   biz_eam_return          归还记录
--   biz_eam_claim_event     领用操作事件流水
--   biz_eam_asset 补列      current_holder_id / active_claim_id
-- =====================================================================

-- ───────────── 领用登记主表 ─────────────
CREATE TABLE IF NOT EXISTS biz_eam_claim (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    claim_no          VARCHAR(32)  NOT NULL COMMENT '领用编号（LY+YYYYMMDD+4位）',
    asset_id          BIGINT       NOT NULL COMMENT '资产 ID（biz_eam_asset.id）',
    employee_id       BIGINT       NOT NULL COMMENT '领用人 ID（sys_user.id）',
    operator_id       BIGINT       NULL     COMMENT '操作人 ID（sys_user.id，代办时与 employee_id 不同）',
    operator_name     VARCHAR(64)  NOT NULL COMMENT '操作人姓名快照',

    -- 状态机
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending_signature'
                      COMMENT 'pending_signature / claimed / returned / cancelled',
    signature_status  VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      COMMENT 'pending / signed / proxy_pending / not_required',

    -- 领用内容
    claim_date        DATE         NOT NULL COMMENT '领用日期',
    claim_reason      VARCHAR(500) NULL     COMMENT '领用用途/原因',
    remark            VARCHAR(500) NULL     COMMENT '备注',

    -- 代办
    proxy_mode        TINYINT      NOT NULL DEFAULT 0 COMMENT '0=本人登记 1=管理员代办',
    proxy_reason      VARCHAR(500) NULL     COMMENT '代办原因（proxy_mode=1 必填）',

    -- 签署
    signed_at         DATETIME     NULL     COMMENT '实际签署时间',
    signature_evidence_id BIGINT   NULL     COMMENT '签名凭证 ID（biz_eam_claim_evidence.id）',

    -- 归还
    return_date       DATE         NULL     COMMENT '归还日期',
    return_reason     VARCHAR(500) NULL     COMMENT '归还原因',
    return_id         BIGINT       NULL     COMMENT '关联归还记录 ID',

    -- 取消
    cancelled_reason  VARCHAR(500) NULL     COMMENT '取消原因',

    -- 内容完整性
    content_hash      VARCHAR(64)  NULL     COMMENT '领用内容 SHA-256 摘要（签署时快照）',

    -- 审计
    created_by        VARCHAR(64)  NULL     COMMENT '创建人',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by        VARCHAR(64)  NULL     COMMENT '最后更新人',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted           TINYINT      NOT NULL DEFAULT 0,

    UNIQUE KEY uk_claim_no (claim_no),
    INDEX idx_asset (asset_id),
    INDEX idx_employee (employee_id),
    INDEX idx_status (status),
    INDEX idx_signature (signature_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产领用登记表';

-- ───────────── 领用凭证（签名图片等） ─────────────
CREATE TABLE IF NOT EXISTS biz_eam_claim_evidence (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    claim_id          BIGINT       NOT NULL COMMENT '关联领用 ID',
    evidence_type     VARCHAR(20)  NOT NULL DEFAULT 'signature'
                      COMMENT 'signature / photo / return_photo',
    file_name         VARCHAR(255) NULL     COMMENT '原始文件名',
    storage_path      VARCHAR(500) NOT NULL COMMENT '存储路径或 Data URL',
    content_type      VARCHAR(64)  NULL     COMMENT 'MIME 类型',
    file_size         INT          NULL     COMMENT '文件大小（字节）',
    content_hash      VARCHAR(64)  NULL     COMMENT '文件 SHA-256',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    deleted           TINYINT      NOT NULL DEFAULT 0,

    INDEX idx_claim (claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用/归还凭证附件表';

-- ───────────── 归还记录 ─────────────
CREATE TABLE IF NOT EXISTS biz_eam_return (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    return_no         VARCHAR(32)  NOT NULL COMMENT '归还编号（GH+YYYYMMDD+4位）',
    claim_id          BIGINT       NOT NULL COMMENT '关联领用 ID',
    asset_id          BIGINT       NOT NULL COMMENT '资产 ID',
    employee_id       BIGINT       NOT NULL COMMENT '归还人 ID',
    operator_name     VARCHAR(64)  NOT NULL COMMENT '操作人姓名',

    return_date       DATE         NOT NULL COMMENT '归还日期',
    return_reason     VARCHAR(500) NULL     COMMENT '归还原因',
    condition_note    VARCHAR(500) NULL     COMMENT '归还时资产状况说明',

    return_evidence_id BIGINT      NULL     COMMENT '归还凭证 ID',

    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by        VARCHAR(64)  NULL,
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted           TINYINT      NOT NULL DEFAULT 0,

    UNIQUE KEY uk_return_no (return_no),
    INDEX idx_claim (claim_id),
    INDEX idx_asset (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产归还记录表';

-- ───────────── 领用操作事件流水 ─────────────
CREATE TABLE IF NOT EXISTS biz_eam_claim_event (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    claim_id          BIGINT       NOT NULL COMMENT '关联领用 ID',
    event_type        VARCHAR(30)  NOT NULL
                      COMMENT 'created / signed / proxy_signed / returned / cancelled / supplementary',
    operator_name     VARCHAR(64)  NOT NULL COMMENT '操作人',
    remark            VARCHAR(500) NULL     COMMENT '事件备注',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_claim (claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用操作事件流水表';

-- ───────────── biz_eam_asset 补列 ─────────────
-- current_holder_id: 当前持有人 sys_user.id（NULL 表示无人持有）
ALTER TABLE biz_eam_asset ADD COLUMN IF NOT EXISTS current_holder_id BIGINT NULL
    COMMENT '当前持有人 ID（sys_user.id，领用后写入，归还后清空）';

-- active_claim_id: 当前有效领用 ID（NULL 表示无活跃领用）
ALTER TABLE biz_eam_asset ADD COLUMN IF NOT EXISTS active_claim_id BIGINT NULL
    COMMENT '当前活跃领用 ID（biz_eam_claim.id，归还/取消后清空）';
