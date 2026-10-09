-- 219: 退役「拆分业务系统前的一级包装目录」（12 个壳菜单）
--
-- 背景：系统视图上线后，侧边栏与 /portal/systems/{code}/navigation 剪枝完全按
--       sys_menu.system_code 裁剪，这层壳不再承担任何运行时职责；以前靠前端
--       Sidebar 的 SYSTEM_WRAPPER_KEYS 硬编码展平来掩盖，导致「菜单配置」里能看到、
--       进入系统却根本不展示的幽灵一级目录。
--
-- 本脚本是参考文档；生产实际执行由 DataInitializer#retireSystemWrapperDirectories()
-- 每次启动幂等完成（顺序不可颠倒：先提升子菜单，再清授权，最后删壳行）。
-- 幂等保证：所有语句均以「行存在」为条件，重复执行为 0 行影响。
--
-- 退役清单：merchant_group / promotion_tool / seller-center / search / finance /
--           ai-assistant / hr / asset-management / oa-center / permission /
--           system-config / i18n-center
--
-- 回滚：本脚本为物理删除，不可就地回滚。回滚需按 219_rollback 段重建壳并把子菜单
--       挂回去（见文件末尾），且必须同时回滚 Java 侧 RETIRED_SYSTEM_WRAPPERS，
--       否则下次启动会再次退役。

-- ── 1. 子菜单提升为顶级（保留 type / sort_order / system_code，侧边栏顺序不变）──
UPDATE sys_menu c
    JOIN sys_menu p ON c.parent_id = p.id
   SET c.parent_id = NULL,
       c.updated_by = 'system'
 WHERE p.menu_key IN (
        'merchant_group', 'promotion_tool', 'seller-center', 'search', 'finance',
        'ai-assistant', 'hr', 'asset-management', 'oa-center', 'permission',
        'system-config', 'i18n-center'
       )
   AND c.deleted = 0;

-- ── 2. 清理壳的授权引用（壳自身不参与功能鉴权，留着只会成为脏引用）──
DELETE rm FROM sys_role_menu rm
    JOIN sys_menu m ON m.id = rm.menu_id
   WHERE m.menu_key IN (
        'merchant_group', 'promotion_tool', 'seller-center', 'search', 'finance',
        'ai-assistant', 'hr', 'asset-management', 'oa-center', 'permission',
        'system-config', 'i18n-center'
       );

DELETE dm FROM sys_department_menu dm
    JOIN sys_menu m ON m.id = dm.menu_id
   WHERE m.menu_key IN (
        'merchant_group', 'promotion_tool', 'seller-center', 'search', 'finance',
        'ai-assistant', 'hr', 'asset-management', 'oa-center', 'permission',
        'system-config', 'i18n-center'
       );

-- ── 3. 物理删除壳行（含 deleted=1 残留：uk_menu_key 是全局唯一索引，
--        软删残留会让后续按同 key 建菜单时撞唯一键 —— v44 生产事故模式）──
DELETE FROM sys_menu
 WHERE menu_key IN (
        'merchant_group', 'promotion_tool', 'seller-center', 'search', 'finance',
        'ai-assistant', 'hr', 'asset-management', 'oa-center', 'permission',
        'system-config', 'i18n-center'
       );

-- ── 4. 顶级菜单归属兜底（提升后的菜单必须已有 system_code，否则系统视图取不到）──
--    真值来源：docs/system-portal/inventory.md §2；代码侧同步维护于
--    SystemPortalSchemaInitializer#backfillTopLevelMenuSystem。
SELECT COUNT(*) AS top_menus_missing_system_code
  FROM sys_menu
 WHERE parent_id IS NULL AND deleted = 0 AND system_code IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 219_rollback（仅在必须退回旧结构时手工执行；执行前务必先回滚 Java 侧常量）
-- 说明：只恢复壳与父子关系，不恢复壳的授权（授权已按业务菜单粒度重挂，无损失）。
-- ════════════════════════════════════════════════════════════════════════════
-- INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, system_code, deleted, updated_by)
-- VALUES (NULL, 'search', '搜索管理', 1, 5, 1, 'search', 0, 'system'),
--        (NULL, 'finance', '財務管理', 1, 6, 1, 'finance', 0, 'system'),
--        (NULL, 'permission', '權限管理', 1, 13, 1, 'iam', 0, 'system');
-- UPDATE sys_menu c JOIN sys_menu p ON p.menu_key = 'search'
--    SET c.parent_id = p.id WHERE c.menu_key IN ('search-config-new','search-guide','search-library','search-verify-group','report');
-- UPDATE sys_menu c JOIN sys_menu p ON p.menu_key = 'finance'
--    SET c.parent_id = p.id WHERE c.menu_key IN ('promotion','merchant-reconcile','approval');
-- UPDATE sys_menu c JOIN sys_menu p ON p.menu_key = 'permission'
--    SET c.parent_id = p.id WHERE c.menu_key IN ('authorization-center','role-management','function-permission','data-permission','system-authorization');
