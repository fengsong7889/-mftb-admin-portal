-- ============================================================
-- 278_ai_scope.sql（参考文档，实际执行体为 classpath 同名脚本）
-- AI 配置多系统作用域：护栏/推送模板增加 system_code，RDM 模板回填 rdm
-- ADD COLUMN 由 Java 逐列探测执行，脚本仅供人工执行时参考
-- ============================================================

-- ALTER TABLE ai_guard_rule ADD COLUMN system_code VARCHAR(32) NOT NULL DEFAULT 'common';
-- ALTER TABLE ai_push_template ADD COLUMN system_code VARCHAR(32) NOT NULL DEFAULT 'common';
-- UPDATE ai_push_template SET system_code = 'rdm' WHERE template_key LIKE 'rdm\_%' AND system_code = 'common';
