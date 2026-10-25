-- 296_hcm_pii_access_log.sql
-- C5：敏感字段明文查看留痕
--
-- 仅作参照文档：真正执行的是启动期 HcmPiiAccessLogSchemaInitializer
-- （版本键 hcm:pii-access-log:v1.0，已登记 catalog.json）。
-- 只记「谁看了谁的哪些字段组」，不记字段值。

CREATE TABLE IF NOT EXISTS hcm_pii_access_log (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    actor      VARCHAR(64)  NOT NULL COMMENT '查看人账号（工号口径）',
    person_id  BIGINT       NOT NULL COMMENT '被查看的人员ID',
    fields     VARCHAR(128) NOT NULL COMMENT '字段组 mobile,email,birthDate',
    scene      VARCHAR(32)  NOT NULL DEFAULT 'detail' COMMENT 'detail/list/export',
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '查看时间',
    KEY idx_pii_person_time (person_id, created_at),
    KEY idx_pii_actor_time (actor, created_at)
) COMMENT='敏感字段明文查看留痕';
