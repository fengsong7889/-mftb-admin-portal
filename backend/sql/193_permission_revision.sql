-- 193: 权限版本号（跨实例即时失效）
-- 参考文档：docs/system-portal/inventory.md
-- 关联方案：统一门户_分系统_权限改造_bcdcf6bc.md（Round 3）
--
-- 生产实际执行由 com.mftb.admin.config.PermissionRevisionInitializer 通过
-- SchemaVersionTracker.applyOnce('core:permission-revision:v1.0', doMigrate, verify) 完成，
-- 本文件仅作为一次性参考文档，不参与自动执行。

CREATE TABLE IF NOT EXISTS sys_permission_revision (
  id BIGINT PRIMARY KEY COMMENT '固定单行：id=1',
  revision BIGINT NOT NULL DEFAULT 0 COMMENT '全局权限版本号；授权 / 角色 / 部门 / 员工 / 菜单结构变更时递增',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_permission_revision_singleton CHECK (id = 1)
) COMMENT='权限版本号（跨实例即时失效）：每次授权写入递增，读侧比对本地缓存 revision 与库内一致';

INSERT IGNORE INTO sys_permission_revision (id, revision) VALUES (1, 0);
