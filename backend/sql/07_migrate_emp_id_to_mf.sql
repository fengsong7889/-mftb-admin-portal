-- ============================================================
-- 员工工号迁移: MT+4位 → MF+5位
-- 执行前请先备份 sys_user 表
-- 幂等: 已是 MF 格式的记录不会重复处理
-- ============================================================

-- 1. 查看当前工号分布（执行前确认）
SELECT id, username, emp_id, name
FROM sys_user
ORDER BY id;

-- 2. 将 MT 前缀的工号迁移为 MF + 5位自增格式
--    按 id 升序保证编号稳定
UPDATE sys_user
SET username = CONCAT('MF', LPAD(CAST(SUBSTRING(username, 3) AS UNSIGNED), 5, '0')),
    emp_id   = CONCAT('MF', LPAD(CAST(SUBSTRING(emp_id, 3) AS UNSIGNED), 5, '0'))
WHERE username REGEXP '^MT[0-9]+$'
ORDER BY id;

-- 3. 验证迁移结果
SELECT id, username, emp_id, name
FROM sys_user
ORDER BY id;
