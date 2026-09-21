-- 178: 资产报废记录表（支持归还处置→报废自动流转）
CREATE TABLE IF NOT EXISTS biz_eam_scrap (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id          BIGINT       NOT NULL COMMENT '资产 ID',
    asset_no          VARCHAR(64)  NOT NULL COMMENT '资产编号（快照）',
    asset_name        VARCHAR(200) NOT NULL COMMENT '资产名称（快照）',
    asset_type        VARCHAR(100) NULL     COMMENT '资产分类（快照）',
    brand             VARCHAR(100) NULL     COMMENT '品牌（快照）',

    -- 报废信息
    scrap_date        DATE         NOT NULL COMMENT '报废日期',
    apply_by          VARCHAR(64)  NOT NULL COMMENT '申请人',
    emp_id            VARCHAR(32)  NULL     COMMENT '申请人工号',
    reason            VARCHAR(500) NOT NULL COMMENT '报废原因',
    residual_value    DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '残值（MOP）',
    dispose_type      VARCHAR(20)  NULL     COMMENT '处置方式：sale/donate/recycle/destroy',
    appraisal         VARCHAR(500) NULL     COMMENT '鉴定意见',
    remark            VARCHAR(500) NULL     COMMENT '备注',

    -- 来源关联
    return_id         BIGINT       NULL     COMMENT '关联归还记录 ID（从归还处置自动创建时填写）',

    -- 状态
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      COMMENT 'pending/approved/rejected/cancelled',

    -- 审计
    created_by        VARCHAR(64)  NULL     COMMENT '创建人',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by        VARCHAR(64)  NULL     COMMENT '最后更新人',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted           TINYINT      NOT NULL DEFAULT 0,

    INDEX idx_asset (asset_id),
    INDEX idx_return (return_id),
    INDEX idx_status (status),
    INDEX idx_scrap_date (scrap_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产报废记录表';
