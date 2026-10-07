-- ============================================================================
-- 阶段 6 补丁：把 RDM 产出指标类型注册进绩效指标字典
-- 版本：v2.4
-- 背景：RdmConstants.INDICATOR_TYPE_RDM_OUTPUT = 'RDM_OUTPUT' 被推送逻辑当作
--       考核单指标的匹配条件（hr_perf_indicator.indicator_type = 'RDM_OUTPUT'），
--       但字典 PERF_INDICATOR_TYPE 里只有 RESULT/COMPETENCY/ATTITUDE/COMPLIANCE，
--       前端模板下拉也没有这一项 —— HR 在界面上永远建不出 RDM 产出指标，
--       「推送已确认建议」必然报「沒有匹配到 RDM 產出指標」，通道形同虚设。
-- 幂等：uk_hr_dict_type_code(dict_type, code) 存在，用 NOT EXISTS 守卫重复执行。
-- ============================================================================

INSERT INTO sys_hr_dict (dict_type, code, name, name_en, status, sort_order, remark, created_by, updated_by)
SELECT 'PERF_INDICATOR_TYPE', 'RDM_OUTPUT', '產出', 'RDM Output', 1, 5,
       '產研协同（RDM）貢獻分指標：數值由 RDM 績效建議推送寫入 suggested_score，自评/主管评/最终分仍由 HR 校准',
       'SYSTEM', 'SYSTEM'
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM sys_hr_dict WHERE dict_type = 'PERF_INDICATOR_TYPE' AND code = 'RDM_OUTPUT'
);
