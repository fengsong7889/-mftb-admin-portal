-- v35: 强制修正基础配置子菜单名称与图标
-- 原因：数据库重置或 125_rename_basic_menus.sql 未执行导致菜单名恢复旧值
-- 本脚本与 DataInitializer v35 逻辑一致，可手动执行或等后端启动自动修正

-- 1. 基础设置 → 基础配置（图标改为 ControlOutlined，避免与系统配置图标重复）
UPDATE sys_menu SET name = '基礎配置', icon = 'ControlOutlined' WHERE menu_key = 'asset-basic' AND deleted = 0 AND name != '基礎配置';
UPDATE sys_menu SET name_en = 'Basic Configuration' WHERE menu_key = 'asset-basic' AND deleted = 0;

-- 2. 资产分类 → 资产分类库
UPDATE sys_menu SET name = '資產分類庫', icon = 'TagsOutlined' WHERE menu_key = 'asset-category' AND deleted = 0 AND name != '資產分類庫';
UPDATE sys_menu SET name_en = 'Asset Category Library' WHERE menu_key = 'asset-category' AND deleted = 0;

-- 3. 资产型号 → 品牌产品库
UPDATE sys_menu SET name = '品牌產品庫', icon = 'BarcodeOutlined' WHERE menu_key = 'asset-model' AND deleted = 0 AND name != '品牌產品庫';
UPDATE sys_menu SET name_en = 'Brand Product Library' WHERE menu_key = 'asset-model' AND deleted = 0;

-- 4. 参数库 → 产品参数库
UPDATE sys_menu SET name = '產品參數庫', icon = 'DatabaseOutlined' WHERE menu_key = 'param-library' AND deleted = 0 AND name != '產品參數庫';
UPDATE sys_menu SET name_en = 'Product Parameter Library' WHERE menu_key = 'param-library' AND deleted = 0;
