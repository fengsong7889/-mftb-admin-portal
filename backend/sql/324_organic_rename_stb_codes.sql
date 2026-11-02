# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 324: 自然流量店鋪維度内置计分项编码收编：STB_LABEL → STB_04、STB_ACT → STB_09
-- ---------------------------------------------------------------------------
-- 背景：
--   店鋪維度其余计分项都是 STB_01~STB_08 连续编号，只有「門店標籤」「活動加分」两项建项时用了语义后缀
--   （当时的顾虑是数字序号会与运营自建计分项撞号：后端 generateNextRuleCode 取现有行最大序号 +1）。
--   结果是算法库配置页与门店计分详情都要多记一套编码，界面上一眼看上去像编号错乱。
--   STB_04（店鋪標籤-金牌）与 STB_09（超時接單）都已下架让出号位，且内置行本身是未删除行、
--   会被自动编号计入，因此这两项收编为数字编码不会再撞号。
--
-- 关键约束：biz_organic_score_rule 上有唯一键 uk_rule_code（不含 deleted），
--   而两条下架残留行仍物理占着 STB_04 / STB_09（deleted=1），所以必须先把残留行改挂 *_RETIRED 让位，
--   再把在用行改名。残留行只改编码，内容与 deleted 标记原封不动，历史配置仍可回滚。
--
-- 撞号保护：若目标编码被**未删除**的行占用（运营自建项恰好撞上同一序号），绝不移动运营数据 ——
--   Java 迁移直接抛异常，本步不记版本、下次启动重试，由人工处置占用行后再放行。
--
-- 执行方式：本文件仅作为 MySQL 参考文档。实际执行由 Java 迁移
--   organic:rename-stb-code-numeric-v1（OrganicScoreDataInitializer Step 22）在启动期幂等完成，
--   禁止手动改库。本步必须跑在 Step 21（按 STB_LABEL 补种）之后：Step 21 的版本键在生产已记账，
--   改它的常量不会让存量库生效，收编只能靠独立新键。
--
-- 回滚（仅代码回滚不会撤销已记账迁移，需手工执行；同时必须把前端 organicTrafficConfig 的
--   模板 id、下架清单与面板判定一起改回语义编码，否则界面读不到行）：
--   UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_LABEL', `updated_by` = 'system' WHERE `rule_code` = 'STB_04' AND `name` = '門店標籤';
--   UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_ACT',   `updated_by` = 'system' WHERE `rule_code` = 'STB_09' AND `name` = '活動加分';
--   UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_04', `updated_by` = 'system' WHERE `rule_code` = 'STB_04_RETIRED';
--   UPDATE `biz_organic_score_rule` SET `rule_code` = 'STB_09', `updated_by` = 'system' WHERE `rule_code` = 'STB_09_RETIRED';
--   并删除记账行 sys_schema_version / sys_schema_migration_log 中的 organic:rename-stb-code-numeric-v1
--   （仅限本机开发库；生产禁止删记账行）。
-- ---------------------------------------------------------------------------

-- 1. 让位：已下架残留行改挂 *_RETIRED，只动编码不动内容与启停标记
UPDATE `biz_organic_score_rule`
SET `rule_code` = 'STB_04_RETIRED', `updated_by` = 'system'
WHERE `rule_code` = 'STB_04' AND `deleted` = 1;

UPDATE `biz_organic_score_rule`
SET `rule_code` = 'STB_09_RETIRED', `updated_by` = 'system'
WHERE `rule_code` = 'STB_09' AND `deleted` = 1;

-- 2. 收编：在用行改到目标编码（源编码不存在时命中 0 行，属幂等重跑的正常表现）
UPDATE `biz_organic_score_rule`
SET `rule_code` = 'STB_04', `updated_by` = 'system'
WHERE `rule_code` = 'STB_LABEL';

UPDATE `biz_organic_score_rule`
SET `rule_code` = 'STB_09', `updated_by` = 'system'
WHERE `rule_code` = 'STB_ACT';

-- 3. 后置校验（Java 迁移以此为准）：旧语义编码不得有任何残留行，两个目标编码都必须有行。
SELECT COUNT(*) AS legacy_remains
FROM `biz_organic_score_rule`
WHERE `rule_code` IN ('STB_LABEL', 'STB_ACT');

SELECT `rule_code`, `dimension`, `name`, `mode`, `score`, `sort_order`, `status`, `builtin`, `deleted`
FROM `biz_organic_score_rule`
WHERE `rule_code` IN ('STB_04', 'STB_09', 'STB_04_RETIRED', 'STB_09_RETIRED')
ORDER BY `dimension`, `sort_order`, `rule_code`;
