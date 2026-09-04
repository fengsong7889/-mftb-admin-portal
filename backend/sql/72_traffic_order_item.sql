-- ============================================================
-- MFTB 投流广告模块 - 订单明细表及索引优化
-- 数据库：MySQL 8.0+
-- 用途：补充投流广告订单明细表和性能优化
-- ============================================================

-- ============================================================
-- 一、投流广告订单明细表（biz_ad_order_item_traffic）
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_order_item_traffic (
    id                  BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键 ID',
    order_id            BIGINT        NOT NULL                   COMMENT '订单主表 ID (biz_ad_order.id)',
    order_no            VARCHAR(64)   NOT NULL                   COMMENT '订单编号快照',
    mode                VARCHAR(32)   NOT NULL                   COMMENT '购买方式: tier=预设档位 custom=自定义数量',
    package_name        VARCHAR(255)  NOT NULL                   COMMENT '流量包名称（档位名称或描述）',
    impressions         INT           NOT NULL                   COMMENT '购买曝光次数',
    unit_price          DECIMAL(12,6) NOT NULL DEFAULT 0.000000  COMMENT '实际单价 (MOP/次，实付金额÷购买曝光)',
    delivery_slot       VARCHAR(32)                             COMMENT '投流时段: business=主营时段 allday=全天',
    original_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '订单原价',
    sale_price          DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '实付金额',
    refund_price        DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '已退款金额',
    refund_fee_percent  INT                                      COMMENT '退款手续费比例%',
    consumed_impressions INT           DEFAULT 0                 COMMENT '已消耗曝光次数（APP 端回写）',
    delivery_status     TINYINT       NOT NULL DEFAULT 1         COMMENT '投放状态：1=投放中 2=已消耗完毕 3=已退款',
    deleted             TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at          DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at          DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_item_traffic_order (order_id),
    KEY idx_ad_item_traffic_order_no (order_no),
    KEY idx_ad_item_traffic_status (delivery_status),
    KEY idx_ad_item_traffic_consumed (consumed_impressions)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投流广告订单明细表';

-- ============================================================
-- 二、性能优化索引补充
-- ============================================================

-- 2.1 投流定价配置表 - 增加复合索引（查询优化）
CREATE INDEX IF NOT EXISTS idx_traffic_pricing_algo_channel 
ON biz_ad_pricing_traffic (algo_id, biz_channel, status);

-- 2.2 投流档位表 - 增加复合索引（查询优化）
CREATE INDEX IF NOT EXISTS idx_traffic_tier_pricing_sale 
ON biz_ad_pricing_traffic_tier (pricing_id, on_sale, sort);

-- 2.3 投流阶梯单价表 - 增加复合索引（查询优化）
CREATE INDEX IF NOT EXISTS idx_traffic_ladder_pricing_range 
ON biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty);

-- 2.4 订单明细表 - 增加覆盖索引（常用查询场景）
CREATE INDEX IF NOT EXISTS idx_traffic_item_order_status 
ON biz_ad_order_item_traffic (order_id, delivery_status);

