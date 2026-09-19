-- 171: 基础配置子菜单重命名
-- 1) 資產分類庫 → 分類庫
-- 2) 資產品牌產品庫 → 品牌產品庫
-- 3) 倉庫維護 → 倉庫管理

UPDATE sys_menu SET name = '分類庫', name_en = 'Category Library'
  WHERE menu_key = 'asset-category' AND deleted = 0;

UPDATE sys_menu SET name = '品牌產品庫', name_en = 'Brand Product Library'
  WHERE menu_key = 'asset-model' AND deleted = 0;

UPDATE sys_menu SET name = '倉庫管理', name_en = 'Warehouse Management'
  WHERE menu_key = 'asset-location' AND deleted = 0;
