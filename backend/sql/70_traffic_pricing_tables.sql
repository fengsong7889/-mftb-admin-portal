-- ============================================================
-- MFTB 投流广告模块 - 计价明细表
-- 数据库：MySQL 8.0+
-- 用途：存储投流广告的预设档位和阶梯单价配置
-- ============================================================

-- ============================================================
-- 一、投流广告档位明细表（预设流量包）
-- 每个定价配置下可设置多个档位，商家可选择购买
-- on_sale: 1=在售 2=下架
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_traffic_tier (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键 ID',
    pricing_id      BIGINT        NOT NULL                   COMMENT '计价主表 ID (biz_ad_pricing_traffic.id)',
    tier_name       VARCHAR(128)  NOT NULL                   COMMENT '档位名称（如：基础版/标准版/进阶版）',
    tier_code       VARCHAR(64)   NOT NULL                   COMMENT '档位编码',
    impressions     INT           NOT NULL                   COMMENT '曝光次数',
    price           DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '档位价格 (MOP)',
    sell_days       INT                                      COMMENT '销售周期（多少天内有效）',
    on_sale         TINYINT       NOT NULL DEFAULT 1         COMMENT '售卖状态：1=在售 2=下架',
    sort            INT           NOT NULL DEFAULT 0         COMMENT '排序号（从小到大）',
    remark          VARCHAR(500)                             COMMENT '备注',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_tier_pricing (pricing_id),
    KEY idx_ad_tier_on_sale (on_sale),
    KEY idx_ad_tier_sort (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投流广告档位明细表';

-- ============================================================
-- 二、投流广告阶梯单价表（自定义购买）
-- 按曝光数量区间设置不同单价
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_traffic_ladder (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键 ID',
    pricing_id      BIGINT        NOT NULL                   COMMENT '计价主表 ID (biz_ad_pricing_traffic.id)',
    min_qty         INT           NOT NULL                   COMMENT '最低数量（含）',
    max_qty         INT           COMMENT '最高数量（含，NULL 表示无上限）',
    unit_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '单价 (MOP/1000 次曝光)',
    sort            INT           NOT NULL DEFAULT 0         COMMENT '排序号（从小到大）',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_ladder_pricing (pricing_id),
    KEY idx_ad_ladder_range (min_qty, max_qty),
    KEY idx_ad_ladder_sort (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投流广告阶梯单价表';

-- ============================================================
-- 三、初始数据示例
-- ============================================================

-- 3.1 初始化示例档位（假设存在 pricing_id=1 的配置）
INSERT INTO biz_ad_pricing_traffic_tier (pricing_id, tier_name, tier_code, impressions, price, sell_days, on_sale, sort, remark)
SELECT 1, '基础版', 'TRAFFIC_TIER_BASIC', 10000, 150.00, 30, 1, 1, '适合新店测试'
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) t WHERE NOT EXISTS (SELECT 1 FROM biz_ad_pricing_traffic_tier WHERE tier_code = 'TRAFFIC_TIER_BASIC'));

INSERT INTO biz_ad_pricing_traffic_tier (pricing_id, tier_name, tier_code, impressions, price, sell_days, on_sale, sort, remark)
SELECT 1, '标准版', 'TRAFFIC_TIER_STANDARD', 50000, 600.00, 30, 1, 2, '适合日常推广'
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) t WHERE NOT EXISTS (SELECT 1 FROM biz_ad_pricing_traffic_tier WHERE tier_code = 'TRAFFIC_TIER_STANDARD'));

INSERT INTO biz_ad_pricing_traffic_tier (pricing_id, tier_name, tier_code, impressions, price, sell_days, on_sale, sort, remark)
SELECT 1, '进阶版', 'TRAFFIC_TIER_ADVANCED', 100000, 1100.00, 30, 1, 3, '适合大型活动'
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) t WHERE NOT EXISTS (SELECT 1 FROM biz_ad_pricing_traffic_tier WHERE tier_code = 'TRAFFIC_TIER_ADVANCED'));

-- 3.2 初始化示例阶梯单价（假设存在 pricing_id=1 的配置）
INSERT INTO biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty, unit_price, sort)
SELECT 1, 1000, 9999, 0.15, 1
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) t WHERE NOT EXISTS (SELECT 1 FROM biz_ad_pricing_traffic_ladder WHERE min_qty = 1000 AND max_qty = 9999));

INSERT INTO biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty, unit_price, sort)
SELECT 1, 10000, 49999, 0.12, 2
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) t WHERE NOT EXISTS (SELECT 1 FROM biz_ad_pricing_traffic_ladder WHERE min_qty = 10000 AND max_qty = 49999));

INSERT INTO biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty, unit_price, sort)
SELECT 1, 50000, 99999, 0.10, 3
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) t WHERE NOT EXISTS (SELECT 1 FROM biz_ad_pricing_traffic_ladder WHERE min_qty = 50000 AND max_qty = 99999));

INSERT INTO biz_ad_pricing_traffic_ladder (pricing_id, min_qty, max_qty, unit_price, sort)
SELECT 1, 100000, NULL, 0.08, 4
WHERE NOT EXISTS (SELECT 1 FROM (SELECT 1) t WHERE NOT EXISTS (SELECT 1 FROM biz_ad_pricing_traffic_ladder WHERE min_qty = 100000 AND max_qty IS NULL));

