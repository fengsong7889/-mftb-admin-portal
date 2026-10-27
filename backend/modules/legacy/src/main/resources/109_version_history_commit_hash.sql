-- ============================================================
-- MFTB 版本发布历史表 - 新增 commit_hash 字段
-- 记录每次同步覆盖到的最新 Git commit hash，用于增量同步
-- ============================================================

ALTER TABLE sys_version_history
    ADD COLUMN commit_hash VARCHAR(40) NULL COMMENT '同步覆盖的最新 Git commit SHA' AFTER database_changes;
