-- 188: 独立下线耗材分类、品牌、计量单位旧菜单，不修改分类/品牌/库存等业务表。
-- 一次性参考脚本；实际由 ConsumableSchemaInitializer 执行，版本键为
-- consumable:retire-legacy-menus-v1.0，已登记 catalog.json，并在每次启动校验和修复漂移。
-- 不删除旧迁移版本，不重跑含业务数据搬迁的 EAM v8。

UPDATE sys_menu
SET deleted = 1, status = 0, updated_by = 'system'
WHERE menu_key IN ('consumable-category', 'consumable-brand', 'consumable-unit')
  AND (deleted <> 1 OR status <> 0);

-- 后置校验：结果必须为 0。
SELECT COUNT(*) AS remaining_legacy_menus
FROM sys_menu
WHERE menu_key IN ('consumable-category', 'consumable-brand', 'consumable-unit')
  AND (deleted <> 1 OR status <> 0);
