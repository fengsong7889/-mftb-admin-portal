-- =====================================================================
-- 151: 归还/借用/赔付完整闭环扩展
--   biz_eam_return 扩展列      归还状态、异常处理、处置结果
--   biz_eam_borrow              借用登记主表
--   biz_eam_compensation        赔付记录主表
--   biz_eam_compensation_payment 赔付收款/退款流水
--   biz_eam_compensation_review  赔付找回复核记录
--   sys_menu                    新增菜单项
-- =====================================================================

-- ───────────── biz_eam_return 扩展列 ─────────────
-- 归还状态：completed/exception_pending/exception_closed
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS return_status VARCHAR(20) NOT NULL DEFAULT 'completed'
    COMMENT '归还状态：completed/exception_pending/exception_closed';

-- 资产状况：normal/damaged/lost
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS asset_condition VARCHAR(20) NOT NULL DEFAULT 'normal'
    COMMENT '归还时资产状况：normal/damaged/lost';

-- 异常说明
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS exception_reason VARCHAR(500) NULL
    COMMENT '异常原因说明（asset_condition != normal 时必填）';

-- 处置结果：idle/scrapped/written_off
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS disposition VARCHAR(20) NULL
    COMMENT '实物处置结果：idle/scrapped/written_off';

-- 处置日期
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS disposition_date DATE NULL
    COMMENT '处置日期';

-- 处置凭证
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS disposition_evidence_id BIGINT NULL
    COMMENT '处置凭证 ID';

-- 是否已找回
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS recovered TINYINT NOT NULL DEFAULT 0
    COMMENT '是否已找回：0=否 1=是';

-- 找回日期
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS recovered_date DATE NULL
    COMMENT '找回日期';

-- 找回说明
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS recovered_note VARCHAR(500) NULL
    COMMENT '找回说明';

-- 实际归还人（代还场景）
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS actual_returnee_id BIGINT NULL
    COMMENT '实际归还人 ID（代还场景）';

-- 实际归还人姓名
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS actual_returnee_name VARCHAR(64) NULL
    COMMENT '实际归还人姓名';

-- 来源类型：claim/borrow
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS source_type VARCHAR(10) NOT NULL DEFAULT 'claim'
    COMMENT '来源类型：claim/borrow';

-- 来源 ID（claim_id 或 borrow_id）
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS source_id BIGINT NOT NULL
    COMMENT '来源 ID（biz_eam_claim.id 或 biz_eam_borrow.id）';

-- 赔付记录 ID（关联 biz_eam_compensation.id）
ALTER TABLE biz_eam_return ADD COLUMN IF NOT EXISTS compensation_id BIGINT NULL
    COMMENT '关联赔付记录 ID';

-- 索引
ALTER TABLE biz_eam_return ADD INDEX IF NOT EXISTS idx_return_status (return_status);
ALTER TABLE biz_eam_return ADD INDEX IF NOT EXISTS idx_source (source_type, source_id);
ALTER TABLE biz_eam_return ADD INDEX IF NOT EXISTS idx_compensation (compensation_id);

-- ───────────── 借用登记主表 ─────────────
CREATE TABLE IF NOT EXISTS biz_eam_borrow (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    borrow_no         VARCHAR(32)  NOT NULL COMMENT '借用编号（JY+YYYYMMDD+4位）',
    asset_id          BIGINT       NOT NULL COMMENT '资产 ID（biz_eam_asset.id）',
    holder_id         BIGINT       NOT NULL COMMENT '借用人 ID（sys_user.id）',
    holder_name       VARCHAR(64)  NOT NULL COMMENT '借用人姓名快照',
    department        VARCHAR(100) NOT NULL COMMENT '借用部门',
    operator_id       BIGINT       NULL     COMMENT '操作人 ID（sys_user.id）',
    operator_name     VARCHAR(64)  NOT NULL COMMENT '操作人姓名快照',

    -- 状态机
    status            VARCHAR(20)  NOT NULL DEFAULT 'active'
                      COMMENT 'active/overdue/returned/cancelled',

    -- 借用内容
    start_date        DATE         NOT NULL COMMENT '借出日期',
    due_date          DATE         NOT NULL COMMENT '到期日期',
    return_date       DATE         NULL     COMMENT '实际归还日期',
    purpose           VARCHAR(500) NULL     COMMENT '借用用途',

    -- 续借
    renew_count       INT          NOT NULL DEFAULT 0 COMMENT '续借次数',

    -- 关联
    return_id         BIGINT       NULL     COMMENT '关联归还记录 ID',

    -- 审计
    created_by        VARCHAR(64)  NULL     COMMENT '创建人',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by        VARCHAR(64)  NULL     COMMENT '最后更新人',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted           TINYINT      NOT NULL DEFAULT 0,

    UNIQUE KEY uk_borrow_no (borrow_no),
    INDEX idx_asset (asset_id),
    INDEX idx_holder (holder_id),
    INDEX idx_status (status),
    INDEX idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产借用登记表';

-- ───────────── 赔付记录主表 ─────────────
CREATE TABLE IF NOT EXISTS biz_eam_compensation (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    comp_no           VARCHAR(32)  NOT NULL COMMENT '赔付编号（PF+YYYYMMDD+4位）',
    return_id         BIGINT       NOT NULL COMMENT '关联归还记录 ID',
    asset_id          BIGINT       NOT NULL COMMENT '资产 ID',
    asset_name        VARCHAR(200) NOT NULL COMMENT '资产名称快照',
    asset_no          VARCHAR(64)  NOT NULL COMMENT '资产编号快照',
    holder_id         BIGINT       NOT NULL COMMENT '原持有人 ID',
    holder_name       VARCHAR(64)  NOT NULL COMMENT '原持有人姓名快照',

    -- 损失信息
    damage_type       VARCHAR(20)  NOT NULL COMMENT '损失类型：damage/loss',
    cause             VARCHAR(20)  NULL     COMMENT '原因：human/natural/third_party/quality',

    -- 责任认定
    party             VARCHAR(20)  NULL     COMMENT '责任对象：employee/department/company/none',
    responsible_id    BIGINT       NULL     COMMENT '责任人 ID（sys_user.id）',
    responsible_name  VARCHAR(64)  NULL     COMMENT '责任人姓名',
    department        VARCHAR(100) NULL     COMMENT '责任部门',

    -- 金额
    amount            BIGINT       NOT NULL DEFAULT 0 COMMENT '应赔金额（分）',
    net_paid          BIGINT       NOT NULL DEFAULT 0 COMMENT '净收款（分）',

    -- 状态机
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      COMMENT 'pending/confirmed/partially_paid/paid/waived/refund_pending',
    review_required   TINYINT      NOT NULL DEFAULT 0 COMMENT '是否需要找回复核：0=否 1=是',

    -- 定责信息
    basis             VARCHAR(500) NULL     COMMENT '定责依据',
    reason            VARCHAR(500) NULL     COMMENT '异常说明',

    -- 免赔
    waive_reason      VARCHAR(500) NULL     COMMENT '免赔原因（status=waived 时必填）',

    -- 操作人
    operator_id       BIGINT       NULL     COMMENT '操作人 ID',
    operator_name     VARCHAR(64)  NOT NULL COMMENT '操作人姓名快照',

    -- 审计
    created_by        VARCHAR(64)  NULL     COMMENT '创建人',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by        VARCHAR(64)  NULL     COMMENT '最后更新人',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted           TINYINT      NOT NULL DEFAULT 0,

    UNIQUE KEY uk_comp_no (comp_no),
    INDEX idx_return (return_id),
    INDEX idx_asset (asset_id),
    INDEX idx_holder (holder_id),
    INDEX idx_status (status),
    INDEX idx_review_required (review_required)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产赔付记录表';

-- ───────────── 赔付收款/退款流水 ─────────────
CREATE TABLE IF NOT EXISTS biz_eam_compensation_payment (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    compensation_id   BIGINT       NOT NULL COMMENT '关联赔付记录 ID',
    type              VARCHAR(10)  NOT NULL COMMENT '类型：payment/refund',
    amount            BIGINT       NOT NULL COMMENT '金额（分）',
    payment_date      DATE         NOT NULL COMMENT '业务日期',
    reason            VARCHAR(500) NULL     COMMENT '说明',
    evidence_id       BIGINT       NULL     COMMENT '凭证 ID',
    operator_id       BIGINT       NULL     COMMENT '操作人 ID',
    operator_name     VARCHAR(64)  NOT NULL COMMENT '操作人姓名',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_compensation (compensation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赔付收款/退款流水表';

-- ───────────── 赔付找回复核记录 ─────────────
CREATE TABLE IF NOT EXISTS biz_eam_compensation_review (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    compensation_id   BIGINT       NOT NULL COMMENT '关联赔付记录 ID',
    review_date       DATE         NOT NULL COMMENT '复核日期',
    before_amount     BIGINT       NOT NULL COMMENT '原应赔金额（分）',
    after_amount      BIGINT       NOT NULL COMMENT '复核后应赔金额（分）',
    reason            VARCHAR(500) NOT NULL COMMENT '调整理由',
    operator_id       BIGINT       NULL     COMMENT '操作人 ID',
    operator_name     VARCHAR(64)  NOT NULL COMMENT '操作人姓名',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_compensation (compensation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赔付找回复核记录表';

-- ───────────── 凭证附件表扩展 ─────────────
-- 复用 biz_eam_claim_evidence，增加业务类型字段
ALTER TABLE biz_eam_claim_evidence ADD COLUMN IF NOT EXISTS biz_type VARCHAR(20) NOT NULL DEFAULT 'claim'
    COMMENT '业务类型：claim/return/borrow/compensation';

ALTER TABLE biz_eam_claim_evidence ADD COLUMN IF NOT EXISTS biz_id BIGINT NULL
    COMMENT '业务 ID（根据 biz_type 关联不同表）';

ALTER TABLE biz_eam_claim_evidence ADD INDEX IF NOT EXISTS idx_biz (biz_type, biz_id);

-- ───────────── 菜单配置 ─────────────
-- 归还管理菜单（如已存在则跳过）
INSERT IGNORE INTO sys_menu (id, parent_id, name, path, component, menu_type, permission, icon, sort_order, status)
VALUES (1510, 1100, '归还管理', '/asset-return', '/AssetManagement/AssetReturn', 'menu', 'asset-return', 'SwapOutlined', 30, 1);

-- 借用管理菜单
INSERT IGNORE INTO sys_menu (id, parent_id, name, path, component, menu_type, permission, icon, sort_order, status)
VALUES (1511, 1100, '借用管理', '/asset-borrow', '/AssetManagement/AssetBorrow', 'menu', 'asset-borrow', 'FieldTimeOutlined', 31, 1);

-- 损坏赔付菜单
INSERT IGNORE INTO sys_menu (id, parent_id, name, path, component, menu_type, permission, icon, sort_order, status)
VALUES (1512, 1100, '损坏赔付', '/asset-compensation', '/AssetManagement/AssetCompensation', 'menu', 'asset-compensation', 'WarningOutlined', 32, 1);

-- ───────────── 角色菜单关联（admin 角色自动获得新菜单权限） ─────────────
INSERT IGNORE INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'admin' AND m.id IN (1510, 1511, 1512);
