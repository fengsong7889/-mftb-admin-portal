-- 317: 平台维度 PLT_03 商家扶持 + PLT_04 订单过热调控 合并为「流量均衡」
-- ---------------------------------------------------------------------------
-- 背景：ES 底座难以实现减分项。把原「订单过热高单量扣分」翻转为「低单量多加分、高单量少加分」
-- 的非负梯度，与「商家扶持」统一为一个规则「流量均衡」（沿用编码 PLT_03）。
-- 新增专用列 traffic_balance_config（沿用 free_shipping_config / member_bonus_config 先例）存合并配置：
--   统计口径（statDays / refreshMinutes / orderTypes / includeRefunded）
--   + 排除商家 excludedStoreCodes
--   + 区域梯度 regions{MACAU,TAIPA:[{maxOrders,score}]}（订单量门槛留空由运营按新口径校准）。
-- 幂等性与后置校验由 Java 迁移（organic:traffic-balance-v1）保证，本文件仅作参考文档。
-- 注意：本迁移只落配置存储侧；按 traffic_balance_config 真实算分/排名由外部业务系统消费，不在本仓库。
-- ---------------------------------------------------------------------------

-- 1. 加列（生产由 LegacyCoreContracts 契约每次启动自愈，此处为等价参考；MySQL 不支持 ADD COLUMN IF NOT EXISTS）
ALTER TABLE `biz_organic_score_rule`
    ADD COLUMN `traffic_balance_config` TEXT DEFAULT NULL COMMENT '流量均衡合併配置 JSON（統計口徑 + 區域梯度，僅 PLT_03）';

-- 2. PLT_03 收敛为「流量均衡」：仅在尚未合并（traffic_balance_config IS NULL）时整行覆写，
--    避免重放覆盖运营已配好的值；region_configs / blocked_merchants 置 NULL（旧格式与旧屏蔽名单不自动沿用）。
UPDATE `biz_organic_score_rule`
SET `name` = '流量均衡',
    `description` = '統一商家扶持與訂單過熱調控：按滾動過去 N 天的外賣/自取訂單量梯度非負加分，訂單量越高加分越少；已取消訂單不納入，退款是否計入可配。本頁僅配檔位，算分由業務系統消費 traffic_balance_config',
    `mode` = 5,
    `stat_days` = 7,
    `calc_cycle` = 'SCHEDULED',
    `calc_interval_hours` = 1,
    `region_configs` = NULL,
    `blocked_merchants` = NULL,
    `traffic_balance_config` = '{"statDays":7,"refreshMinutes":60,"orderTypes":["DELIVERY","PICKUP"],"includeRefunded":false,"excludedStoreCodes":[],"regions":{"MACAU":[{"maxOrders":null,"score":80},{"maxOrders":null,"score":60},{"maxOrders":null,"score":50},{"maxOrders":null,"score":30}],"TAIPA":[{"maxOrders":null,"score":80},{"maxOrders":null,"score":60},{"maxOrders":null,"score":50},{"maxOrders":null,"score":30}]}}',
    `updated_by` = 'system'
WHERE `rule_code` = 'PLT_03' AND `deleted` = 0 AND `traffic_balance_config` IS NULL;

-- 3. PLT_04 逻辑删除下架（同 COM_09/STB_04），保留历史可回滚
UPDATE `biz_organic_score_rule`
SET `deleted` = 1, `updated_by` = 'system'
WHERE `deleted` = 0 AND `rule_code` = 'PLT_04';

-- 回滚（仅在需要恢复旧两项时手工执行）：
--   1) 恢复 PLT_04：UPDATE `biz_organic_score_rule` SET `deleted` = 0, `updated_by` = 'system'
--        WHERE `rule_code` = 'PLT_04' AND `deleted` = 1;
--   2) PLT_03 需还原为商家扶持旧口径（region_configs / blocked_merchants 由运营重配），
--      并清空 traffic_balance_config；同时撤前端 organicTrafficConfig 的 RETIRED 'PLT_04' 与读写真实 PLT_03 的接线。
--   3) 若要下次启动重放本迁移，删除 sys_schema_migration_log 里的 organic:traffic-balance-v1 版本行。
