-- ============================================================
-- MFTB 搜广推系统 - 启动初始化迁移版本记录表
-- 记录各初始化器的一次性建表/迁移/种子步骤, 已执行的版本重启时直接跳过,
-- 避免每次启动全量重跑初始化 SQL (启动提速)。
-- 首次启动时 SchemaVersionTracker 会自动完成等效建表, 本脚本供手动执行参考
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_schema_version (
    version_key VARCHAR(128) PRIMARY KEY COMMENT '迁移版本标识',
    applied_at  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '首次执行时间'
) COMMENT='启动初始化迁移版本记录表';

-- 版本键命名约定: {模块}:{步骤}-v{N} 或 {模块}:{脚本名}:v{N}
-- 种子数据/脚本内容变更需要重新执行时, 递增对应版本号即可 (如 v1 -> v2),
-- 无需重跑其他已完成的迁移。
--
-- 常用版本键示例:
--   core:schema-v1              系统表结构迁移 (DataInitializer)
--   core:menu-seed-v1           菜单种子 + 英文菜单名 (菜单改动时递增此版本)
--   biz:tables-v1 / biz:seed-v1 业务建表 / 种子数据
--   adpromo:09_ad_promotion.sql:v1 广告推广初始化脚本
--   organic:seed-23-v1          自然流量评分种子
--
-- 如需强制重跑某个初始化步骤, 删除对应版本记录后重启即可:
-- DELETE FROM sys_schema_version WHERE version_key = 'core:menu-seed-v1';
