-- 177: 归还记录表新增操作人 ID 列（用于详情展示归还接收人工号）
-- 新增 operator_id 列，并回填历史数据（按 operator_name 匹配 sys_user.name）

ALTER TABLE biz_eam_return ADD COLUMN operator_id BIGINT NULL COMMENT '操作人 ID（归还接收人）' AFTER operator_name;

-- 回填历史数据：按 operator_name 匹配 sys_user.name（取最新一条）
UPDATE biz_eam_return r
INNER JOIN sys_user u ON u.name = r.operator_name AND u.deleted = 0
SET r.operator_id = u.id
WHERE r.operator_id IS NULL AND r.deleted = 0;
