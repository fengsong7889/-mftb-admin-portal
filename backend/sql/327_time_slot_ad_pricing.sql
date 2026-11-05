# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 327: 时段推荐广告销售定价建表（外卖到家新增广告类型 algo_type=16）
-- ---------------------------------------------------------------------------
-- 背景：销售定价 → 外卖到家 新增「时段推荐广告」。与其它广告类型不同，本类型无算法，
--       名称由运营自命名；商家可购范围（全部/指定可购/指定不可购/指定分类可购+分类内排除）、
--       按购买天数折扣、退款配置以 JSON 存于主表；每个售卖时段（早/午/下午茶/晚/宵夜/自定义）
--       的时间段、售价、时段折扣与限时折扣周期存于独立明细表。
--
-- 真值来源：本文件为参考文档；实际幂等建表 + 结构后置校验由 Java 迁移
--       AdPromotionDataInitializer#ensureTimeSlotPricingTables（versionKey
--       adpromo:timeslot_pricing_tables:v1）负责，编号规则由 BizSeqRuleInitializer
--       （seq:init-v23）登记 config_pricing_timeslot（前缀 DJSD）。
-- MySQL 8.x 方言：CREATE TABLE IF NOT EXISTS 幂等；金额/折扣用 DECIMAL 禁 float。

CREATE TABLE IF NOT EXISTS biz_ad_pricing_timeslot (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_no      VARCHAR(32)   NOT NULL                   COMMENT '定价编号（DJSD + YYYYMMDD + 3位）',
    algo_id         BIGINT        DEFAULT NULL               COMMENT '关联算法ID（时段推荐可空）',
    algo_name       VARCHAR(128)  DEFAULT NULL               COMMENT '时段推荐名称',
    brand           VARCHAR(32)   DEFAULT NULL               COMMENT '所属品牌',
    channel         INT           DEFAULT NULL               COMMENT '业务频道',
    presale_days    INT           NOT NULL DEFAULT 7         COMMENT '预售天数',
    merchant_scope  VARCHAR(16)   NOT NULL DEFAULT 'all'     COMMENT '商家可购范围: all/whitelist/blacklist/category',
    allow_categories TEXT         DEFAULT NULL               COMMENT '可购分类编码JSON',
    whitelist_merchants TEXT      DEFAULT NULL               COMMENT '可购商家白名单JSON',
    blacklist_merchants TEXT      DEFAULT NULL               COMMENT '不可购商家黑名单JSON',
    category_exclude_merchants TEXT DEFAULT NULL            COMMENT '分类内排除商家JSON',
    days_discount_enabled TINYINT NOT NULL DEFAULT 0         COMMENT '按天数折扣开关: 1/0',
    days_discount_tiers TEXT      DEFAULT NULL               COMMENT '按天数折扣梯度JSON',
    refund_enabled  INT           NOT NULL DEFAULT 1         COMMENT '退款开关: 1=允许 2=不允许',
    cancel_fee_tiers TEXT         DEFAULT NULL               COMMENT '取消扣费梯度JSON',
    status          INT           NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用',
    remark          VARCHAR(255)  DEFAULT NULL               COMMENT '备注',
    updated_by      VARCHAR(64)   DEFAULT NULL               COMMENT '最后更新人',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_pricing_timeslot_no (pricing_no),
    KEY idx_pricing_timeslot_channel (channel),
    KEY idx_pricing_timeslot_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='时段推荐计价主表';

CREATE TABLE IF NOT EXISTS biz_ad_pricing_timeslot_slot (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_id      BIGINT        NOT NULL                   COMMENT '计价主表ID',
    slot_key        VARCHAR(32)   NOT NULL                   COMMENT '时段标识',
    slot_name       VARCHAR(64)   NOT NULL                   COMMENT '时段名称',
    start_time      VARCHAR(8)    DEFAULT NULL               COMMENT '售卖开始时间 HH:mm',
    end_time        VARCHAR(8)    DEFAULT NULL               COMMENT '售卖结束时间 HH:mm',
    price           DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '售卖价格（MOP）',
    discount_enabled TINYINT      NOT NULL DEFAULT 0         COMMENT '时段折扣开关: 1/0',
    discount        DECIMAL(5,2)  DEFAULT NULL               COMMENT '折扣（折，如 9.5）',
    discount_time_mode VARCHAR(16) NOT NULL DEFAULT 'unlimited' COMMENT '折扣时间模式: limited/unlimited',
    discount_start_date VARCHAR(10) DEFAULT NULL             COMMENT '限时折扣开始日期 YYYY-MM-DD',
    discount_end_date   VARCHAR(10) DEFAULT NULL             COMMENT '限时折扣结束日期 YYYY-MM-DD',
    sort_order      INT           NOT NULL DEFAULT 0         COMMENT '排序',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_timeslot_slot_pricing (pricing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='时段推荐计价时段明细表';
