-- =============================================================
-- 289: AI 使用申請流程編號規則 key 對齊（ai_access → ai_access_request）
--
-- 现象：AI 使用申請點提交直接失敗，後端返回
--       「編號生成規則未配置或已停用: ai_access_request」
--       （BizSeqService.requireRule 查 sys_biz_seq_rule 命中不到該 key）。
--
-- 根因：sys_biz_seq_rule 有兩個唯一鍵 —— uk_seq_rule_key(rule_key) 與
--       uk_seq_rule_prefix(prefix)。AI 前綴早已被早期種子
--       rule_key=ai_access 佔住；後來 seq:init-v6 種子改成按
--       rule_key=ai_access_request 寫入，INSERT IGNORE 撞上 prefix 唯一鍵後
--       靜默丟棄（既不報錯也不插入），於是服務端按規範 key 查規則必然 miss。
--
-- 口徑：只改 rule_key，不碰 prefix / date_format / seq_length / seq_start，
--       也不動 sys_biz_seq 的流水行（流水按 prefix 記帳）。因此已發出的
--       AI 單號保持連續，不會重號，歷史單據無需回填。
--
-- 幂等：本腳本為一次性參考文檔；實際幂等執行由
--       BizSeqRuleInitializer 的 seq:init-v22（applyOnce + 后置校驗）負責。
-- =============================================================

-- 1. 對齊 key（已對齊時更新 0 行；兩行不可能同時存在，prefix 唯一）
UPDATE sys_biz_seq_rule
   SET rule_key = 'ai_access_request'
 WHERE rule_key = 'ai_access'
   AND NOT EXISTS (
       SELECT 1 FROM (SELECT id FROM sys_biz_seq_rule WHERE rule_key = 'ai_access_request') t
   );

-- 2. 校驗：應返回 1 行，prefix=AI、status=1，且序號參數與改名前一致
-- SELECT id, rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status
--   FROM sys_biz_seq_rule WHERE rule_key IN ('ai_access', 'ai_access_request');

-- 3. 提交側自檢：能看到當日流水即可正常發號（需在業務事務內使用，勿單獨執行）
-- SELECT prefix, date_key, current_value FROM sys_biz_seq WHERE prefix = 'AI' ORDER BY date_key DESC LIMIT 3;

-- ── 回滚口徑 ─────────────────────────────────────────────────
-- 本腳本僅 UPDATE rule_key，回滚即反向改名（前提：代碼同步回退到使用舊 key）：
--   UPDATE sys_biz_seq_rule SET rule_key = 'ai_access' WHERE rule_key = 'ai_access_request';
-- 注意：單改數據不改代碼（或反之）會重新回到「編號生成規則未配置」，兩者必須同批。
