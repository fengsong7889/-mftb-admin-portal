# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 328: 时段推荐广告订单明细建表（广告销售 → 外卖到家 → 时段推荐广告下单）
-- ---------------------------------------------------------------------------
-- 背景：时段推荐广告购买流程落单后，一行 = 一个「时段 x 日期」格子，仿金字招牌订单明细。
--       订单主表复用通用 biz_ad_order（algo_type=16，algo_id 存定价配置ID，algo_code 存定价编号）。
--
-- 真值来源：本文件为参考文档；实际幂等建表 + 结构后置校验由 Java 迁移
--       AdPromotionDataInitializer#ensureTimeSlotOrderItemTable（versionKey
--       adpromo:timeslot_order_item_table:v1）负责；订单编号规则 config 由 BizSeqRuleInitializer
--       （seq:init-v24）登记 ad_order_timeslot（前缀 DDSD）。
-- MySQL 8.x 方言：CREATE TABLE IF NOT EXISTS 幂等；金额用 DECIMAL 禁 float。

CREATE TABLE IF NOT EXISTS biz_ad_order_item_timeslot (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_id        BIGINT        NOT NULL                   COMMENT '订单主表ID',
    order_no        VARCHAR(32)   DEFAULT NULL               COMMENT '订单编号快照',
    biz_date        DATE          NOT NULL                   COMMENT '投放日期',
    slot_key        VARCHAR(32)   NOT NULL                   COMMENT '时段标识',
    slot_name       VARCHAR(64)   DEFAULT NULL               COMMENT '时段名称快照',
    original_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '格子原价（时段日单价）',
    sale_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '实付分摊价（折扣后）',
    refund_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '已退款金额',
    delivery_status INT           NOT NULL DEFAULT 1         COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_timeslot_item_order (order_id),
    KEY idx_timeslot_item_date (biz_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='时段推荐订单明细表';
