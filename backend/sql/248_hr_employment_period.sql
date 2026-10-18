-- 248: 雇佣期间分层（方案 §7.1「增加独立员工主档和雇佣期间实体」）—— P4 双轨第一阶段
-- 背景：员工身份此前只由 sys_user 承载，任职事实同时存在两份（sys_user 任职快照 + emp_position_record），
--       「当前部门/职位/入职日」在不同页面给出不同答案；而「第几次雇佣」「本次任职时长起点」这种
--       雇佣期间概念在库里根本没有落脚的地方（离职后再入职的历史会被连成一段连续任职）。
-- 双轨口径（本迁移刻意不做的事）：
--   ① 不回填 hr_employment_period：雇佣期间只能由任职事实派生后由 HR 显式确认登记（sync 端点），
--      绝不把 sys_user.created_at 批量改认成真实入职日（方案 §7.1 的业务门禁）。
--   ② 不切主读路径：存量列表/详情继续读 sys_user 投影 + as-of 任职解析，本表先旁路积累。
--   ③ 新列全部可空：emp_position_record 的稳定 ID 是「增量归一」，历史名称快照一律保留。
-- 说明：本文件为一次性参考文档；实际幂等迁移与后置校验由 HrEmploymentPeriodInitializer
--       （hr:employment-period:v1.0，@Order(32)）执行，并登记 catalog.json + ContractRegistry。

CREATE TABLE IF NOT EXISTS hr_employment_period (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id             BIGINT       NOT NULL COMMENT '员工身份锚点(sys_user.id)，允许一人为多段雇佣',
    period_seq          INT          NOT NULL COMMENT '第几次雇佣，从1递增；重新入职开新段',
    employer_company    VARCHAR(128) DEFAULT NULL COMMENT '雇主法人名称快照',
    employer_company_id BIGINT       DEFAULT NULL COMMENT '雇主法人字典ID(sys_hr_dict EMPLOYER_COMPANY)',
    work_location       VARCHAR(128) DEFAULT NULL COMMENT '工作地点名称快照',
    work_location_id    BIGINT       DEFAULT NULL COMMENT '工作地点字典ID(sys_hr_dict WORK_LOCATION)',
    employee_category   VARCHAR(64)  DEFAULT NULL COMMENT '人员类别(正式/实习/派遣/外包)',
    start_date          DATE         DEFAULT NULL COMMENT '真实入职日；来源见 start_date_source',
    start_date_source   VARCHAR(24)  NOT NULL DEFAULT 'POSITION_RECORD'
                        COMMENT '入职日来源: POSITION_RECORD任职事实 / MANUAL人工确认 / UNVERIFIED未核实',
    probation_end_date  DATE         DEFAULT NULL COMMENT '试用期结束日',
    regular_date        DATE         DEFAULT NULL COMMENT '转正日期',
    end_date            DATE         DEFAULT NULL COMMENT '雇佣结束日(离职生效日)',
    end_reason          VARCHAR(255) DEFAULT NULL COMMENT '雇佣结束原因快照',
    status              VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE在职段 / ENDED已结束段',
    source_req_no       VARCHAR(32)  DEFAULT NULL COMMENT '产生本段的单据号(可追溯)',
    created_by          VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by          VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted             TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    -- 唯一键把 deleted 折进生成列（与考勤域同一范式）：软删后重新登记同一 (user_id, period_seq) 不冲突
    active_scope        VARCHAR(40) GENERATED ALWAYS AS (
                            CASE WHEN deleted = 0 THEN CONCAT(user_id, '-', period_seq) ELSE NULL END) STORED,
    UNIQUE KEY uk_period_active_scope (active_scope),
    KEY idx_period_user_status (user_id, status),
    CONSTRAINT ck_period_status CHECK (status IN ('ACTIVE', 'ENDED')),
    CONSTRAINT ck_period_start_source CHECK (start_date_source IN ('POSITION_RECORD', 'MANUAL', 'UNVERIFIED')),
    -- 在职段不许带结束日：未来生效的离职只能登记任务，不能提前把今天这段关掉
    CONSTRAINT ck_period_active_no_end CHECK (status <> 'ACTIVE' OR end_date IS NULL)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='雇佣期间(一人多段，重入职新开段)';

-- 任职记录稳定 ID 化（方案 §7.1「补部门/职位/上级/导师/法人/地点 ID，保留历史名称快照」）
ALTER TABLE emp_position_record ADD COLUMN employment_period_id BIGINT DEFAULT NULL COMMENT '所属雇佣期间ID(hr_employment_period.id)';
ALTER TABLE emp_position_record ADD COLUMN dept_id             BIGINT DEFAULT NULL COMMENT '服务部门ID(sys_department.id)，名称快照仍留在 service_dept';
ALTER TABLE emp_position_record ADD COLUMN position_id         BIGINT DEFAULT NULL COMMENT '职位ID(sys_position.id)，名称快照留在 position_name';
ALTER TABLE emp_position_record ADD COLUMN employer_company_id BIGINT DEFAULT NULL COMMENT '雇主法人字典ID';
ALTER TABLE emp_position_record ADD COLUMN work_location_id    BIGINT DEFAULT NULL COMMENT '工作地点字典ID';
ALTER TABLE emp_position_record ADD COLUMN manager_user_id     BIGINT DEFAULT NULL COMMENT '直属上级员工ID(sys_user.id)';
ALTER TABLE emp_position_record ADD COLUMN mentor_user_id      BIGINT DEFAULT NULL COMMENT '导师员工ID(sys_user.id)';

-- 名称 → 稳定 ID 的回填只在「同名唯一」时执行（见 Initializer#backfillStableIds）：
-- 同名部门/岗位在树里可能有多条，猜中一次的代价是把异动挂到别人的部门上，宁可留 NULL 由差异报告暴露。
