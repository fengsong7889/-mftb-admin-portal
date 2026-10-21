-- 271: 存量项目负责人回填到 rdm_project_member
--
-- 用途：旧代码创建项目时只把「项目经理」写入成员表，产品/技术/UI/测试/运维五类负责人
--       只存 rdm_project 主表；编辑项目更是从未同步成员表。结果是详情页「項目成員」为空，
--       负责人本人也进不了自己负责的项目（数据范围按成员表收敛）。
--       本脚本把六类负责人按「一人一角色一行」补齐（uk_project_user_role 口径）。
--
-- 说明：本脚本仅作参照文档，实际幂等执行由 Java 迁移
--       rdmSchemaMigrationInitializer（versionKey = rdm:schema:v3.24）负责：
--       先复活已离任（leave_time 非空）的同一行，再插入缺失行；重放即 no-op。
--       生产发布禁止直接执行本脚本。
--
-- 回滚：本脚本只插入/复活负责人成员行，不删不改其他成员；如需回滚，
--       可按 role_code + join_time 定位本次新增行删除，或直接保留（不影响业务写入）。

-- ── 1) 复活已离任的负责人行：唯一键不区分 leave_time，直接 INSERT 会撞键 ──
UPDATE rdm_project_member m
  JOIN rdm_project p ON p.id = m.project_id
   SET m.leave_time = NULL,
       m.join_time = NOW(),
       m.user_name = COALESCE(p.pm_user_name, m.user_name)
 WHERE m.role_code = 'pm' AND m.leave_time IS NOT NULL AND m.user_id = p.pm_user_id;

UPDATE rdm_project_member m
  JOIN rdm_project p ON p.id = m.project_id
   SET m.leave_time = NULL,
       m.join_time = NOW(),
       m.user_name = COALESCE(p.product_owner_user_name, m.user_name)
 WHERE m.role_code = 'product' AND m.leave_time IS NOT NULL
   AND m.user_id = p.product_owner_user_id;

UPDATE rdm_project_member m
  JOIN rdm_project p ON p.id = m.project_id
   SET m.leave_time = NULL,
       m.join_time = NOW(),
       m.user_name = COALESCE(p.tech_lead_user_name, m.user_name)
 WHERE m.role_code = 'dev_lead' AND m.leave_time IS NOT NULL
   AND m.user_id = p.tech_lead_user_id;

UPDATE rdm_project_member m
  JOIN rdm_project p ON p.id = m.project_id
   SET m.leave_time = NULL,
       m.join_time = NOW(),
       m.user_name = COALESCE(p.ui_designer_user_name, m.user_name)
 WHERE m.role_code = 'designer' AND m.leave_time IS NOT NULL
   AND m.user_id = p.ui_designer_user_id;

UPDATE rdm_project_member m
  JOIN rdm_project p ON p.id = m.project_id
   SET m.leave_time = NULL,
       m.join_time = NOW(),
       m.user_name = COALESCE(p.qa_lead_user_name, m.user_name)
 WHERE m.role_code = 'qa' AND m.leave_time IS NOT NULL AND m.user_id = p.qa_lead_user_id;

UPDATE rdm_project_member m
  JOIN rdm_project p ON p.id = m.project_id
   SET m.leave_time = NULL,
       m.join_time = NOW(),
       m.user_name = COALESCE(p.ops_lead_user_name, m.user_name)
 WHERE m.role_code = 'ops' AND m.leave_time IS NOT NULL AND m.user_id = p.ops_lead_user_id;

-- ── 2) 补齐缺失的负责人成员行 ──
INSERT INTO rdm_project_member (project_id, user_id, user_name, role_code, join_time)
SELECT p.id, p.pm_user_id, p.pm_user_name, 'pm', NOW()
  FROM rdm_project p
 WHERE p.pm_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM rdm_project_member m
                    WHERE m.project_id = p.id AND m.user_id = p.pm_user_id AND m.role_code = 'pm');

INSERT INTO rdm_project_member (project_id, user_id, user_name, role_code, join_time)
SELECT p.id, p.product_owner_user_id, p.product_owner_user_name, 'product', NOW()
  FROM rdm_project p
 WHERE p.product_owner_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM rdm_project_member m
                    WHERE m.project_id = p.id AND m.user_id = p.product_owner_user_id AND m.role_code = 'product');

INSERT INTO rdm_project_member (project_id, user_id, user_name, role_code, join_time)
SELECT p.id, p.tech_lead_user_id, p.tech_lead_user_name, 'dev_lead', NOW()
  FROM rdm_project p
 WHERE p.tech_lead_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM rdm_project_member m
                    WHERE m.project_id = p.id AND m.user_id = p.tech_lead_user_id AND m.role_code = 'dev_lead');

INSERT INTO rdm_project_member (project_id, user_id, user_name, role_code, join_time)
SELECT p.id, p.ui_designer_user_id, p.ui_designer_user_name, 'designer', NOW()
  FROM rdm_project p
 WHERE p.ui_designer_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM rdm_project_member m
                    WHERE m.project_id = p.id AND m.user_id = p.ui_designer_user_id AND m.role_code = 'designer');

INSERT INTO rdm_project_member (project_id, user_id, user_name, role_code, join_time)
SELECT p.id, p.qa_lead_user_id, p.qa_lead_user_name, 'qa', NOW()
  FROM rdm_project p
 WHERE p.qa_lead_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM rdm_project_member m
                    WHERE m.project_id = p.id AND m.user_id = p.qa_lead_user_id AND m.role_code = 'qa');

INSERT INTO rdm_project_member (project_id, user_id, user_name, role_code, join_time)
SELECT p.id, p.ops_lead_user_id, p.ops_lead_user_name, 'ops', NOW()
  FROM rdm_project p
 WHERE p.ops_lead_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM rdm_project_member m
                    WHERE m.project_id = p.id AND m.user_id = p.ops_lead_user_id AND m.role_code = 'ops');
