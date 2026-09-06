-- ============================================================
-- MFTB 搜广推系统 - 产品版本号注册
-- 采用语义化版本 (Semantic Versioning): major.minor.patch
--   major — 不兼容的重大变更 (架构重构 / 数据模型颠覆)
--   minor — 向下兼容的功能新增 (新模块 / 新接口)
--   patch — 向下兼容的问题修复 (Bug 修复 / 小优化)
--
-- 版本号与 pom.xml / package.json 保持同步;
-- 后续版本升级时同步修改此脚本中的 INSERT 值即可.
-- ============================================================

-- 产品版本号写入系统配置 (INSERT IGNORE 幂等, 已存在时不覆盖)
INSERT IGNORE INTO sys_config (config_key, config_value, description)
VALUES ('product_version', '1.0.0', '产品版本号 (Semantic Versioning), 与 pom.xml / package.json 同步');
