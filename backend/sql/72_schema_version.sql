-- ============================================================
-- MFTB 搜广推系统 - 启动初始化迁移版本记录表
-- 记录各初始化器的一次性建表/迁移/种子步骤, 已执行的版本重启时直接跳过,
-- 避免每次启动全量重跑初始化 SQL (启动提速)。
-- 首次启动时 SchemaVersionTracker 会自动完成等效建表, 本脚本供手动执行参考
--
-- ★ 产品版本号 (Semantic Versioning: major.minor.patch)
--   存储在 sys_config 表 (key=product_version), 与 pom.xml / package.json 同步
--   major — 不兼容的重大变更    minor — 向下兼容的功能新增    patch — 向下兼容的问题修复
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_schema_version (
    version_key VARCHAR(128) PRIMARY KEY COMMENT '迁移版本标识',
    applied_at  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '首次执行时间'
) COMMENT='启动初始化迁移版本记录表';

-- 版本键命名约定 (Semantic Versioning 风格):
--   格式: {模块}:{步骤}-v{major}.{minor}  或  {模块}:{脚本名}:v{major}.{minor}
--   major — 结构性变更 (表结构重构 / 数据模型颠覆)
--   minor — 增量变更 (补列 / 新增种子数据 / 修复脚本), 每次变更递增
--   历史遗留键仍使用 v{N} 格式 (如 v1), 新键应使用点分格式
--
-- 常用版本键示例:
--   core:schema-v5              系统表结构迁移 (DataInitializer)
--   core:menu-seed-v9           菜单种子 + 英文菜单名 (菜单改动时递增此版本)
--   biz:tables-v1 / biz:seed-v1 业务建表 / 种子数据
--   adpromo:09_ad_promotion.sql:v1 广告推广初始化脚本
--   organic:seed-23-v1          自然流量评分种子
--
-- 如需强制重跑某个初始化步骤, 删除对应版本记录后重启即可:
-- DELETE FROM sys_schema_version WHERE version_key = 'core:menu-seed-v1';
