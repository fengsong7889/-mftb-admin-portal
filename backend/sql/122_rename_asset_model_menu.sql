-- 122: 將「資產型號」菜單重命名為「產品庫」
-- 原因：該頁面實際管理品牌+產品兩級數據，「資產型號」名稱與功能不匹配

-- 更新中文名稱
UPDATE sys_menu SET name = '產品庫' WHERE menu_key = 'asset-model' AND deleted = 0;

-- 更新英文名稱
UPDATE sys_menu SET name_en = 'Product Library' WHERE menu_key = 'asset-model' AND deleted = 0;
