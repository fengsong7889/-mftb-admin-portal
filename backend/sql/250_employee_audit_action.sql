-- 250: 员工菜单新增 auditView 动作（人事操作审计查看）
-- 背景：审计查看不能挂在 employee-management 的 view 上。「能看花名册」不等于「能看谁动过花名册」，
--       方案 §7.3 要求「未显式授权默认拒绝」，而 §5.5 把人事审计单独列为一种能力。
-- 做法：并集补齐 sys_menu.actions（不覆盖管理员手工加的动作），并同步补授内置 admin 角色。
--       授权中心能勾什么唯一来自 sys_menu.actions；菜单初始化器对已存在菜单不覆盖 actions，
--       所以新增动作必须走独立 versionKey（见 EmployeeAuditActionMenuInitializer，hr:employee-audit-action:v1.0）。
-- 说明：本文件为一次性参考文档，实际执行与后置校验由 Java 侧负责并登记 catalog.json。

-- 结果形态（顺序保留原有值，新动作追加在末尾）：
--   ["view","create","edit","delete","export","salaryView","salaryEdit",
--    "sensitiveView","accountEdit","authorize","auditView"]

-- UPDATE sys_menu SET actions = '...上述 JSON...' WHERE menu_key = 'employee-management' AND deleted = 0;
-- UPDATE sys_role_menu SET actions = '...上述 JSON...' WHERE role_id = (内置 admin) AND menu_id = (上面的菜单);
-- 落地后 permissionService.evictAll()，避免跨实例继续拿旧动作集。

-- 再加新动作时必须再开一个 versionKey：applyOnce 之后不会重跑，改声明不会落到存量库。
