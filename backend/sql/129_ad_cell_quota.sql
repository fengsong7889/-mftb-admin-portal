-- ============================================================
-- 129_ad_cell_quota.sql
-- 广告格子占用计数器（防并发超卖）
-- 背景: 「无敌星星(biz_ad_order_item_star)/盘活复苏(biz_ad_order_item_revive)」
--       按 dailySalesLimit 限量售卖, 原库存校验为「读活跃明细聚合→应用层比较」,
--       非原子, 并发下单可超卖; 本表提供下单原子占位(taken+1, 受 taken<limit 约束)。
-- 说明: DataInitializer 启动时也会幂等建表并回填, 本脚本用于手工部署环境;
--       库存展示仍以活跃明细聚合为准, 本表仅保证下单原子性。
-- 注意: 使用 CREATE TABLE IF NOT EXISTS, 幂等可重复执行
-- ============================================================

CREATE TABLE IF NOT EXISTS `biz_ad_cell_quota` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `module`     VARCHAR(20)  NOT NULL COMMENT '广告模块: star(无敌星星)/revive(盘活复苏)',
  `biz_date`   DATE         NOT NULL COMMENT '投放日期',
  `region`     INT          NOT NULL DEFAULT 0 COMMENT '商圈',
  `meal_slot`  VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '餐段时段, 无餐段维度的模块存空串',
  `taken`      INT          NOT NULL DEFAULT 0 COMMENT '已占用个数(活跃明细数)',
  `updated_at` DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_module_cell` (`module`, `biz_date`, `region`, `meal_slot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='广告格子占用计数器(防并发超卖)';

-- 回填由 DataInitializer 启动时执行(按活跃明细聚合自愈式覆盖),
-- 此处不回填, 避免手工部署时与启动回填口径不一致。
