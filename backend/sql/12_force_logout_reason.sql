-- 12_force_logout_reason.sql
-- 新增 force_logout_reason 列: 区分强制下线原因（管理员操作 / 账号被停用）
-- operator = 管理员手动操作下线
-- account_disabled = 账号被停用导致下线

ALTER TABLE sys_user
    ADD COLUMN force_logout_reason VARCHAR(32) DEFAULT NULL COMMENT '强制下线原因: operator=管理员操作, account_disabled=账号被停用'
    AFTER force_logout_emp_id;
