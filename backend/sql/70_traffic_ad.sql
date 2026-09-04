-- ============================================================
-- MFTB 搜广推系统 - 投流广告差异层（算法类型 15）
-- 架构: 共享核心层(biz_ad_algorithm / biz_ad_order) + 投流广告差异层(本文件)
-- 业务模型: 预付流量包（对标 DUO+），买 N 次曝光 = X MOP
--   1. 按业务频道(1=美食外卖 2=超市百货 3=团购到店)分别定价，一个算法一个频道一条配置
--   2. 每个频道可配置: 预设档位(流量包套餐) + 自定义阶梯单价(买越多单价越低)
--   3. 购买方式二选一: 选择预设档位 / 自定义曝光数量(按阶梯单价计价)
--   4. 退款按剩余未消耗曝光折算: 退款金额 = 剩余曝光 × 实际单价 × (1 - 手续费比例)
-- 注意: 使用 CREATE TABLE IF NOT EXISTS + INSERT IGNORE, 幂等可重复执行
-- ============================================================

-- ============================================================
-- 一、投流广告计价主表（对应前端「销售定价-投流广告」, 一个算法每个业务频道一条配置）
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_traffic (
    id                 BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_no         VARCHAR(64)  NOT NULL                   COMMENT '定价编号(按编号生成规则 config_pricing_traffic 生成, 如 DJTL20260812000)',
    algo_id            BIGINT       NOT NULL                   COMMENT '关联算法ID (biz_ad_algorithm.id, algo_type=15)',
    algo_name          VARCHAR(128)                            COMMENT '算法名称快照',
    brand              VARCHAR(64)                             COMMENT '所属品牌: flashBee / mFood',
    biz_channel        TINYINT      NOT NULL                   COMMENT '业务频道: 1=美食外卖 2=超市百货 3=团购到店',
    custom_min_qty     INT          NOT NULL DEFAULT 100       COMMENT '自定义购买最低起购量(曝光次数)',
    custom_step        INT          NOT NULL DEFAULT 100       COMMENT '自定义购买步长(曝光次数)',
    refund_enabled     TINYINT      NOT NULL DEFAULT 1         COMMENT '退款开关: 1=允许退款 2=不允许',
    refund_fee_percent INT          NOT NULL DEFAULT 0         COMMENT '退款手续费比例(%): 手续费 = 退款金额 × 比例, 0=免费退',
    status             TINYINT      NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用(停用后该频道流量包停止售卖)',
    remark             VARCHAR(500)                            COMMENT '备注',
    updated_by         VARCHAR(64)                             COMMENT '最后更新人',
    deleted            TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_traffic_algo (algo_id),
    KEY idx_ad_pricing_traffic_channel (biz_channel),
    KEY idx_ad_pricing_traffic_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投流广告计价主表(按业务频道)';

-- ============================================================
-- 二、投流广告预设档位明细（流量包套餐: 曝光次数 + 价格, 支持限时折扣）
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_traffic_tier (
    id                   BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_id           BIGINT        NOT NULL                   COMMENT '计价主表ID (biz_ad_pricing_traffic.id)',
    tier_name            VARCHAR(64)   NOT NULL                   COMMENT '档位名称(如 体验包/成长包/爆款包)',
    impressions          INT           NOT NULL                   COMMENT '曝光次数',
    price                DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '套餐价格(MOP)',
    validity_days        INT                                      COMMENT '有效期(天, 已停用: 流量包消耗完毕即退出)',
    on_sale              TINYINT       NOT NULL DEFAULT 1         COMMENT '是否上架: 1=上架 2=下架',
    sort                 INT           NOT NULL DEFAULT 1         COMMENT '排序(从1开始)',
    discount_enabled     TINYINT       NOT NULL DEFAULT 0         COMMENT '折扣开关: 1=开启 0=关闭',
    discount             DECIMAL(3,1)                             COMMENT '折扣(折, 如 8.5 = 85折)',
    discount_time_mode   VARCHAR(16)   DEFAULT 'unlimited'        COMMENT '折扣时间模式: unlimited=不限时间 limited=限定时间',
    discount_start_date  DATE                                     COMMENT '折扣活动开始日期(限定时间模式)',
    discount_end_date    DATE                                     COMMENT '折扣活动结束日期(限定时间模式)',
    deleted              TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at           DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at           DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_traffic_tier_pricing (pricing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投流广告预设档位明细表(流量包套餐)';

-- ============================================================
-- 三、投流广告阶梯单价明细（自定义曝光数量计价: 买越多单价越低）
-- max_qty=0 表示无上限; 区间为 [min_qty, max_qty] 闭区间
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_traffic_ladder (
    id           BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_id   BIGINT        NOT NULL                   COMMENT '计价主表ID (biz_ad_pricing_traffic.id)',
    min_qty      INT           NOT NULL                   COMMENT '区间下限(含, 曝光次数)',
    max_qty      INT           NOT NULL DEFAULT 0         COMMENT '区间上限(含), 0=无上限',
    unit_price   DECIMAL(10,4) NOT NULL DEFAULT 0.0000    COMMENT '单次曝光单价(MOP)',
    sort         INT           NOT NULL DEFAULT 1         COMMENT '排序(从1开始)',
    deleted      TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_traffic_ladder_pricing (pricing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投流广告阶梯单价明细表';

-- ============================================================
-- 四、投流广告订单明细（差异层, 一个订单一条明细 = 一个流量包）
-- mode: tier=预设档位购买 / custom=自定义曝光数量
-- 退款按剩余未消耗曝光折算, consumed_impressions 由 APP 端投放消耗回写
-- delivery_status: 1=投放中 2=已消耗完毕 3=已退款
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_order_item_traffic (
    id                   BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_id             BIGINT        NOT NULL                   COMMENT '订单主表ID (biz_ad_order.id)',
    order_no             VARCHAR(64)   NOT NULL                   COMMENT '订单编号快照',
    mode                 VARCHAR(16)   NOT NULL DEFAULT 'tier'    COMMENT '购买方式: tier=预设档位 custom=自定义数量',
    package_name         VARCHAR(64)                              COMMENT '流量包名称(档位购买=档位名, 自定义=自定义曝光次数)',
    impressions          INT           NOT NULL                   COMMENT '购买曝光次数',
    unit_price           DECIMAL(10,4) NOT NULL DEFAULT 0.0000    COMMENT '实际单价(MOP/次, 实付金额÷购买曝光)',
    delivery_slot        VARCHAR(16)   NOT NULL DEFAULT 'business' COMMENT '投流时段: business=主营时段投流 allday=全天投流',
    original_price       DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '订单原价(档位原价/阶梯计价)',
    sale_price           DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '实付金额(扣除赠送天数抵扣后)',
    refund_price         DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '已退款金额',
    refund_fee_percent   INT           NOT NULL DEFAULT 0         COMMENT '退款手续费比例快照(%)',
    consumed_impressions INT           NOT NULL DEFAULT 0         COMMENT '已消耗曝光次数(APP端回写)',
    delivery_status      TINYINT       NOT NULL DEFAULT 1         COMMENT '投放状态: 1=投放中 2=已消耗完毕 3=已退款',
    deleted              TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at           DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at           DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_item_traffic_order (order_id),
    KEY idx_ad_item_traffic_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投流广告订单明细表(流量包)';

-- ============================================================
-- 五、编号生成规则: 投流广告定价编号
-- 算法编号规则(algo_traffic=SFLL)与订单编号规则(ad_order_traffic=DDLL)
-- 已在 33_biz_seq_rule.sql 预置, 此处仅补录定价编号规则
-- ============================================================
INSERT IGNORE INTO `sys_biz_seq_rule` (`rule_key`, `rule_name`, `biz_menu`, `prefix`, `date_format`, `seq_length`, `seq_start`, `remark`) VALUES
('config_pricing_traffic', '投流廣告定價', '廣告銷售', 'DJTL', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號');

-- ============================================================
-- 六、系统配置: 投流广告赠送天数每日折算价值
-- 赠送天数按曝光计价无天数维度, 按该配置的每日折算金额抵扣订单金额
-- ============================================================
INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('payment_traffic_gift_day_value', '150', '投流广告赠送天数每日折算价值(MOP/天), 用于赠送天数抵扣订单金额');
