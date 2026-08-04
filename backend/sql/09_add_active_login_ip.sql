-- 新增 active_login_ip 字段: 记录当前活跃设备的登录 IP，用于被顶下线时展示给旧设备
ALTER TABLE sys_user
    ADD COLUMN active_login_ip VARCHAR(45) DEFAULT NULL COMMENT '当前活跃设备登录IP（单设备登录校验时返回给旧设备）'
    AFTER active_token;
