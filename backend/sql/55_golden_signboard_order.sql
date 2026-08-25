-- ============================================================
-- 55. 金字招牌订单明细表 + 订单编号生成规则
-- 背景：金字招牌按「标签 x 日期」维度存储订单明细，
--       一行 = 一个「标签类型 x 投放日期」格子。
-- 执行时间：2026-08-25
-- ============================================================

-- ============================================================
-- 一、金字招牌订单明细表
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_order_item_signboard (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_id        BIGINT        NOT NULL                   COMMENT '订单主表ID (biz_ad_order.id)',
    order_no        VARCHAR(64)   NOT NULL                   COMMENT '订单编号快照',
    biz_date        DATE          NOT NULL                   COMMENT '投放日期',
    label_type      VARCHAR(32)   NOT NULL                   COMMENT '标签类型（hot/popular/sales/rating/repurchase/favorites/customers）',
    original_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '格子原价（标签日单价）',
    sale_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '实付分摊价（折扣后）',
    refund_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '已退款金额（取消扣费梯度）',
    delivery_status TINYINT       NOT NULL DEFAULT 1         COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_item_signboard_order (order_id),
    KEY idx_ad_item_signboard_cell (biz_date, label_type),
    KEY idx_ad_item_signboard_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌订单明细表（标签x日期）';

-- ============================================================
-- 二、金字招牌订单编号生成规则
-- ============================================================
INSERT IGNORE INTO `sys_biz_seq_rule` (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `remark`)
VALUES ('ad_order_signboard', '金字招牌訂單', '廣告銷售', 'DDZP', 'YYYYMMDD', 4, 0, '{prefix} + YYYYMMDD + {n}位自增序號');
