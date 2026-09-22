-- =====================================================================
-- 186_consumable_brand_company.sql
-- 耗材管理改造：所属品牌 + 购买公司 + 成本/归属快照 + 业务单据表
--
-- 目标模型（与 ConsumableSchemaInitializer.migrateBrandCompany 幂等等效）：
--   1. item  : 新增 company_brand / purchase_company_id / purchase_company（档案级归属，新建/编辑必填）
--   2. stock : 新增归属快照 + avg_cost(移动加权均价) / total_cost(库存成本金额) / updated_by
--   3. txn   : 新增 amount(变动成本金额) + 归属/部门/领用人快照 + biz_date + idempotency_key
--   4. claim : 新增归属/部门快照 + cost_amount（出库成本合计）
--   5. claim_item : 新增归属快照 + actual_unit_cost/amount（实际出库成本）+ returned_qty
--   6. 新表  : inbound/inbound_item（入库单）/ return（退料）/ adjust（调整）/ transfer（调拨）
--
-- 幂等由 Java 迁移负责（先查 information_schema 再 ALTER）；本文件为一次性参考文档。
-- =====================================================================

-- 1. 耗材主数据：所属品牌 + 购买公司
ALTER TABLE biz_eam_consumable_item
    ADD COLUMN company_brand       BIGINT       DEFAULT NULL COMMENT '所属品牌ID（sys_company_brand）',
    ADD COLUMN purchase_company_id BIGINT       DEFAULT NULL COMMENT '购买公司ID（sys_purchase_company）',
    ADD COLUMN purchase_company    VARCHAR(100) DEFAULT ''   COMMENT '购买公司名称快照';

-- 2. 库存：归属快照 + 移动加权成本 + 操作人
ALTER TABLE biz_eam_consumable_stock
    ADD COLUMN company_brand       BIGINT       DEFAULT NULL COMMENT '所属品牌ID快照',
    ADD COLUMN purchase_company_id BIGINT       DEFAULT NULL COMMENT '购买公司ID快照',
    ADD COLUMN purchase_company    VARCHAR(100) DEFAULT ''   COMMENT '购买公司名称快照',
    ADD COLUMN avg_cost            DECIMAL(16,6) NOT NULL DEFAULT 0 COMMENT '移动加权平均单位成本',
    ADD COLUMN total_cost          DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '库存成本金额',
    ADD COLUMN updated_by          VARCHAR(64)  DEFAULT ''   COMMENT '库存最后操作人';

-- 3. 流水：成本金额 + 归属/部门/领用人 + 记账日期 + 幂等键
ALTER TABLE biz_eam_consumable_txn
    ADD COLUMN amount             DECIMAL(18,2) DEFAULT NULL COMMENT '变动成本金额（入库正/出库负）',
    ADD COLUMN company_brand      BIGINT        DEFAULT NULL COMMENT '所属品牌ID快照',
    ADD COLUMN purchase_company_id BIGINT       DEFAULT NULL COMMENT '购买公司ID快照',
    ADD COLUMN department_id      BIGINT        DEFAULT NULL COMMENT '承担部门ID',
    ADD COLUMN department         VARCHAR(100)  DEFAULT ''   COMMENT '承担部门名称快照',
    ADD COLUMN applicant_id       BIGINT        DEFAULT NULL COMMENT '领用人ID（sys_user.id）',
    ADD COLUMN applicant_emp_id   VARCHAR(32)   DEFAULT ''   COMMENT '领用人工号',
    ADD COLUMN applicant_name     VARCHAR(64)   DEFAULT ''   COMMENT '领用人姓名',
    ADD COLUMN biz_date           DATE          DEFAULT NULL COMMENT '业务记账日期',
    ADD COLUMN idempotency_key    VARCHAR(80)   DEFAULT NULL COMMENT '幂等键（来源单据行）';
ALTER TABLE biz_eam_consumable_txn ADD UNIQUE KEY uk_txn_idem (idempotency_key);

-- 4. 领用单：归属/部门快照 + 成本合计
ALTER TABLE biz_eam_consumable_claim
    ADD COLUMN company_brand       BIGINT       DEFAULT NULL COMMENT '所属品牌ID快照',
    ADD COLUMN purchase_company_id BIGINT       DEFAULT NULL COMMENT '购买公司ID快照',
    ADD COLUMN purchase_company    VARCHAR(100) DEFAULT ''   COMMENT '购买公司名称快照',
    ADD COLUMN department_id       BIGINT       DEFAULT NULL COMMENT '承担部门ID',
    ADD COLUMN cost_amount         DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '出库成本合计';

-- 5. 领用明细：归属 + 实际成本 + 退料数量
ALTER TABLE biz_eam_consumable_claim_item
    ADD COLUMN company_brand       BIGINT        DEFAULT NULL COMMENT '所属品牌ID快照',
    ADD COLUMN purchase_company_id BIGINT        DEFAULT NULL COMMENT '购买公司ID快照',
    ADD COLUMN actual_unit_cost    DECIMAL(16,6) DEFAULT NULL COMMENT '实际出库加权均价',
    ADD COLUMN amount              DECIMAL(18,2) DEFAULT NULL COMMENT '出库成本金额',
    ADD COLUMN returned_qty        INT           NOT NULL DEFAULT 0 COMMENT '已退料数量';

-- 6. 入库单（采购/期初/手工/调整入库统一入口）
CREATE TABLE IF NOT EXISTS biz_eam_consumable_inbound (
    id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
    inbound_no         VARCHAR(40)  NOT NULL COMMENT '入库单号（HCRK+YYYYMMDD+4位）',
    inbound_type       VARCHAR(20)  NOT NULL DEFAULT 'in_manual' COMMENT 'in_purchase/in_manual/in_init',
    company_brand      BIGINT       DEFAULT NULL COMMENT '所属品牌ID',
    purchase_company_id BIGINT      DEFAULT NULL COMMENT '购买公司ID',
    purchase_company   VARCHAR(100) DEFAULT '' COMMENT '购买公司名称快照',
    supplier_id        BIGINT       DEFAULT NULL COMMENT '供应商ID',
    supplier_name      VARCHAR(128) DEFAULT '' COMMENT '供应商名称快照',
    po_id              BIGINT       DEFAULT NULL COMMENT '采购订单ID',
    po_no              VARCHAR(40)  DEFAULT '' COMMENT '采购订单号快照',
    source_type        VARCHAR(20)  DEFAULT '' COMMENT '来源类型：po/manual/init',
    source_id          BIGINT       DEFAULT NULL COMMENT '来源单据ID',
    biz_date           DATE         DEFAULT NULL COMMENT '入库日期',
    remark             VARCHAR(500) DEFAULT '' COMMENT '备注',
    created_by         VARCHAR(64)  DEFAULT '',
    created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_by         VARCHAR(64)  DEFAULT '',
    updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted            TINYINT      NOT NULL DEFAULT 0,
    UNIQUE KEY uk_inbound_no (inbound_no),
    KEY idx_po (po_id), KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材入库单';

CREATE TABLE IF NOT EXISTS biz_eam_consumable_inbound_item (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    inbound_id    BIGINT        NOT NULL COMMENT '入库单ID',
    item_id       BIGINT        NOT NULL COMMENT '耗材ID',
    item_code     VARCHAR(32)   DEFAULT '' COMMENT '耗材编码快照',
    item_name     VARCHAR(128)  DEFAULT '' COMMENT '耗材名称快照',
    spec          VARCHAR(200)  DEFAULT '' COMMENT '规格快照',
    unit          VARCHAR(32)   DEFAULT '' COMMENT '单位快照',
    location_id   BIGINT        NOT NULL DEFAULT 0 COMMENT '入库仓库ID',
    location_name VARCHAR(200)  DEFAULT '' COMMENT '仓库名称快照',
    qty           INT           NOT NULL COMMENT '入库数量',
    unit_price    DECIMAL(16,6) DEFAULT NULL COMMENT '实际入库单价',
    amount        DECIMAL(18,2) DEFAULT NULL COMMENT '入库成本金额',
    source_line_id BIGINT       DEFAULT NULL COMMENT '来源验收明细ID（幂等）',
    KEY idx_inbound (inbound_id), KEY idx_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材入库单明细';

-- 7. 退料单
CREATE TABLE IF NOT EXISTS biz_eam_consumable_return (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    return_no     VARCHAR(40)   NOT NULL COMMENT '退料单号（HCTL+...）',
    claim_id      BIGINT        DEFAULT NULL COMMENT '原领用单ID',
    claim_item_id BIGINT        DEFAULT NULL COMMENT '原领用明细ID',
    item_id       BIGINT        NOT NULL COMMENT '耗材ID',
    location_id   BIGINT        NOT NULL DEFAULT 0 COMMENT '退回仓库ID',
    location_name VARCHAR(200)  DEFAULT '',
    qty           INT           NOT NULL COMMENT '退料数量',
    unit_cost     DECIMAL(16,6) DEFAULT NULL COMMENT '退回单价（原出库均价）',
    amount        DECIMAL(18,2) DEFAULT NULL COMMENT '退回成本金额',
    applicant_id  BIGINT        DEFAULT NULL COMMENT '原领用人ID',
    applicant_name VARCHAR(64)  DEFAULT '',
    department_id BIGINT        DEFAULT NULL COMMENT '承担部门ID',
    department    VARCHAR(100)  DEFAULT '',
    reason        VARCHAR(500)  DEFAULT '',
    operator      VARCHAR(64)   DEFAULT '',
    created_by    VARCHAR(64)   DEFAULT '',
    created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
    deleted       TINYINT       NOT NULL DEFAULT 0,
    UNIQUE KEY uk_return_no (return_no),
    KEY idx_claim_item (claim_item_id), KEY idx_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材退料单';

-- 8. 库存调整单（盘盈/盘亏）
CREATE TABLE IF NOT EXISTS biz_eam_consumable_adjust (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    adjust_no     VARCHAR(40)   NOT NULL COMMENT '调整单号（HCTZ+...）',
    item_id       BIGINT        NOT NULL COMMENT '耗材ID',
    location_id   BIGINT        NOT NULL DEFAULT 0 COMMENT '仓库ID',
    location_name VARCHAR(200)  DEFAULT '',
    direction     VARCHAR(10)   NOT NULL COMMENT 'in=盘盈/out=盘亏',
    qty           INT           NOT NULL COMMENT '调整数量（正整数）',
    unit_cost     DECIMAL(16,6) DEFAULT NULL COMMENT '调整单价',
    amount        DECIMAL(18,2) DEFAULT NULL COMMENT '调整金额',
    reason        VARCHAR(500)  NOT NULL DEFAULT '' COMMENT '调整原因',
    operator      VARCHAR(64)   DEFAULT '',
    created_by    VARCHAR(64)   DEFAULT '',
    created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
    deleted       TINYINT       NOT NULL DEFAULT 0,
    UNIQUE KEY uk_adjust_no (adjust_no),
    KEY idx_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存调整单';

-- 9. 库存调拨单（同档案同公司跨仓）
CREATE TABLE IF NOT EXISTS biz_eam_consumable_transfer (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    transfer_no      VARCHAR(40)   NOT NULL COMMENT '调拨单号（HCDB+...）',
    item_id          BIGINT        NOT NULL COMMENT '耗材ID',
    from_location_id BIGINT        NOT NULL DEFAULT 0 COMMENT '调出仓库ID',
    from_location_name VARCHAR(200) DEFAULT '',
    to_location_id   BIGINT        NOT NULL DEFAULT 0 COMMENT '调入仓库ID',
    to_location_name VARCHAR(200)  DEFAULT '',
    qty              INT           NOT NULL COMMENT '调拨数量',
    unit_cost        DECIMAL(16,6) DEFAULT NULL COMMENT '调出成本单价',
    amount           DECIMAL(18,2) DEFAULT NULL COMMENT '调拨成本金额',
    operator         VARCHAR(64)   DEFAULT '',
    created_by       VARCHAR(64)   DEFAULT '',
    created_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
    deleted          TINYINT       NOT NULL DEFAULT 0,
    UNIQUE KEY uk_transfer_no (transfer_no),
    KEY idx_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材库存调拨单';
