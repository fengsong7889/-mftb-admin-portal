-- ============================================================
-- 114_restore_deleted_employees.sql
-- 用途: 查询并恢复最近被逻辑删除的员工账号
-- 说明: 员工删除操作为逻辑删除(deleted=1)，记录仍在表中
-- ============================================================

-- ① 先查看所有被删除的员工（确认要恢复哪些）
SELECT id, username, name, emp_id, department, position,
       `sequence`, job_level, `rank`, updated_by, updated_at
FROM sys_user
WHERE deleted = 1
ORDER BY updated_at DESC;

-- ② 恢复全部被删除的员工（2026-09-08 执行）
UPDATE sys_user
SET deleted = 0,
    updated_at = NOW()
WHERE id IN (3, 4, 12, 17, 18, 19, 22);

-- ③ 如果只想恢复特定员工，用 id 列表（更安全）
-- UPDATE sys_user
-- SET deleted = 0,
--     updated_at = NOW()
-- WHERE id IN (/* 从 ① 的结果中填入具体 id */);
