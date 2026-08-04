-- ============================================================
-- MFTB 搜广推系统 - 单设备登录 & 强制下线支持
-- 在 sys_user 表新增字段:
--   active_token: 当前活跃 Token (用于单设备登录校验)
--   force_logout_operator: 强制下线操作人姓名
--   force_logout_emp_id: 强制下线操作人工号
-- ============================================================

-- 当前活跃 Token（用于单设备登录校验）
ALTER TABLE sys_user ADD COLUMN active_token VARCHAR(512) NULL COMMENT '当前活跃JWT Token（单设备登录校验）';

-- 强制下线操作人信息（被下线用户下次请求时读取并弹窗）
ALTER TABLE sys_user ADD COLUMN force_logout_operator VARCHAR(64) NULL COMMENT '强制下线操作人姓名';
ALTER TABLE sys_user ADD COLUMN force_logout_emp_id VARCHAR(32) NULL COMMENT '强制下线操作人工号';
