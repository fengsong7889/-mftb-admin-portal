-- ============================================================
-- MFTB 搜广推系统 - 人气商家差异层
-- 架构: 共享核心层(biz_ad_algorithm / biz_ad_order) + 人气商家差异层(本文件)
-- 售卖单位: 皮肤 x 日期（无商圈/餐段维度）
-- 库存规则: 不限库存, 多商家可同时购买同一「皮肤x日期」格子,
--           但同一商家(集团)已购买的「皮肤x日期」不能重复购买(退款释放后可再购)
-- 皮肤定义: 皮肤种类在「销售定价」配置里自定义(biz_ad_pricing_hot_skin),
--           每个皮肤一条: 皮肤名称 + 单价
-- 注意: 使用 CREATE TABLE IF NOT EXISTS, 幂等可重复执行
-- ============================================================

-- ============================================================
-- 一、人气商家计价主表（对应前端「销售定价」菜单, 一个算法一条配置）
-- discount_tiers: 多格梯度折扣 JSON, 如 [{"minDays":3,"discount":95},{"minDays":7,"discount":90}]
-- cancel_fee_tiers: 取消扣费梯度 JSON(按距投放日剩余天数扣比例),
--   如 [{"remainDays":0,"ratio":100},{"remainDays":3,"ratio":80}]
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_hot (
    id              BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    algo_id         BIGINT       NOT NULL                   COMMENT '关联算法ID (biz_ad_algorithm.id)',
    algo_name       VARCHAR(128)                            COMMENT '算法名称快照',
    brand           VARCHAR(64)                             COMMENT '所属品牌',
    channel         TINYINT                                 COMMENT '业务频道',
    presale_days    INT          NOT NULL DEFAULT 30        COMMENT '预售天数(今天起 N 天可售, 超出为待开售)',
    refund_enabled  TINYINT      NOT NULL DEFAULT 1         COMMENT '退款开关: 1=允许退款 2=不允许',
    discount_tiers  JSON                                    COMMENT '多格梯度折扣(JSON, 按购买格子数匹配)',
    cancel_fee_tiers JSON                                   COMMENT '取消扣费梯度(JSON)',
    block_merchant  TINYINT      NOT NULL DEFAULT 2         COMMENT '屏蔽商家开关: 1=启用 2=关闭',
    block_list      JSON                                    COMMENT '屏蔽商家列表(JSON)',
    status          TINYINT      NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用',
    remark          VARCHAR(500)                            COMMENT '备注',
    updated_by      VARCHAR(64)                             COMMENT '最后更新人',
    deleted         TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_hot_algo (algo_id),
    KEY idx_ad_pricing_hot_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人气商家计价主表';

-- ============================================================
-- 二、人气商家皮肤计价明细（定价配置里自定义皮肤, 每个皮肤一条: 名称+单价）
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_hot_skin (
    id           BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_id   BIGINT        NOT NULL                   COMMENT '计价主表ID (biz_ad_pricing_hot.id)',
    skin_name    VARCHAR(64)   NOT NULL                   COMMENT '皮肤名称',
    price        DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '皮肤日单价(MOP)',
    deleted      TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_hot_skin_pricing (pricing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人气商家皮肤计价明细表';

-- ============================================================
-- 三、人气商家订单明细（差异层）
-- 一行 = 一个「皮肤 x 日期」格子
-- delivery_status: 1=待投放 2=已投放 3=已退款
-- 重复购买校验在应用层: 仅统计活跃明细(delivery_status<>3), 退款释放后可再购
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_order_item_hot (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_id        BIGINT        NOT NULL                   COMMENT '订单主表ID (biz_ad_order.id)',
    order_no        VARCHAR(64)   NOT NULL                   COMMENT '订单编号快照',
    biz_date        DATE          NOT NULL                   COMMENT '投放日期',
    skin_name       VARCHAR(64)   NOT NULL                   COMMENT '皮肤名称快照',
    original_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '格子原价(皮肤日单价)',
    sale_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '实付分摊价(折扣后)',
    refund_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '已退款金额(取消扣费梯度)',
    delivery_status TINYINT       NOT NULL DEFAULT 1         COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_item_hot_order (order_id),
    KEY idx_ad_item_hot_cell (biz_date, skin_name),
    KEY idx_ad_item_hot_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人气商家订单明细表(皮肤x日期)';

-- ============================================================
-- 四、预置人气商家算法数据（幂等: NOT EXISTS 保护）
-- ============================================================
INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, slot_count, params, status, remark, updated_by)
SELECT 'RQ00001', '人氣商家-外賣版', 5, 'flashBee', 2, 2, 10,
       JSON_OBJECT(
           'recallDimension', 1,
           'rankingStage', 2,
           'bidMode', 2,
           'continuousPurchase', true,
           'purchaseLimitDays', 30
       ),
       1, '系統預置示例算法', '系統'
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM biz_ad_algorithm WHERE algo_code = 'RQ00001' AND deleted = 0) t);
