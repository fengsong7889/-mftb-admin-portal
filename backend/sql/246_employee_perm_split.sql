-- 246: 员工接口权限拆分 —— employee-management 的可授权动作集纠正为细分动作
-- 背景：原先薪酬、账号（冻结/重置密码）、敏感明文、角色授权全部共用
--       employee-management 的 view/edit，等于「能改电话号码就能看全公司身份证号、
--       能建档就能给自己提权」。方案 §7.3 要求「操作权限 × 人员范围 × 字段权限」三维分离。
-- 做法：同一菜单下拆动作（不新增菜单）。授权中心的可勾动作集唯一来自 sys_menu.actions，
--       菜单初始化器对已存在菜单不覆盖 actions，因此必须用独立 versionKey 一次性纠正
--       （见 EmployeePermSplitMenuInitializer，hr:employee-perm-split:v1.0）。
-- 新增动作：salaryView 薪酬档案查看 / salaryEdit 薪酬档案编辑 /
--           sensitiveView 敏感资料明文 / accountEdit 账号操作 / authorize 角色与菜单授权 /
--           export 全量导出。原有 view/create/edit/delete 语义不变。
-- 兼容性：内置 admin 走代码直通，不受影响；其它已持有 employee-management:edit 的角色
--         在本次之后**看不到薪酬 Tab、不能重置密码、不能改角色**，需要在授权中心显式补授 ——
--         这是刻意的默认拒绝（方案 §7.3「旧菜单权限不能自动扩展为全部敏感权限」）。
-- 说明：本文件为一次性参考文档；实际执行与后置校验由 Java 初始化器负责，登记于 catalog.json。

UPDATE sys_menu SET actions = '["view","create","edit","delete","export","salaryView","salaryEdit","sensitiveView","accountEdit","authorize"]'
WHERE menu_key = 'employee-management' AND deleted = 0;
