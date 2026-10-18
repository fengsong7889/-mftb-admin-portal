-- 246: 系統權限申請申请口径改造 —— 从「勾选菜单功能」改为「陈述使用诉求 + 可选参考角色」
--      一次性参考文档；实际执行与幂等由两个 Java 迁移负责：
--        · iam:role-self-service-v1  → DataInitializer（sys_role 补列，必须早于任何 sys_role 实体查询）
--        · oa:system-access:v1.1     → SystemAccessSchemaInitializer（@Order 32，申请单补 5 列 + 流程说明改口径）
--      方言：MySQL 8.x。禁止整脚本重放（本文件不进镜像、不由框架执行）。
--
--      ⚠ 本文件所述「本期不做到期自动回收」已被后续迁移 247_system_access_expiry.sql 变更，
--        现状（到期次日起自动收回、只回收本单真的新绑的角色）以 247 为准。
--        本文件保留原文不改，是因为迁移一旦执行就是历史。
--
-- 为什么改（用户决策 A+B，对齐 Entra ID Access Packages / SailPoint business role / Okta Group）：
--   1. 架构泄露：勾选树把目标系统整棵功能树摊给一个对该系统零权限的人（含内部治理类菜单），
--      等于向全员发放各系统功能地图；
--   2. 诱导过度授权：勾选树 +「全選」与最小权限原则反向（深度测试中执行者自己就顺手全选了 12 项）；
--   3. 责任错位：「需要哪些功能」本属审批人/权限管理员的专业判断，让申请人猜菜单两边都费劲。
--   业界共性：申请对象是角色/权限包/应用而不是权限点；业务理由必填；目录按「可申请范围」裁剪而非全量。
--
-- 新口径：
--   申请人填「使用场景（多选枚举）+ 使用期限（长期/至指定日期）+ 使用诉求说明 + 凭证」，
--   可选地从「开放自助申请」的角色目录里指定一个参考角色；最终授予哪个角色仍由审批人在流程上决定，
--   兑现前 SystemAccessGrantServiceImpl.requireGrantableRole 会再校验一次（角色存在/启用/非 admin/已持系统准入）。
--   本期不做到期自动回收：duration_until 只是审批人的判断依据，界面上必须如实告知，不得当成权限有效期承诺。

-- ── 1. sys_role 补「开放员工自助申请」开关 ────────────────────────────────
--      默认 0：存量角色一律不进自助目录。可空或默认 1 会让全量角色清单在一次结构迁移里
--      被推到零权限员工面前，所以 Java 侧后置校验连 IS_NULLABLE 与 COLUMN_DEFAULT 一起查。
--      它不授予任何权限，只决定角色在门户申请页的参考角色目录里是否可见。
ALTER TABLE sys_role
    ADD COLUMN self_service_requestable TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '是否开放员工自助申请：1=出现在门户系统权限申请的参考角色目录，0=不开放'
    AFTER description;

-- ── 2. 申请单补 5 列（全部可空：历史单据没有这些事实，给默认值反而是伪造）──
--      例如给旧单填个 permanent，审批人会把「未采集」误读为「申请人说要长期」。
ALTER TABLE biz_system_access_request
    ADD COLUMN scenarios           VARCHAR(255) DEFAULT NULL
        COMMENT '使用场景code,逗号分隔' AFTER dept_name,
    ADD COLUMN duration_type       VARCHAR(16)  DEFAULT NULL
        COMMENT '使用期限类型: permanent/until' AFTER scenarios,
    ADD COLUMN duration_until      DATE         DEFAULT NULL
        COMMENT '期限截止日(不做到期自动回收,仅作审批依据)' AFTER duration_type,
    ADD COLUMN preferred_role_id   BIGINT       DEFAULT NULL
        COMMENT '申请人建议的参考角色 sys_role.id' AFTER duration_until,
    ADD COLUMN preferred_role_name VARCHAR(64)  DEFAULT NULL
        COMMENT '参考角色名称快照' AFTER preferred_role_id;

-- ── 3. requested_menus 保留为历史列（刻意不删）────────────────────────────
--      它是 2026-10 前单据的申请事实，删列等于毁证据；新单一律留 NULL。
--      只改注释，让后来读表的人知道这列已停写：
ALTER TABLE biz_system_access_request
    MODIFY COLUMN requested_menus MEDIUMTEXT
    COMMENT '【历史列】勾选菜单JSON,2026-10后新单不再写入';
ALTER TABLE biz_system_access_request
    MODIFY COLUMN reason VARCHAR(1000) NOT NULL COMMENT '使用诉求说明';

-- ── 4. 流程说明改口径（流程中心/发起页直接展示，留着旧文案会把审批人指错方向）──
UPDATE biz_oa_process
SET description = '申請未授權業務系統的使用權限：陳述使用場景與期限（不再勾選菜單功能，避免向零權限員工暴露系統結構），可選指定一個參考角色；審批人據此指定授權角色，通過後自動綁定並立即生效'
WHERE process_code = 'system_access';

-- ── 5. 回滚口径 ─────────────────────────────────────────
--      编号规则本身不变（XTSQ + YYYYMMDD + 2 位日流水），sys_biz_seq_rule 的 remark 也没提到菜单，
--      故本迁移不动「編號生成規則」页的展示内容。
--      本迁移只 ADD COLUMN / MODIFY COMMENT / UPDATE 文案，不含破坏性操作，无需数据回滚。
--      回退代码后：
--        · 6 个新列保留不删（旧代码不读它们；删列会毁掉已提交的申请事实与管理员已做的开放决定）；
--        · 需要关闭自助角色目录时：UPDATE sys_role SET self_service_requestable = 0;
--        · biz_oa_process.description 不会随代码回退自动改回（applyOnce 已记版本），
--          如需恢复旧文案须人工执行一条 UPDATE，仅影响流程中心一行说明文字；
--        · 已提交的申请单与已兑现的角色绑定不受影响，回收仍按 sys_permission_audit 的
--          CHANGE_BIND 记录（含 flowNo）人工处理。
