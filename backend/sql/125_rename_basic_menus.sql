-- 基础配置子菜单名称统一调整，形成"XX库"命名风格
-- 原因：原名辨识度不足，改名后语义更明确、风格更统一

-- 1. 基础设置 → 基础配置（父级分组名称）
UPDATE sys_menu SET name = '基礎配置', icon = 'ControlOutlined' WHERE menu_key = 'asset-basic' AND deleted = 0;
UPDATE sys_menu SET name_en = 'Basic Configuration' WHERE menu_key = 'asset-basic' AND deleted = 0;

-- 2. 资产分类 → 资产分类库
UPDATE sys_menu SET name = '資產分類庫', icon = 'TagsOutlined' WHERE menu_key = 'asset-category' AND deleted = 0;
UPDATE sys_menu SET name_en = 'Asset Category Library' WHERE menu_key = 'asset-category' AND deleted = 0;

-- 3. 产品库 → 品牌产品库
UPDATE sys_menu SET name = '品牌產品庫', icon = 'BarcodeOutlined' WHERE menu_key = 'asset-model' AND deleted = 0;
UPDATE sys_menu SET name_en = 'Brand Product Library' WHERE menu_key = 'asset-model' AND deleted = 0;

-- 4. 参数库 → 产品参数库
UPDATE sys_menu SET name = '產品參數庫', icon = 'DatabaseOutlined' WHERE menu_key = 'param-library' AND deleted = 0;
UPDATE sys_menu SET name_en = 'Product Parameter Library' WHERE menu_key = 'param-library' AND deleted = 0;

-- 5. 仓库维护 → 不变（无需修改）

-- 附注：菜单更新接口 PUT /api/menus/{id} 未传 icon 字段时会清空该字段，
-- 后续通过接口改菜单名时务必带上原 icon 值。
