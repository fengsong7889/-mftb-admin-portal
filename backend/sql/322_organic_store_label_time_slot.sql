# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 322: 自然流量新增两个内置计分项：店鋪維度 STB_LABEL「門店標籤」+ 商業維度 COM_SLOT「時段推薦」
-- ---------------------------------------------------------------------------
-- 背景：
--   1) STB_LABEL 顶替已下架的 STB_04「店鋪標籤-金牌」（只支持金牌单一身份），改为
--      獨家／品牌／連鎖／金牌四選一的标签分值表；配置方式对齐 COM_10 金字招牌。
--   2) COM_SLOT「時段推薦」是「購買即給固定分」型计分项（同 STB_06 自動接單 / STB_07 出餐時長），
--      一个模块一个配置：命中購買記錄即得固定加分，不區分購買時段數量、不累加。
--   两项此前只存在于前端模板 organicTrafficConfig（读不到时走 loadConfig 保底），库里没有行会让
--   卡片头部的启用/停用开关与「編輯 → 保存」直接报「評分規則不存在」，因此必须落库。
--
-- 结构：新增专用列 store_label_config（沿用 free_shipping_config / member_bonus_config 先例）
--   存「標籤 → 分值」清单 JSON：{ items: [{ labelValue, labelName, score }] }。
--   不复用 condition_items：那是条件计分子项的口径，混用会让消费方把固定加分项误读成条件计分档。
--
-- 执行方式：本文件仅作为 MySQL 参考文档。实际补列由
--          LegacyCoreContracts.organicScoreRuleContract() 的结构契约在每次启动时自愈
--          （先查 INFORMATION_SCHEMA.COLUMNS，缺失才 ADD COLUMN）；补种两行由 Java 迁移
--          organic:add-store-label-time-slot-v1（OrganicScoreDataInitializer Step 21）幂等执行，
--          禁止手动改库。
--
-- 注意：Java 迁移只写建表即有的列，不在首启写 store_label_config —— 契约自愈排在所有
--      CommandLineRunner 之后（SchemaContractValidator @Order 最大值），首启该列还不存在。
--      标签分值清单以 NULL 起步（界面按空清单兜底），运营在界面配好后经 updateRule 落库。
--
-- 回滚：两行按 rule_code 逻辑删除（deleted=1，与 deleteRule 的 @TableLogic 语义一致）；
--       列可保留不删（旧代码不会读取），如需清理请走发布评审，禁止直接 DROP COLUMN。
--       同时需撤掉前端 organicTrafficConfig 的模板行与保底锚点，否则界面仍会展示该项。
-- ---------------------------------------------------------------------------

-- 1. 加列（生产由契约自愈，此处为等价参考；MySQL 不支持 ADD COLUMN IF NOT EXISTS）
ALTER TABLE `biz_organic_score_rule`
    ADD COLUMN `store_label_config` TEXT DEFAULT NULL
    COMMENT '門店標籤計分配置 JSON（[{labelValue,labelName,score}]，僅 STB_LABEL）';

-- 2. 补种店鋪維度 STB_LABEL：顶替已下架 STB_04 的 2 号位（STB_04 已 deleted=1 不占位）。
--    分值清单不预置（NULL = 未配置，界面按空清单引导运营增删），与 Java 迁移口径一致。
INSERT INTO `biz_organic_score_rule`
    (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `status`, `builtin`, `sort_order`, `updated_by`)
SELECT 'STB_LABEL', 2, '門店標籤',
       '門店標籤由門店資料手動指定，獨家／品牌／連鎖／金牌四選一；按當前標籤命中對應分值，命中一檔即停、不累加，未配置該標籤不加分',
       1, 0, 1, 1, 2, 'system'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `biz_organic_score_rule` WHERE `rule_code` = 'STB_LABEL');

-- 3. 补种商業維度 COM_SLOT：接在金字招牌（sort_order 9）之後。
--    编码用语义后缀而非 COM_11/COM_12：后端自动编号只取现有行最大序号 +1，数字编码会与运营自建计分项撞车。
INSERT INTO `biz_organic_score_rule`
    (`rule_code`, `dimension`, `name`, `description`, `mode`, `score`, `prerequisites`, `status`, `builtin`, `sort_order`, `updated_by`)
SELECT 'COM_SLOT', 1, '時段推薦',
       '商家購買時段推薦廣告，投放期內即得固定加分，不區分購買時段數量、不累加；未購買或已過期不加分',
       1, 50, '購買時段推薦', 1, 1, 10, 'system'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `biz_organic_score_rule` WHERE `rule_code` = 'COM_SLOT');

-- 4. 后置校验（Java 迁移以此为准）：两个编码都必须有未删除的内置行，缺行即补种未生效。
SELECT `rule_code`, `dimension`, `name`, `mode`, `score`, `prerequisites`, `sort_order`, `status`, `builtin`
FROM `biz_organic_score_rule`
WHERE `rule_code` IN ('STB_LABEL', 'COM_SLOT') AND `deleted` = 0
ORDER BY `dimension`, `sort_order`;
