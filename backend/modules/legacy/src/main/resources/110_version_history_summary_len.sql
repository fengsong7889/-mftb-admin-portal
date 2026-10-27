-- ============================================================
-- MFTB 版本发布历史表 - 扩大 summary 字段长度
-- 同步多条提交时拼接内容可能超过原 VARCHAR(500) 限制
-- ============================================================

ALTER TABLE sys_version_history
    MODIFY COLUMN summary VARCHAR(2000) NOT NULL DEFAULT '' COMMENT '版本概要说明';
