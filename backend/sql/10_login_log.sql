-- ============================================================
-- MFTB 搜广推系统 - 员工登录日志表
-- 数据库: MySQL 8.0+
-- 覆盖模块: 员工动态（登录/登出/在线时长/退出原因）
-- 注意: 幂等可重复执行
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_login_log (
    id              BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id         BIGINT       NOT NULL                   COMMENT '用户ID (关联 sys_user.id)',
    username        VARCHAR(64)  NOT NULL                   COMMENT '登录账号',
    emp_id          VARCHAR(32)  NULL                       COMMENT '员工工号',
    employee_name   VARCHAR(64)  NULL                       COMMENT '员工姓名',
    department_id   BIGINT       NULL                       COMMENT '部门ID',
    department_name VARCHAR(256) NULL                       COMMENT '部门全路径快照',
    login_time      DATETIME     NOT NULL                   COMMENT '登录时间',
    logout_time     DATETIME     NULL                       COMMENT '退出时间 (NULL=在线中)',
    logout_reason   VARCHAR(32)  NULL                       COMMENT '退出原因: manual=主动退出, timeout=系统超时退出',
    ip_address      VARCHAR(64)  NULL                       COMMENT '登录IP地址',
    user_agent      VARCHAR(512) NULL                       COMMENT '浏览器 User-Agent',
    created_at      DATETIME     NULL                       COMMENT '记录创建时间',
    INDEX idx_user_id (user_id),
    INDEX idx_login_time (login_time),
    INDEX idx_logout_time (logout_time),
    INDEX idx_department_id (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工登录日志表';
