-- ============================================================
-- 278_ai_scope.sql
-- AI 配置多系统作用域：护栏与推送模板增加 system_code；
-- 既有数据默认归 'common'，RDM 推送模板回填为 'rdm'。
-- 说明：能力/骨架/术语复用既有 domain 列，不新增字段。
-- ============================================================

ALTER TABLE ai_guard_rule ADD COLUMN system_code VARCHAR(32) NOT NULL DEFAULT 'common'
  COMMENT '作用域：common=共用，其余为业务系统编码';

ALTER TABLE ai_push_template ADD COLUMN system_code VARCHAR(32) NOT NULL DEFAULT 'common'
  COMMENT '作用域：common=共用，其余为业务系统编码';

UPDATE ai_push_template SET system_code = 'rdm' WHERE template_key LIKE 'rdm\_%' AND system_code = 'common';
