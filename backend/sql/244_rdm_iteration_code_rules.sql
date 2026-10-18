-- =============================================================
-- 244_rdm_iteration_code_rules.sql
-- 迭代編碼系統發號：登記三條編號規則（常規/版本專項/緊急修復）
-- 參考文檔：實際執行與冪等由 RdmSchemaMigrationInitializer rdm:schema:v3.6 負責，
--           不進鏡像、不可整腳本重放。
-- 與代碼側 BizSeqService.ruleKeyForIterationType 同批原子交付：
--   缺行時 requireRule fail-closed，新建迭代直接報「編號生成規則未配置」。
-- =============================================================

INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) VALUES
  ('rdm_iteration_sprint',  '迭代編碼－常規迭代', '產研交付', 'SP',  'YYYYMM',   3, 1, 1,
   '{prefix} + YYYYMM + {n}位自增序號：新建迭代時系統統一發號（如 SP202610001），前端不收手工輸入；按月重置流水'),
  ('rdm_iteration_version', '迭代編碼－版本專項', '產研交付', 'VER', 'YYYYMM',   3, 1, 1,
   '{prefix} + YYYYMM + {n}位自增序號：新建迭代時系統統一發號（如 VER202610001），前端不收手工輸入；按月重置流水'),
  ('rdm_iteration_hotfix',  '迭代編碼－緊急修復', '產研交付', 'HF',  'YYYYMMDD', 2, 1, 1,
   '{prefix} + YYYYMMDD + {n}位自增序號：hotfix 講時效按日出號（如 HF2026101801），前端不收手工輸入');
