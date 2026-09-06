-- ============================================================
-- 97_converge_ai_auth_legacy.sql
-- AI 授权源收敛：一代职位/角色授权映射表退役（权威源统一到二代）
--
-- 背景：
--   「员工模型权控」页的「按职位授权 / 角色授权」两个 Tab 自 96_emp_pos_role_auth.sql
--   起持久化到二代表 ai_emp_pos_auth_strategy / ai_emp_role_auth。一代
--   ai_position_model_mapping / ai_role_model_mapping 及其控制器
--   (/api/ai/auth/positions、/api/ai/auth/roles) 已无前端调用，全库亦无种子数据；
--   代码侧 AiMyCenterServiceImpl.myModels() 的一代读取路径已移除，授权并集收敛为二代单一权威源。
--
-- 本脚本：幂等、先备份后删除，可通过 *_legacy_bak 备份表回滚。
-- 说明：一代表若不存在（全新部署已不再建表）则自动跳过。
-- ============================================================

-- ----------------------------
-- 1. ai_position_model_mapping：备份 -> 删除
-- ----------------------------
SET @tbl := 'ai_position_model_mapping';
SET @bak := CONCAT(@tbl, '_legacy_bak');
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);

SET @sql := IF(@exists > 0, CONCAT('CREATE TABLE IF NOT EXISTS `', @bak, '` LIKE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(@exists > 0, CONCAT('INSERT IGNORE INTO `', @bak, '` SELECT * FROM `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(@exists > 0, CONCAT('DROP TABLE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ----------------------------
-- 2. ai_role_model_mapping：备份 -> 删除
-- ----------------------------
SET @tbl := 'ai_role_model_mapping';
SET @bak := CONCAT(@tbl, '_legacy_bak');
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);

SET @sql := IF(@exists > 0, CONCAT('CREATE TABLE IF NOT EXISTS `', @bak, '` LIKE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(@exists > 0, CONCAT('INSERT IGNORE INTO `', @bak, '` SELECT * FROM `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(@exists > 0, CONCAT('DROP TABLE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ----------------------------
-- 3. 清理已被 93 软删除的一代 Tab 独立菜单残留（幂等）
--    ai-pos-auth / ai-role-auth 现为「员工模型权控」页内 Tab，不再是独立菜单
-- ----------------------------
DELETE FROM sys_role_menu
WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key IN ('ai-pos-auth', 'ai-role-auth'));

DELETE FROM sys_menu WHERE menu_key IN ('ai-pos-auth', 'ai-role-auth') AND deleted = 1;

-- ----------------------------
-- 4. 验证：一代表应已不存在，备份表保留
-- ----------------------------
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('ai_position_model_mapping', 'ai_role_model_mapping',
                     'ai_position_model_mapping_legacy_bak', 'ai_role_model_mapping_legacy_bak')
ORDER BY TABLE_NAME;

-- ============================================================
-- 回滚（如需）：
--   CREATE TABLE ai_position_model_mapping LIKE ai_position_model_mapping_legacy_bak;
--   INSERT INTO ai_position_model_mapping SELECT * FROM ai_position_model_mapping_legacy_bak;
--   CREATE TABLE ai_role_model_mapping LIKE ai_role_model_mapping_legacy_bak;
--   INSERT INTO ai_role_model_mapping SELECT * FROM ai_role_model_mapping_legacy_bak;
--   （并恢复代码侧一代读取路径与控制器）
-- ============================================================
