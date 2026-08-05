-- ============================================================
-- MFTB 搜广推系统 - 新店广告差异层
-- 架构: 共享核心层(biz_ad_algorithm / biz_ad_order) + 新店广告差异层(本文件)
-- 售卖单位: 日期（无商圈/餐段维度），纯粹使用赠送天数抵扣，实付为 $0
-- 注意: 使用 CREATE TABLE IF NOT EXISTS, 幂等可重复执行
-- ============================================================

-- ============================================================
-- 一、新店广告订单明细表（差异层）
-- 一行 = 一个投放日期（无商圈/餐段维度）
-- delivery_status: 1=待投放 2=已投放 3=已退款
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_order_item_new_store (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_id        BIGINT        NOT NULL                   COMMENT '订单主表ID (biz_ad_order.id)',
    order_no        VARCHAR(64)   NOT NULL                   COMMENT '订单编号快照',
    biz_date        DATE          NOT NULL                   COMMENT '投放日期',
    delivery_status TINYINT       NOT NULL DEFAULT 1         COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_item_ns_order (order_id),
    KEY idx_ad_item_ns_cell (biz_date),
    KEY idx_ad_item_ns_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='新店广告订单明细表';

-- ============================================================
-- 二、订单主表补充字段（gift_days / gift_amount 快照）
-- 若尚未添加则补建（幂等）
-- ============================================================
ALTER TABLE biz_ad_order
    ADD COLUMN IF NOT EXISTS gift_days   INT            NOT NULL DEFAULT 0   COMMENT '赠送天数抵扣快照' AFTER refund_amount,
    ADD COLUMN IF NOT EXISTS gift_amount DECIMAL(12,2)  NOT NULL DEFAULT 0.00 COMMENT '赠送抵扣金额快照' AFTER gift_days;

-- ============================================================
-- 三、预置新店广告算法数据（幂等: NOT EXISTS 保护）
-- ============================================================
INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, status, deleted)
SELECT 'XD00001', '新店廣告-外賣版', 2, 'mFood', 2, 2, 1, 0
WHERE NOT EXISTS (
    SELECT 1 FROM biz_ad_algorithm WHERE algo_code = 'XD00001'
);

INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, status, deleted)
SELECT 'XD00002', '新店廣告-超市版', 2, 'flashBee', 3, 3, 1, 0
WHERE NOT EXISTS (
    SELECT 1 FROM biz_ad_algorithm WHERE algo_code = 'XD00002'
);
