-- 198: 收敛超级管理员 —— 一个系统仅允许一个内置超管（MF00001）
-- 背景: 员工权限透视显示大量员工因 function_roles 绑定了 admin 角色(id=1) 被判定为超级管理员。
-- 处理: 从非内置超管账号的 function_roles 中移除 admin 角色绑定，仅保留 sys_user.role='admin' 的内置超管。
-- 说明: 本脚本为一次性参考文档，已于开发库手动执行（affected=19）；生产执行前请先跑末尾的预检查询确认影响范围。

UPDATE sys_user
SET function_roles = JSON_REMOVE(function_roles, JSON_UNQUOTE(JSON_SEARCH(function_roles, 'one', '1'))),
    updated_by = 'system-admin-dedup'
WHERE deleted = 0
  AND role <> 'admin'
  AND function_roles IS NOT NULL
  AND JSON_CONTAINS(function_roles, '1');

-- 预检（执行前应返回待收敛的账号清单）:
-- SELECT id, username, name, role, function_roles FROM sys_user
-- WHERE deleted = 0 AND role <> 'admin' AND JSON_CONTAINS(function_roles, '1');

-- 后置校验（应仅剩内置超管一条记录）:
-- SELECT id, username, name, role, function_roles FROM sys_user
-- WHERE deleted = 0 AND (role = 'admin' OR JSON_CONTAINS(function_roles, '1'));
