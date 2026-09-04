-- ============================================================
-- 82-fix-AI-quota-menu-paths.sql
-- AI 配额与策略管理菜单路径修复 - 快速执行版
-- 目的：修正子菜单的 path 字段（去除多余的/ai-前缀）
-- 注意：本脚本只改路径字段，不影响功能；实际页面需后续开发
-- ============================================================

UPDATE sys_menu SET path = '/ai-dept-model-auth' WHERE menu_key = 'ai-dept-model-auth' AND path LIKE '/ai-ai-%';
UPDATE sys_menu SET path = '/ai-emp-model-auth'  WHERE menu_key = 'ai-emp-model-auth'   AND path LIKE '/ai-ai-%';
UPDATE sys_menu SET path = '/ai-quota-policy'    WHERE menu_key = 'ai-quota-policy'     AND path LIKE '/ai-ai-%';
UPDATE sys_menu SET path = '/ai-routing-strategy'WHERE menu_key = 'ai-routing-strategy'AND path LIKE '/ai-ai-%';
UPDATE sys_menu SET path = '/ai-quota-overview'  WHERE menu_key = 'ai-quota-overview'  AND path LIKE '/ai-ai-%';

-- 验证结果
SELECT id, menu_key, name, parent_id, path FROM sys_menu WHERE menu_key IN ('ai-quota-config','ai-dept-model-auth','ai-emp-model-auth','ai-quota-policy','ai-routing-strategy','ai-quota-overview');
