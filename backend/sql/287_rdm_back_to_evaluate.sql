-- 287: 存量導入需求受控回退（review_passed → evaluating 的 back_to_evaluate 動作）
-- 參考副本（不進鏡像）：權威執行版在 RdmSchemaMigrationInitializer#doBackToEvaluateSeed。
-- 背景：存量導入直接落已准入狀態（如評審通過），缺少「接受需求」的承諾日期與產品任務；
--       批量補錄可補齊歷史事實，但個別需求確需重走受理/PRD 流程時，狀態機沒有回退邊。
-- 口徑：只給 PM（管理員由 canPerform 直通，不寫進 allowed_roles 以免擴權）；
--       必填說明（remark），回退原因必須可追溯。
-- 冪等：INSERT IGNORE + 唯一鍵 (from_status, action_code)，可安全重放；無 DROP / 無刪列。

INSERT IGNORE INTO rdm_transition (
    from_status, to_status, action_code, action_name, allowed_roles, required_fields, sort_order, status
) VALUES (
    'review_passed', 'evaluating', 'back_to_evaluate', '退回評估', 'PM', 'remark', 33, 1
);
