-- 用户快捷入口收藏（JSON 数组，存储菜单 menuKey 列表）
ALTER TABLE sys_user
    ADD COLUMN quick_favorites VARCHAR(1024) DEFAULT NULL COMMENT '快捷入口菜单key列表，JSON数组格式如 ["account-balance","batch-query"]'
    AFTER force_logout_reason;
