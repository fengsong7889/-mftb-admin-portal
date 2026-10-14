-- 236: 企业门户「我的常用」持久化到用户账号（换电脑 / 清浏览器缓存不丢）
--
-- 本脚本是参考文档；实际幂等执行由 DataInitializer 的
-- `core:portal-favorites-v1`（applyOnce + 后置校验）负责，未登记进 catalog.json
-- 的脚本不参与自动执行。
--
-- 为什么单开一列，不复用 69_user_quick_favorites.sql 的 quick_favorites：
--   quick_favorites  = 各业务系统「内部」的快捷菜单 key 列表（如 account-balance）
--   portal_favorites = 企业门户的「系统」编码列表（如 finance）
-- 两者都是整份覆盖写入（PUT 传全量数组），共用一列会互相抹掉对方的数据。

ALTER TABLE sys_user
    ADD COLUMN portal_favorites TEXT NULL
        COMMENT '企业门户常用系统编码列表，JSON 数组格式' AFTER quick_favorites;
