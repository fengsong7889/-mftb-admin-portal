-- 11_session_idle_timeout.sql
-- 空闲超时自动登出功能: sys_user 表新增 last_active_at 字段
-- 用于记录用户最后一次操作时间，后端 JwtAuthenticationFilter 每次请求校验是否超过空闲阈值

-- sys_user 新增最后活跃时间字段
ALTER TABLE sys_user
    ADD COLUMN last_active_at DATETIME DEFAULT NULL COMMENT '最后活跃时间（空闲超时检测用）' AFTER status;

-- 为现有在线用户初始化 last_active_at 为当前时间（避免登录后立即被判定超时）
UPDATE sys_user SET last_active_at = NOW() WHERE deleted = 0 AND status = 1;
