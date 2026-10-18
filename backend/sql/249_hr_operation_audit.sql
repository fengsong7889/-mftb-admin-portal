-- 249: 人事操作审计表 hr_operation_audit（方案 §5.5 新增人事操作审计、§7.4 审计字段要求）
-- 背景：此前「谁改了这份档案」只有两个来源——登录日志（员工动态，压根不是人事动作）
--       与详情页写死的 localStorage「最后更新时间」。两者都不能回答
--       「李四的证件号是哪天被谁从 A 改成 B 的」，而这是人事审计唯一需要回答的问题。
-- 口径：
--   ① 一条审计 = 一次操作的一个字段（改 3 个字段落 3 行），动作级信息（原因/来源单号/生效日）每行重复存，
--      让审计行能脱离业务单据独立解读。
--   ② before/after 在**写入时**就脱敏（SensitiveMask），审计表不留明文副本：
--      审计查询页的读者不一定持有 sensitiveView，存明文等于开一条绕过字段权限的旁路。
--   ③ 无 deleted 列：审计是留痕不是业务数据，给软删标记等于给自己留「让某次操作从报表里消失」的路径。
--   ④ 不与授权审计 sys_permission_audit_log 合表：那张表没有生效日/原因/来源单号，
--      且 target_type 口径是 role/department，硬塞会让两张表都失去可解释性。
-- 说明：本文件为一次性参考文档；实际建表 + CHECK 后置校验由 HrAuditSchemaInitializer
--       （hr:audit-schema:v1.0，@Order(33)）执行，并登记 catalog.json 与 ContractRegistry。

CREATE TABLE IF NOT EXISTS hr_operation_audit (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id         BIGINT       NOT NULL COMMENT '被操作员工ID(sys_user.id)',
    emp_no          VARCHAR(32)  DEFAULT NULL COMMENT '员工工号快照（改名/删号后仍可定位）',
    action          VARCHAR(32)  NOT NULL COMMENT '动作: EMPLOYEE_UPDATE/SENSITIVE_VIEW/POSITION_WRITE 等',
    field_name      VARCHAR(64)  DEFAULT NULL COMMENT '变更字段名，动作级留痕为 NULL',
    before_value    VARCHAR(500) DEFAULT NULL COMMENT '变更前值（敏感字段写入时已脱敏）',
    after_value     VARCHAR(500) DEFAULT NULL COMMENT '变更后值（敏感字段写入时已脱敏）',
    detail          VARCHAR(500) DEFAULT NULL COMMENT '动作补充说明',
    reason          VARCHAR(255) DEFAULT NULL COMMENT '原因',
    source_req_no   VARCHAR(32)  DEFAULT NULL COMMENT '来源人事单据号',
    effective_date  DATE         DEFAULT NULL COMMENT '业务生效日（与发生时间分开）',
    -- sensitive 是 MySQL 8 保留字（索引敏感度）：不加反引号时 DDL 与 INSERT 都直接语法错（开发库首次启动实测踩到）
    `sensitive`     TINYINT      NOT NULL DEFAULT 0 COMMENT '是否涉及敏感面: 1是 0否',
    operator        VARCHAR(64)  DEFAULT NULL COMMENT '操作人快照',
    occurred_at     DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
    KEY idx_hr_audit_user (user_id, occurred_at),
    KEY idx_hr_audit_action (action, occurred_at),
    KEY idx_hr_audit_operator (operator, occurred_at),
    CONSTRAINT ck_hr_audit_action CHECK (action IN (
        'EMPLOYEE_CREATE','EMPLOYEE_UPDATE','EMPLOYEE_DELETE','PROFILE_UPDATE','SENSITIVE_VIEW',
        'ACCOUNT_DISABLE','ACCOUNT_ENABLE','PASSWORD_RESET','ROLE_BIND','POSITION_WRITE',
        'PERIOD_REGISTER','CONTRACT_WRITE','SALARY_WRITE','LIFECYCLE_EXECUTE','ROSTER_EXPORT'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='人事操作审计（只增不改，无软删列）';

-- 动作集与后端 constant/HrAuditAction.ALL_ACTIONS 逐字同构（CHECK 由 Java 侧生成，防漂移）。
-- SALARY_WRITE / LIFECYCLE_EXECUTE / ROSTER_EXPORT 先占位：
--   薪酬 8 个写入端点与花名册全量导出分别在 P6、P5 单据化改造时接入，动作集先扩、写入点后补，
--   避免出现「有审计动作码但没有对应实现」的反向漂移（这里是有实现无动作码才危险）。
