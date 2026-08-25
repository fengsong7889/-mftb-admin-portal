-- 54. 金字招牌计价表（主表 + 标签计价明细）
-- 背景：金字招牌按标签类型分别定价，每个标签可独立配置售价和梯度折扣。
-- 执行时间：2026-08-24

-- ============================================================
-- 一、金字招牌计价主表
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_signboard (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_no      VARCHAR(32)   NOT NULL                   COMMENT '定价编号（DJZP + YYYYMMDD + 3位）',
    algo_id         BIGINT        NOT NULL                   COMMENT '关联算法ID（biz_ad_algorithm.id）',
    algo_name       VARCHAR(128)  DEFAULT NULL               COMMENT '算法名称快照',
    brand           VARCHAR(32)   DEFAULT NULL               COMMENT '所属品牌',
    channel         INT           DEFAULT NULL               COMMENT '业务频道',
    presale_days    INT           NOT NULL DEFAULT 7         COMMENT '预售天数（默认7天）',
    refund_enabled  INT           NOT NULL DEFAULT 1         COMMENT '退款开关: 1=允许退款 2=不允许',
    cancel_fee_tiers TEXT         DEFAULT NULL               COMMENT '取消扣费梯度JSON',
    status          INT           NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用',
    remark          VARCHAR(255)  DEFAULT NULL               COMMENT '备注',
    updated_by      VARCHAR(64)   DEFAULT NULL               COMMENT '最后更新人',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_pricing_signboard_no (pricing_no),
    KEY idx_pricing_signboard_algo (algo_id),
    KEY idx_pricing_signboard_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌计价主表';

-- ============================================================
-- 二、金字招牌标签计价明细（每个标签一条：标签类型+售价+梯度折扣）
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_signboard_label (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_id      BIGINT        NOT NULL                   COMMENT '计价主表ID（biz_ad_pricing_signboard.id）',
    label_type      VARCHAR(32)   NOT NULL                   COMMENT '标签类型（hot/popular/sales/rating/repurchase/favorites/customers）',
    enabled         TINYINT       NOT NULL DEFAULT 1         COMMENT '是否启用: 1=启用 0=禁用',
    price           DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '标签日单价（MOP/天）',
    discount_tiers  TEXT          DEFAULT NULL               COMMENT '梯度折扣JSON [{"minDays":3,"discount":95}]',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_signboard_label_pricing (pricing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌标签计价明细表';

-- ============================================================
-- 三、编号生成规则种子数据
-- ============================================================
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark)
VALUES ('config_pricing_signboard', '金字招牌定價', '廣告銷售', 'DJZP', 'YYYYMMDD', 3, 0, '{prefix} + YYYYMMDD + {n}位自增序號');
