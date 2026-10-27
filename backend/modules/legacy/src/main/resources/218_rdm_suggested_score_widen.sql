-- ============================================================================
-- 阶段 6 补丁：考核单建议分列宽窄于来源列，贡献分一大就写不进去
-- 版本：v2.5
-- 背景：RDM 绩效建议推送把 rdm_hr_suggestion.total_score（DECIMAL(12,2)）
--       原值写入 hr_perf_score_item.suggested_score，而后者实查为 DECIMAL(6,2)，
--       上限只有 9999.99。个人周期贡献分一旦超过该值，推送会抛
--       Data truncation: Out of range —— 与 budget_used_ratio（v2.3）完全同一类缺陷：
--       列宽按"分数不会大"的直觉设定，且只在有真实数据时才暴露。
--       生产与开发库实查均为 decimal(6,2)，趁生产尚无积分流水（代价为零）先扩列。
-- 口径：扩到与来源列同精度 DECIMAL(12,2)，让"写不进去"在结构上不可能发生；
--       两列是否仍同精度由 Java 后置校验断言，不再加永远不会命中的截断兜底。
-- 幂等：MODIFY COLUMN 可重复执行。
-- ============================================================================

ALTER TABLE hr_perf_score_item
    MODIFY COLUMN suggested_score DECIMAL(12,2) DEFAULT NULL COMMENT '系統建議分（RDM 貢獻分推送寫入，HR 校準前僅參考）';
