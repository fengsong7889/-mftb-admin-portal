-- ============================================================
-- 98_drop_unused_tables.sql
-- 清理全库无代码引用的僵尸表（先备份 *_unused_bak 再 DROP，可回滚，幂等）
--
-- 判定依据：交叉比对「已定义表」与「代码引用（实体 @TableName + Mapper 注入 + 原始 SQL）」，
-- 下列表无任何 Service/Controller/Mapper 读写：
--   ai_usage_log        AI 一代用量日志；实际计量已改用 biz_llm_usage（Mapper 从未注入）
--   ai_department_auth  AI 一代部门授权；已被二代 ai_dept_auth_group* 策略组取代（Mapper 从未注入）
--   ai_tool_registry    AI 工具注册表；功能未落地，无控制器/服务引用（Mapper 从未注入）
--   sys_user_role       用户-角色关联表；角色实际由 sys_user.role + sys_user.function_roles(JSON) 承载，全 Java 0 引用
--
-- 说明：ai_position_model_mapping / ai_role_model_mapping 已在 97_converge_ai_auth_legacy.sql 处理。
--       对应实体/Mapper 与 DataInitializer 建表块已随代码移除，全新部署不会重建这些表。
--       本脚本对不存在的表自动跳过，可重复执行。
-- ============================================================

-- ----------------------------
-- 1. ai_usage_log：备份 -> 删除
-- ----------------------------
SET @tbl := 'ai_usage_log';
SET @bak := CONCAT(@tbl, '_unused_bak');
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @sql := IF(@exists > 0, CONCAT('CREATE TABLE IF NOT EXISTS `', @bak, '` LIKE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@exists > 0, CONCAT('INSERT IGNORE INTO `', @bak, '` SELECT * FROM `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@exists > 0, CONCAT('DROP TABLE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ----------------------------
-- 2. ai_department_auth：备份 -> 删除
-- ----------------------------
SET @tbl := 'ai_department_auth';
SET @bak := CONCAT(@tbl, '_unused_bak');
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @sql := IF(@exists > 0, CONCAT('CREATE TABLE IF NOT EXISTS `', @bak, '` LIKE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@exists > 0, CONCAT('INSERT IGNORE INTO `', @bak, '` SELECT * FROM `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@exists > 0, CONCAT('DROP TABLE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ----------------------------
-- 3. ai_tool_registry：备份 -> 删除
-- ----------------------------
SET @tbl := 'ai_tool_registry';
SET @bak := CONCAT(@tbl, '_unused_bak');
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @sql := IF(@exists > 0, CONCAT('CREATE TABLE IF NOT EXISTS `', @bak, '` LIKE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@exists > 0, CONCAT('INSERT IGNORE INTO `', @bak, '` SELECT * FROM `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@exists > 0, CONCAT('DROP TABLE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ----------------------------
-- 4. sys_user_role：备份 -> 删除
-- ----------------------------
SET @tbl := 'sys_user_role';
SET @bak := CONCAT(@tbl, '_unused_bak');
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl);
SET @sql := IF(@exists > 0, CONCAT('CREATE TABLE IF NOT EXISTS `', @bak, '` LIKE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@exists > 0, CONCAT('INSERT IGNORE INTO `', @bak, '` SELECT * FROM `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF(@exists > 0, CONCAT('DROP TABLE `', @tbl, '`'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ----------------------------
-- 5. 验证：原表应已不存在，备份表保留
-- ----------------------------
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('ai_usage_log', 'ai_department_auth', 'ai_tool_registry', 'sys_user_role',
                     'ai_usage_log_unused_bak', 'ai_department_auth_unused_bak',
                     'ai_tool_registry_unused_bak', 'sys_user_role_unused_bak')
ORDER BY TABLE_NAME;

-- ============================================================
-- 回滚（如需）：对每张表执行
--   CREATE TABLE `<tbl>` LIKE `<tbl>_unused_bak`;
--   INSERT INTO `<tbl>` SELECT * FROM `<tbl>_unused_bak`;
-- ============================================================
