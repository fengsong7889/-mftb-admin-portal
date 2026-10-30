-- 319: 业务 AI 场景开关表（试点：会议 AI 整理纪要）
-- 场景开关从「启动配置」迁为可持久化、可即时启停的治理面；默认关闭，迁移不会自动开放 AI。
-- 系统归属/名称由服务端固定场景注册信息提供，本表只存开关与乐观锁版本，不接受客户端改归属。
CREATE TABLE IF NOT EXISTS ai_scene_config (
    scene_key   VARCHAR(64)  NOT NULL COMMENT '场景标识（服务端固定注册，如 meeting_minutes）',
    enabled     TINYINT      NOT NULL DEFAULT 0 COMMENT '1=启用 0=停用',
    version     BIGINT       NOT NULL DEFAULT 0 COMMENT '乐观锁版本，每次成功保存 +1',
    reason      VARCHAR(255) DEFAULT NULL COMMENT '最近一次变更原因',
    created_by  BIGINT       DEFAULT NULL COMMENT '创建人(sys_user.id)',
    updated_by  BIGINT       DEFAULT NULL COMMENT '最后更新人(sys_user.id)',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (scene_key),
    CONSTRAINT ck_ai_scene_enabled CHECK (enabled IN (0, 1)),
    CONSTRAINT fk_ai_scene_created_by FOREIGN KEY (created_by) REFERENCES sys_user (id),
    CONSTRAINT fk_ai_scene_updated_by FOREIGN KEY (updated_by) REFERENCES sys_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务 AI 场景开关（默认拒绝，缺行/停用一律阻断 AI）';

-- 仅登记试点场景一行，默认关闭；已有配置不覆盖（INSERT IGNORE 幂等）。
INSERT IGNORE INTO ai_scene_config (scene_key, enabled, version, created_by, updated_by)
VALUES ('meeting_minutes', 0, 0, NULL, NULL);
