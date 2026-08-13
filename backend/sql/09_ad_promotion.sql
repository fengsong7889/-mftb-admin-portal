-- ============================================================
-- MFTB 搜广推系统 - 推广广告模块（外卖到家）
-- 数据库: MySQL 8.0+
-- 架构: 混合式（共享核心层 + 每算法独立差异层）
--   共享核心层: biz_ad_algorithm(算法登记) / biz_ad_order(订单主表)
--   无敌星星差异层: biz_ad_pricing_star(计价主表) / biz_ad_pricing_star_region(商圈计价明细)
--                   / biz_ad_order_item_star(订单明细, 独家占核心)
-- 售卖单位: 商圈 x 日期 x 5餐段时段(breakfast/lunch/afternoon/dinner/supper)
-- 售罄规则: 独家占, 一个「商圈x日期x餐段」格子只能卖给 1 个商家, 买走即售罄
--           (退款/取消后释放可再售, 独家占在应用层校验, 不加硬唯一约束)
-- 注意: 使用 CREATE TABLE IF NOT EXISTS, 幂等可重复执行
-- ============================================================

-- ============================================================
-- 一、算法登记表（共享核心层, 对应前端「算法库」菜单）
-- algo_type: 1=无敌星星 2=新店广告 3=盘活复苏 4=独家商家 ...
-- 各算法差异化参数存 params(JSON), 无敌星星含: 召回维度/排序阶段/出价模式/时段类型等
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_algorithm (
    id                  BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    algo_code           VARCHAR(32)  NOT NULL                   COMMENT '算法编码(系统生成, 如 WD00001)',
    algo_name           VARCHAR(128) NOT NULL                   COMMENT '算法名称',
    algo_type           TINYINT      NOT NULL                   COMMENT '算法类型: 1=无敌星星 2=新店广告 3=盘活复苏 4=独家商家 ...',
    brand               VARCHAR(64)                             COMMENT '所属品牌: flashBee=闪蜂 / mFood',
    channel             TINYINT                                 COMMENT '业务频道: 1=大首页 2=外卖频道 3=超市百货 4=团购到店',
    placement_interface TINYINT                                 COMMENT '投放界面: 1=大首页-Feed 2=外卖频道-Feed 3=超市频道-Feed 4=团购频道-Feed',
    slot_count          INT                                     COMMENT '坑位数(展示位数量, 不作为售卖维度)',
    params              JSON                                    COMMENT '各算法差异化参数(JSON)',
    status              TINYINT      NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用',
    remark              VARCHAR(500)                            COMMENT '备注',
    updated_by          VARCHAR(64)                             COMMENT '最后更新人',
    deleted             TINYINT      DEFAULT 0                  COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_ad_algorithm_code (algo_code),
    KEY idx_ad_algorithm_type (algo_type),
    KEY idx_ad_algorithm_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广算法登记表';

-- ============================================================
-- 二、广告订单主表（共享核心层, 对应前端「订单列表/详情」, 统一查这张表）
-- status: 1=待推广 2=推广中 3=已推广 4=已退款 5=已取消
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_order (
    id               BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_no         VARCHAR(64)   NOT NULL                   COMMENT '订单编号: GD + 年月日 + 4位自增',
    algo_type        TINYINT       NOT NULL                   COMMENT '算法类型快照',
    algo_id          BIGINT        NOT NULL                   COMMENT '算法ID (关联 biz_ad_algorithm.id)',
    algo_name        VARCHAR(128)                             COMMENT '算法名称快照',
    algo_code        VARCHAR(64)                              COMMENT '算法编码快照',
    brand            VARCHAR(64)                              COMMENT '所属品牌: flashBee / mFood',
    channel          TINYINT                                  COMMENT '业务频道快照',
    group_code       VARCHAR(32)   NOT NULL                   COMMENT '购买集团ID (关联 biz_merchant_group.group_code)',
    group_name       VARCHAR(128)                             COMMENT '集团名称快照',
    store_code       VARCHAR(32)                              COMMENT '购买门店ID',
    store_name       VARCHAR(128)                             COMMENT '门店名称快照',
    bd_emp_id        VARCHAR(64)                              COMMENT '归属BD',
    operator_type    TINYINT                                  COMMENT '下单人类型: 1=商家 2=业务人员',
    operator_id      VARCHAR(64)                              COMMENT '下单人ID (商家=门店ID, 业务人员=工号)',
    operator_name    VARCHAR(64)                              COMMENT '下单人姓名',
    item_count       INT           NOT NULL DEFAULT 0         COMMENT '明细格子数',
    original_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '原价合计',
    discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '折扣优惠金额',
    actual_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '实付金额(推广金扣款)',
    refund_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '已退款金额(按取消扣费梯度)',
    status           TINYINT       NOT NULL DEFAULT 1         COMMENT '订单状态: 1=待推广 2=推广中 3=已推广 4=已退款 5=已取消',
    order_time       DATETIME                                 COMMENT '下单时间',
    pay_time         DATETIME                                 COMMENT '支付时间',
    flow_no          VARCHAR(64)                              COMMENT '关联财务明细编号',
    remark           VARCHAR(500)                             COMMENT '备注',
    updated_by       VARCHAR(64)                              COMMENT '最后更新人',
    deleted          TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at       DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_ad_order_no (order_no),
    KEY idx_ad_order_group (group_code),
    KEY idx_ad_order_store (store_code),
    KEY idx_ad_order_algo (algo_id),
    KEY idx_ad_order_status (status),
    KEY idx_ad_order_time (order_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广广告订单主表';

-- ============================================================
-- 三、无敌星星计价主表（差异层, 对应前端「销售定价」菜单）
-- 一个算法对应一条计价配置
-- discount_tiers: 多时段梯度折扣 JSON, 如 [{"minSlots":3,"discount":95},{"minSlots":5,"discount":90}]
-- cancel_fee_tiers: 取消扣费梯度 JSON(按距投放日剩余天数扣比例),
--   如 [{"minDays":3,"feeRate":0},{"minDays":1,"feeRate":30,"maxDays":2},{"maxDays":0,"feeRate":50}]
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_star (
    id              BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    algo_id         BIGINT       NOT NULL                   COMMENT '关联算法ID (biz_ad_algorithm.id)',
    algo_name       VARCHAR(128)                            COMMENT '算法名称快照',
    brand           VARCHAR(64)                             COMMENT '所属品牌',
    channel         TINYINT                                 COMMENT '业务频道',
    presale_days    INT          NOT NULL DEFAULT 12        COMMENT '预售天数(今天起 N 天可售, 超出为待开售)',
    refund_enabled  TINYINT      NOT NULL DEFAULT 1         COMMENT '退款开关: 1=允许退款 2=不允许',
    discount_tiers  JSON                                    COMMENT '多时段梯度折扣(JSON)',
    cancel_fee_tiers JSON                                   COMMENT '取消扣费梯度(JSON)',
    block_merchant  TINYINT      NOT NULL DEFAULT 2         COMMENT '屏蔽商家开关: 1=启用 2=关闭',
    block_list      JSON                                    COMMENT '屏蔽商家列表(JSON)',
    sell_time_slots JSON                                    COMMENT '可售时段(JSON数组, 如["breakfast","lunch"], 空或含fullDay=全部时段)',
    slot_discounts  JSON                                    COMMENT '时段折扣配置(JSON数组, 分商圈: fullDay/breakfast/lunch/afternoon/dinner/supper, 百分比记法)',
    status          TINYINT      NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用',
    remark          VARCHAR(500)                            COMMENT '备注',
    updated_by      VARCHAR(64)                             COMMENT '最后更新人',
    deleted         TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_star_algo (algo_id),
    KEY idx_ad_pricing_star_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='无敌星星计价主表';

-- ============================================================
-- 四、无敌星星商圈计价明细（差异层, 分商圈定价）
-- 每个商圈一条: 该商圈「日单价」, 格子单价 = 日单价 / 5 餐段
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_pricing_star_region (
    id           BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_id   BIGINT        NOT NULL                   COMMENT '计价主表ID (biz_ad_pricing_star.id)',
    region       TINYINT       NOT NULL                   COMMENT '商圈: 1=黑沙环区 ... 11=黑沙滩区',
    daily_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '该商圈日单价(MOP)',
    deleted      TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_region_pricing (pricing_id),
    KEY idx_ad_pricing_region_region (region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='无敌星星商圈计价明细表';

-- ============================================================
-- 五、无敌星星订单明细（差异层, 独家占核心）
-- 一行 = 一个「商圈 x 日期 x 餐段」格子; 组合商圈下单时拆解为多条单商圈明细
-- delivery_status: 1=待投放 2=已投放 3=已退款
-- 独家占在应用层校验: 仅统计未退款(delivery_status<>3)的活跃明细, 退款后释放
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_order_item_star (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_id        BIGINT        NOT NULL                   COMMENT '订单主表ID (biz_ad_order.id)',
    order_no        VARCHAR(64)   NOT NULL                   COMMENT '订单编号快照',
    biz_date        DATE          NOT NULL                   COMMENT '投放日期',
    region          TINYINT       NOT NULL                   COMMENT '商圈',
    meal_slot       VARCHAR(16)   NOT NULL                   COMMENT '餐段时段: breakfast/lunch/afternoon/dinner/supper',
    original_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '格子原价(商圈日单价/5)',
    sale_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '实付分摊价(折扣后)',
    refund_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '已退款金额(取消扣费梯度)',
    delivery_status TINYINT       NOT NULL DEFAULT 1         COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_item_order (order_id),
    KEY idx_ad_item_cell (biz_date, region, meal_slot),
    KEY idx_ad_item_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='无敌星星订单明细表(独家占)';

-- ============================================================
-- 五点五、格子加购锁表（规则: 商家加购后锁定60秒, 其它商家看到已售罄）
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_ad_cell_lock (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    algo_id         BIGINT        NOT NULL                   COMMENT '关联算法ID (biz_ad_algorithm.id)',
    biz_date        DATE          NOT NULL                   COMMENT '投放日期',
    region          TINYINT       NOT NULL                   COMMENT '商圈',
    meal_slot       VARCHAR(16)   NOT NULL                   COMMENT '餐段时段: breakfast/lunch/afternoon/dinner/supper',
    group_code      VARCHAR(64)   NOT NULL                   COMMENT '锁定商家集团编码',
    store_code      VARCHAR(64)                              COMMENT '锁定门店编码',
    expire_at       DATETIME      NOT NULL                   COMMENT '锁释放时间(加购时间+60秒)',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    UNIQUE KEY uk_ad_cell_lock (algo_id, biz_date, region, meal_slot),
    KEY idx_ad_cell_lock_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='无敌星星格子加购锁(60秒)';

-- ============================================================
-- 七、盘活复苏差异层（售卖单位: 商圈 x 日期, 无餐段维度）
-- 库存规则: 商圈每日销售个数(daily_sales_limit)即库存, 售罄后可再售(退款释放)
-- ============================================================

-- 7.1 盘活复苏计价主表（对应前端「销售定价」菜单, 一个算法一条配置）
-- discount_tiers: 多天梯度折扣 JSON, 如 [{"minDays":3,"discount":95},{"minDays":7,"discount":90}]
CREATE TABLE IF NOT EXISTS biz_ad_pricing_revive (
    id              BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    algo_id         BIGINT       NOT NULL                   COMMENT '关联算法ID (biz_ad_algorithm.id)',
    algo_name       VARCHAR(128)                            COMMENT '算法名称快照',
    brand           VARCHAR(64)                             COMMENT '所属品牌',
    channel         TINYINT                                 COMMENT '业务频道',
    presale_days    INT          NOT NULL DEFAULT 180       COMMENT '预售天数(今天起 N 天可售, 超出为待开售)',
    refund_enabled  TINYINT      NOT NULL DEFAULT 1         COMMENT '退款开关: 1=允许退款 2=不允许',
    discount_tiers  JSON                                    COMMENT '多天梯度折扣(JSON)',
    cancel_fee_tiers JSON                                   COMMENT '取消扣费梯度(JSON)',
    block_merchant  TINYINT      NOT NULL DEFAULT 2         COMMENT '屏蔽商家开关: 1=启用 2=关闭',
    block_list      JSON                                    COMMENT '屏蔽商家列表(JSON)',
    status          TINYINT      NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用',
    remark          VARCHAR(500)                            COMMENT '备注',
    updated_by      VARCHAR(64)                             COMMENT '最后更新人',
    deleted         TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_revive_algo (algo_id),
    KEY idx_ad_pricing_revive_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘活复苏计价主表';

-- 7.2 盘活复苏商圈计价明细（每个商圈一条: 日单价 + 每天销售个数=库存）
CREATE TABLE IF NOT EXISTS biz_ad_pricing_revive_region (
    id                BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    pricing_id        BIGINT        NOT NULL                   COMMENT '计价主表ID (biz_ad_pricing_revive.id)',
    region            TINYINT       NOT NULL                   COMMENT '商圈: 1=黑沙环区 ... 11=黑沙滩区',
    daily_price       DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '该商圈日单价(MOP)',
    daily_sales_limit INT           NOT NULL DEFAULT 1         COMMENT '每天销售个数(库存)',
    deleted           TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at        DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at        DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_pricing_revive_region_pricing (pricing_id),
    KEY idx_ad_pricing_revive_region_region (region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘活复苏商圈计价明细表';

-- 7.3 盘活复苏订单明细（一行 = 一个「商圈 x 日期」格子, 无餐段）
CREATE TABLE IF NOT EXISTS biz_ad_order_item_revive (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_id        BIGINT        NOT NULL                   COMMENT '订单主表ID (biz_ad_order.id)',
    order_no        VARCHAR(64)   NOT NULL                   COMMENT '订单编号快照',
    biz_date        DATE          NOT NULL                   COMMENT '投放日期',
    region          TINYINT       NOT NULL                   COMMENT '商圈',
    original_price  DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '格子原价(商圈日单价)',
    sale_price      DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '实付分摊价(折扣后)',
    refund_price    DECIMAL(12,2) NOT NULL DEFAULT 0.00      COMMENT '已退款金额(取消扣费梯度)',
    delivery_status TINYINT       NOT NULL DEFAULT 1         COMMENT '投放状态: 1=待投放 2=已投放 3=已退款',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_ad_item_revive_order (order_id),
    KEY idx_ad_item_revive_cell (biz_date, region),
    KEY idx_ad_item_revive_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘活复苏订单明细表(按天库存)';

-- 7.4 盘活复苏加购锁（规则: 商家加购后锁定60秒, 库存>1时多商家可分别锁同一格子）
CREATE TABLE IF NOT EXISTS biz_ad_day_lock_revive (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    algo_id         BIGINT        NOT NULL                   COMMENT '关联算法ID (biz_ad_algorithm.id)',
    biz_date        DATE          NOT NULL                   COMMENT '投放日期',
    region          TINYINT       NOT NULL                   COMMENT '商圈',
    group_code      VARCHAR(64)   NOT NULL                   COMMENT '锁定商家集团编码',
    store_code      VARCHAR(64)                              COMMENT '锁定门店编码',
    expire_at       DATETIME      NOT NULL                   COMMENT '锁释放时间(加购时间+60秒)',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    UNIQUE KEY uk_ad_day_lock_revive (algo_id, biz_date, region, group_code),
    KEY idx_ad_day_lock_revive_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘活复苏加购锁(60秒)';

-- ============================================================
-- 八、盘活复苏初始数据（幂等: 仅当不存在时插入）
-- ============================================================
INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, slot_count, params, status, remark, updated_by)
SELECT 'PH00001', '盤活復蘇-團購版', 3, 'flashBee', 4, 4, 10,
       JSON_OBJECT(
           'recallDimension', 1,
           'rankingStage', 2,
           'bidMode', 2,
           'continuousPurchase', true,
           'purchaseLimitDays', 180
       ),
       1, '系統預置示例算法', '系統'
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM biz_ad_algorithm WHERE algo_code = 'PH00001' AND deleted = 0) t);

-- ============================================================
-- 六、初始数据（已废弃，示例数据已迁移至 35_delete_wd00001_algo.sql 清理）
-- ============================================================
-- [DELETED] 原無敵星星-首頁黃金展位示例数据已于 2026-08-13 删除
-- INSERT INTO biz_ad_algorithm (algo_code, algo_name, algo_type, brand, channel, placement_interface, slot_count, params, status, remark, updated_by)
-- SELECT 'WD00001', '無敵星星-首頁黃金展位', 1, 'flashBee', 1, 1, 5,
--        JSON_OBJECT(
--            'recallDimension', 1,
--            'rankingStage', 2,
--            'bidMode', 2,
--            'timeSlot', 1,
--            'continuousPurchase', true,
--            'purchaseLimitDays', 12
--        ),
--        1, '系統預置示例算法', '系統'
-- WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM biz_ad_algorithm WHERE algo_code = 'WD00001' AND deleted = 0) t);

