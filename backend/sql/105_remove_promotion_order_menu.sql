-- 移除「推广通 > 订单管理」菜单项
-- 所有订单入口已统一至广告类型卡片上的「查看订单」按钮，无需独立菜单入口

-- 1. 删除角色-菜单关联
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key = 'promotion-order-manage');

-- 2. 删除部门-菜单关联
DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key = 'promotion-order-manage');

-- 3. 删除菜单本身
DELETE FROM sys_menu WHERE menu_key = 'promotion-order-manage';
