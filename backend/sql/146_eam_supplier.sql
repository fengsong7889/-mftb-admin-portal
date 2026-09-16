-- 供应商管理：建表 + 编码生成规则 + 菜单排序互换
-- 供应商编码由系统自动生成（CGSJ + 6位全局自增，如 CGSJ000001），
-- 后端 BizSeqService 按 sys_biz_seq_rule.eam_supplier_code 规则统一生成，前端禁止传码。
-- DataInitializer / BizSeqRuleInitializer 已同步实现（幂等），本脚本可手动执行用于即时生效。

-- 1. 供应商表（幂等）
CREATE TABLE IF NOT EXISTS biz_eam_supplier (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL COMMENT '供应商编码（系统自动生成，格式 CGSJ + 6位自增数字，如 CGSJ000001）',
  name VARCHAR(200) NOT NULL COMMENT '供应商名称',
  contact_person VARCHAR(100) DEFAULT '' COMMENT '联系人',
  contact_phone VARCHAR(64) DEFAULT '' COMMENT '联系电话',
  bank_name VARCHAR(200) DEFAULT '' COMMENT '开户银行',
  bank_account VARCHAR(64) DEFAULT '' COMMENT '银行账号',
  remark VARCHAR(500) DEFAULT '' COMMENT '备注',
  status VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  updated_by VARCHAR(64) DEFAULT '' COMMENT '最后更新人',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_supplier_code (code),
  KEY idx_supplier_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商管理';

-- 2. 供应商编码生成规则（CGSJ + 6位全局自增，无日期维度；seq_start=1 即首条为 CGSJ000001）
INSERT INTO sys_biz_seq_rule
  (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES
  ('eam_supplier_code', '供應商編碼', '物資管理(EAM)-供應商管理', 'CGSJ', '', 6, 1, 1,
   '{prefix} + {n}位數字自增（全局自增，如 CGSJ000001、CGSJ000002）')
ON DUPLICATE KEY UPDATE
  rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu),
  prefix = VALUES(prefix), date_format = VALUES(date_format),
  seq_length = VALUES(seq_length), seq_start = VALUES(seq_start),
  remark = VALUES(remark), status = VALUES(status);

-- 3. 菜单排序互换：供應商管理=5（基礎配置分组之前），基礎配置=6
UPDATE sys_menu SET sort_order = 5 WHERE menu_key = 'asset-supplier' AND deleted = 0;
UPDATE sys_menu SET sort_order = 6 WHERE menu_key = 'asset-basic'   AND deleted = 0;
