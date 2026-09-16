-- =====================================================================
-- 152: 添加借用和赔付编号生成规则
-- =====================================================================

-- 借用编号规则：JY + YYYYMMDD + 4位自增
INSERT INTO sys_biz_seq_rule (rule_key, rule_name, prefix, date_format, seq_length, seq_start, status)
VALUES ('eam_borrow', 'EAM 借用编号', 'JY', 'YYYYMMDD', 4, 0, 1)
ON DUPLICATE KEY UPDATE rule_name = VALUES(rule_name);

-- 赔付编号规则：PF + YYYYMMDD + 4位自增
INSERT INTO sys_biz_seq_rule (rule_key, rule_name, prefix, date_format, seq_length, seq_start, status)
VALUES ('eam_compensation', 'EAM 赔付编号', 'PF', 'YYYYMMDD', 4, 0, 1)
ON DUPLICATE KEY UPDATE rule_name = VALUES(rule_name);
