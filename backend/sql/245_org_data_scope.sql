-- 245: 组织数据权限（数据范围）平台能力 —— sys_role.data_scope + sys_role_dept
-- 背景：功能权限（sys_role_menu.actions）与系统准入（sys_role_system）都已存在，唯独缺「能看哪些人」
--       这一维度（见 docs/design/员工管理_Core_HR_整改方案_94e06fc1.md §10.9）。考勤是第一个消费方，
--       HR 花名册/绩效/薪酬是天然下家，因此把范围挂在「角色」上而不是任何菜单的 view 动作上。
-- 默认 1（仅本人）＝严格模式，与 DataScopeService「无授权返回空集合」的取向一致：
--       加列后所有存量角色立刻收窄为仅本人，而当前只有内置 admin 持有考勤菜单（admin 走代码直通），
--       所以存量行为不变；一旦在授权中心给某个角色勾上考勤菜单，它默认只能看自己的数据。
-- 说明：本文件为一次性参考文档；实际幂等迁移（先查 information_schema 再 ALTER）由
--       OrgScopeSchemaInitializer 的 applyOnce("iam:org-scope:v1.0", migrate, verify) 负责，
--       并登记于 db/migrations/catalog.json；结构契约登记于 ContractRegistry（每次启动自愈）。
--       生产仅 ADD/CREATE，不做破坏性操作。

ALTER TABLE sys_role ADD COLUMN data_scope TINYINT NOT NULL DEFAULT 1
    COMMENT '数据范围: 1仅本人 2本部门 3本部门及以下 4自定部门 5全部';

CREATE TABLE IF NOT EXISTS sys_role_dept (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    role_id    BIGINT   NOT NULL COMMENT '角色ID(sys_role.id)',
    dept_id    BIGINT   NOT NULL COMMENT '部门ID(sys_department.id)',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    UNIQUE KEY uk_role_dept (role_id, dept_id),
    KEY idx_role_dept_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-自定部门数据范围关联表';

-- 注：data_scope=4（自定部门）时 sys_role_dept 才是范围的来源；其余档位该表对应角色必须为空，
--     由 RoleServiceImpl 在保存时一并收敛，避免出现「档位是全部但残留部门行」的脏状态。
--     自定部门在解析时「连同全部下级」展开（OrgScopeServiceImpl），勾上级中心即管到中心下面的人。
