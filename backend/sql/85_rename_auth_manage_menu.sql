-- 重命名菜单：模型授权管理 → 模型权控
UPDATE sys_menu SET menu_name = '模型权控' WHERE menu_key = 'ai-auth-manage' AND deleted = 0;
