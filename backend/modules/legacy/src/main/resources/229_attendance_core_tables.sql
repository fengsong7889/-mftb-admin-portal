-- =============================================================================
-- 229_attendance_core_tables.sql
-- 考勤假勤系统（attendance）数据底座：主数据 4 张 + 事实 2 张 + 结论 3 张
--
-- 归属：考勤假勤系统（sys_system.code = attendance）。本文件是
--       backend/src/main/resources/229_attendance_core_tables.sql 的参考副本，
--       实际启动期执行由 AttendanceSchemaMigrationInitializer 读取 classpath 版本，
--       避免 Java 与 SQL 双份漂移（沿用用车域 / RDM 域做法）。
--
-- 幂等：全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE，可重复执行。
--
-- 为什么请假表不在这里（hr_leave_request / hr_leave_balance 保持不动）：
--   请假单据与额度已跑通 OA 审批回调链路，本次只是把菜单从 hr-profile 迁到考勤系统。
--   搬表会牵动流程回调、历史单据与授权，收益只有"名字好看"。考勤侧通过
--   att_day_summary.leave_count / att_monthly_summary.*_days 读取请假结论，
--   单向依赖，不反向写 hr_leave_*。
--
-- 为什么考勤组要单独建成员表 att_group_member：
--   判定"某人当天属于哪个考勤组、按哪个班次"必须有生效区间。只存 scopeText
--   （"部門：門店營運部"）是给人看的快照，无法回答"3 月调过组的人 2 月算哪个组"，
--   历史月份一旦重算就会拿到今天的归属，这是考勤口径最常见的错账来源。
--
-- 为什么排班与打卡都按 work_date 落列（而不是让查询去算）：
--   跨夜班（22:00-06:00）用 punch_at 的日期当考勤日期会算错一天。
--   work_date 在写入时按班次规则定死，后续所有汇总只按 work_date 聚合。
--
-- 约束策略（为什么外键只在新表之间建）：
--   新表之间用 FK 硬约束；跨模块引用 sys_user / sys_department 只建索引不建 FK ——
--   这两张表存在历史软删与遗留数据，加 FK 会让启动失败或存量行读不出来。
--
-- 唯一性与软删：编号、日期归属这类"删了还要能重建"的键，用 STORED 生成列把
--   deleted 折进唯一键（MySQL 唯一索引不约束 NULL），与 biz_vehicle 同法。
--
-- 金额/工时一律 DECIMAL，禁止 float（规范：金额不得用浮点）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 班次（时间基准：上下班时刻、标准工时、休息时段、是否跨天/弹性）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_shift (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    shift_code    VARCHAR(20)  NOT NULL COMMENT '班次编码（SH+2~3位，人工录入，唯一）',
    shift_name    VARCHAR(80)  NOT NULL COMMENT '班次名称，如「門店早班 08:00-17:00」',
    on_time       TIME         NULL COMMENT '上班时间；弹性班次可为空',
    off_time      TIME         NULL COMMENT '下班时间；弹性班次可为空',
    cross_day     TINYINT      NOT NULL DEFAULT 0 COMMENT '下班是否跨天：1=跨天（夜班），决定 work_date 归属',
    work_hours    DECIMAL(4,1) NOT NULL DEFAULT 8 COMMENT '标准工时（小时），加班与缺勤折算的基准',
    rest_start    TIME         NULL COMMENT '休息开始时刻，用于从在勤时长里扣除非工时',
    rest_end      TIME         NULL COMMENT '休息结束时刻',
    flex_flag     TINYINT      NOT NULL DEFAULT 0 COMMENT '是否弹性班次：1=弹性（不绑定上下班时刻）',
    status        VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled；停用后不可被新排班引用',
    remark        VARCHAR(200) NULL COMMENT '备注',
    created_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    updated_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_code   VARCHAR(20) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN shift_code ELSE NULL END) STORED
                  COMMENT '软删感知唯一作用域：班次编码',
    PRIMARY KEY (id),
    UNIQUE KEY uk_shift_active_code (active_code),
    KEY idx_shift_status (status, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤班次（时间基准）';

-- -----------------------------------------------------------------------------
-- 2. 节假日日历（改变应出勤基数与加班倍率，按年度维护）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_holiday (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    holiday_date  DATE         NOT NULL COMMENT '日期',
    holiday_name  VARCHAR(80)  NOT NULL COMMENT '名称，如「國慶節」',
    holiday_type  TINYINT      NOT NULL COMMENT '类型：1=法定節假日 2=調休上班 3=公司假期',
    year_no       INT          NOT NULL COMMENT '所属年度（冗余列，按年批量查询与年度导入去重）',
    status        VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled；停用后该日回归正常工时判定',
    remark        VARCHAR(200) NULL COMMENT '备注',
    created_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    updated_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_date   DATE GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN holiday_date ELSE NULL END) STORED
                  COMMENT '软删感知唯一作用域：一天只能有一条日历结论',
    PRIMARY KEY (id),
    UNIQUE KEY uk_holiday_active_date (active_date),
    KEY idx_holiday_year (year_no, holiday_type, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤节假日日历';

-- -----------------------------------------------------------------------------
-- 3. 考勤组（考勤结论的最小计算单位：范围 + 考勤地 + 班次 + 宽限 + 数据来源）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_group (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    group_no        VARCHAR(32)  NOT NULL COMMENT '考勤组编号（AG+YYYYMM+4位，系统生成，稳定身份）',
    group_name      VARCHAR(80)  NOT NULL COMMENT '考勤组名称',
    group_type      TINYINT      NOT NULL DEFAULT 1 COMMENT '考勤制度：1=固定班制 2=排班制 3=自由工時',
    scope_type      TINYINT      NOT NULL DEFAULT 1 COMMENT '成员范围口径：1=按部門 2=按門店 3=按名單（仅决定管理页录入方式，判定以成员表为准）',
    scope_text      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '成员范围描述快照（列表展示用，不参与判定）',
    work_place      VARCHAR(120) NOT NULL DEFAULT '' COMMENT '考勤地；多门店场景必须显式定义，不能靠部门树推导',
    shift_id        BIGINT       NULL COMMENT '默认班次（固定班制必填；自由工时可为空）',
    late_grace_min  INT          NOT NULL DEFAULT 5 COMMENT '迟到宽限（分钟）',
    early_grace_min INT          NOT NULL DEFAULT 0 COMMENT '早退宽限（分钟）',
    punch_sources   VARCHAR(32)  NOT NULL DEFAULT '1' COMMENT '已开通打卡来源，逗号分隔：1=釘釘同步 2=手工導入',
    status          VARCHAR(16)  NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled；停用后该组成员当日不产生考勤结论',
    remark          VARCHAR(200) NULL COMMENT '备注',
    created_by      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    updated_by      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted         TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_no       VARCHAR(32) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN group_no ELSE NULL END) STORED
                    COMMENT '软删感知唯一作用域：考勤组编号',
    active_name     VARCHAR(80) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN group_name ELSE NULL END) STORED
                    COMMENT '软删感知唯一作用域：考勤组名称（同名两组会让授权与报表口径无法区分）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_group_active_no (active_no),
    UNIQUE KEY uk_group_active_name (active_name),
    KEY idx_group_status (status, deleted),
    CONSTRAINT fk_group_shift FOREIGN KEY (shift_id) REFERENCES att_shift (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤组（考勤结论的最小计算单位）';

-- -----------------------------------------------------------------------------
-- 4. 考勤组成员（带生效区间，历史月份重算的归属基准）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_group_member (
    id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    group_id     BIGINT       NOT NULL COMMENT '所属考勤组 att_group.id',
    user_id      BIGINT       NOT NULL COMMENT '成员 sys_user.id（跨模块引用，只建索引不建 FK）',
    emp_no       VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '工号快照',
    emp_name     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '姓名快照',
    dept_id      BIGINT       NULL COMMENT '部门快照 sys_department.id',
    dept_name    VARCHAR(128) NOT NULL DEFAULT '' COMMENT '部门名称快照：改名不改历史',
    valid_from   DATE         NOT NULL COMMENT '生效起（含）',
    valid_to     DATE         NULL COMMENT '生效止（含）；NULL 表示当前仍生效',
    created_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    updated_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted      TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_scope VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(group_id, '|', user_id, '|', DATE_FORMAT(valid_from, '%Y%m%d')) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：同一组同人同起始日只能有一条',
    PRIMARY KEY (id),
    UNIQUE KEY uk_member_active_scope (active_scope),
    KEY idx_member_user_date (user_id, valid_from, valid_to, deleted),
    KEY idx_member_group_date (group_id, valid_from, valid_to, deleted),
    CONSTRAINT fk_member_group FOREIGN KEY (group_id) REFERENCES att_group (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤组成员（含生效区间）';

-- -----------------------------------------------------------------------------
-- 5. 排班（员工 × 日期 × 班次；排班制考勤组的判定基准）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_schedule (
    id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    group_id     BIGINT      NOT NULL COMMENT '考勤组 att_group.id',
    user_id      BIGINT      NOT NULL COMMENT '被排班人 sys_user.id',
    emp_no       VARCHAR(32) NOT NULL DEFAULT '' COMMENT '工号快照',
    emp_name     VARCHAR(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
    work_date    DATE        NOT NULL COMMENT '考勤日期',
    shift_id     BIGINT      NULL COMMENT '班次 att_shift.id；NULL 表示当日休息',
    source       TINYINT     NOT NULL DEFAULT 1 COMMENT '来源：1=手工排班 2=批量複製 3=導入',
    remark       VARCHAR(200) NULL COMMENT '备注',
    created_by   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建人',
    updated_by   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted      TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_user_date VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(user_id, '|', DATE_FORMAT(work_date, '%Y%m%d')) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：一人一天只能有一条排班结论（多解会让汇总取错班次）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_schedule_active_user_date (active_user_date),
    KEY idx_schedule_group_date (group_id, work_date, deleted),
    KEY idx_schedule_date (work_date, deleted),
    CONSTRAINT fk_schedule_group FOREIGN KEY (group_id) REFERENCES att_group (id),
    CONSTRAINT fk_schedule_shift FOREIGN KEY (shift_id) REFERENCES att_shift (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤排班（员工×日期×班次）';

-- -----------------------------------------------------------------------------
-- 6. 打卡流水（只读账本：原始事实，任何修正都走异常处理 + OA 流程后重算结论）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_punch_log (
    id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    user_id      BIGINT       NOT NULL COMMENT '打卡人 sys_user.id',
    emp_no       VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '工号快照',
    emp_name     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '姓名快照',
    group_id     BIGINT       NULL COMMENT '当时归属考勤组（可空：无组人员只存事实不出结论）',
    work_date    DATE         NOT NULL COMMENT '考勤日期（写入时按班次跨天规则定死，不由 punch_at 日期推导）',
    punch_at     DATETIME     NOT NULL COMMENT '打卡时刻',
    punch_type   TINYINT      NOT NULL COMMENT '卡别：1=上班卡 2=下班卡',
    source       TINYINT      NOT NULL DEFAULT 1 COMMENT '来源：1=釘釘同步 2=手工導入',
    location     VARCHAR(200) NOT NULL DEFAULT '' COMMENT '打卡地点文本',
    raw_ref      VARCHAR(80)  NOT NULL DEFAULT '' COMMENT '外部原始记录 ID（钉钉 record id），用于同步去重与追溯',
    result       TINYINT      NOT NULL DEFAULT 1 COMMENT '判定：1=正常 2=遲到 3=早退 4=外勤 5=無效卡',
    created_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人（同步任务写 system）',
    updated_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted      TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_idem  VARCHAR(64) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(user_id, '|', DATE_FORMAT(punch_at, '%Y%m%d%H%i%s'), '|', source) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：同人同时刻同来源只算一次打卡（同步重跑与重复导入的幂等键）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_punch_active_idem (active_idem),
    KEY idx_punch_user_date (user_id, work_date, deleted),
    KEY idx_punch_date_group (work_date, group_id, deleted),
    KEY idx_punch_raw_ref (raw_ref),
    KEY idx_punch_group_date (group_id, work_date, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤打卡流水（只读账本）';

-- -----------------------------------------------------------------------------
-- 7. 考勤异常（发现异常 + 指派处理方式 + 回显结果；申请动作在 OA，不在此产生单据）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_exception (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    user_id       BIGINT       NOT NULL COMMENT '当事人 sys_user.id',
    emp_no        VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '工号快照',
    emp_name      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '姓名快照',
    dept_id       BIGINT       NULL COMMENT '部门快照',
    dept_name     VARCHAR(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
    group_id      BIGINT       NULL COMMENT '考勤组快照',
    group_name    VARCHAR(80)  NOT NULL DEFAULT '' COMMENT '考勤组名称快照',
    work_date     DATE         NOT NULL COMMENT '考勤日期',
    exception_type TINYINT     NOT NULL COMMENT '类型：1=遲到 2=早退 3=缺卡 4=曠工 5=未排班',
    detail        VARCHAR(200) NOT NULL DEFAULT '' COMMENT '量化描述，如「遲到 23 分鐘」',
    late_minutes  INT          NOT NULL DEFAULT 0 COMMENT '迟到/早退分钟数，供薪酬扣减口径引用',
    status        TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1=待處理 2=已補卡 3=已請假抵扣 4=已加班抵扣 5=已確認',
    flow_no       VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '关联 OA 流程编号（biz_oa_request.flow_no）',
    oa_request_id BIGINT       NULL COMMENT '关联 OA 单据 ID，审批回调按此定位',
    handler       VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '处理人姓名',
    handled_at    DATETIME     NULL COMMENT '处理时间',
    handle_remark VARCHAR(200) NULL COMMENT '处理说明（确认原因/补卡原因）；与判定明细 detail 分列，避免重算覆写与列宽互相挤占',
    created_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    updated_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_user_date_type VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(user_id, '|', DATE_FORMAT(work_date, '%Y%m%d'), '|', exception_type) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：同人同日同类型只留一条（重算时更新而不是追加）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_exception_active_user_date_type (active_user_date_type),
    KEY idx_exception_status (status, work_date, deleted),
    KEY idx_exception_user_date (user_id, work_date, deleted),
    KEY idx_exception_group_date (group_id, work_date, deleted),
    KEY idx_exception_oa (oa_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤异常与处理状态';

-- -----------------------------------------------------------------------------
-- 8. 考勤日报（按 日期 × 考勤组 的计算结论，可重算；已冻结月份不回溯）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_day_summary (
    id             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    work_date      DATE         NOT NULL COMMENT '考勤日期',
    group_id       BIGINT       NOT NULL COMMENT '考勤组 att_group.id',
    group_name     VARCHAR(80)  NOT NULL DEFAULT '' COMMENT '考勤组名称快照',
    dept_id        BIGINT       NULL COMMENT '部门快照（按组内主部门落列，供分部门统计）',
    dept_name      VARCHAR(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
    should_count   INT          NOT NULL DEFAULT 0 COMMENT '應出勤人数（排班 ∪ 成员，扣除休息与未排班）',
    actual_count   INT          NOT NULL DEFAULT 0 COMMENT '實出勤人数',
    late_count     INT          NOT NULL DEFAULT 0 COMMENT '遲到人次',
    early_count    INT          NOT NULL DEFAULT 0 COMMENT '早退人次',
    missing_count  INT          NOT NULL DEFAULT 0 COMMENT '缺卡人次',
    absent_count   INT          NOT NULL DEFAULT 0 COMMENT '曠工人次',
    leave_count    INT          NOT NULL DEFAULT 0 COMMENT '請假人次（读 hr_leave_request 审批通过结论）',
    overtime_hours DECIMAL(7,1) NOT NULL DEFAULT 0 COMMENT '加班工时合计（小时）',
    attend_rate    DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '出勤率% = 实出勤 / 应出勤',
    calculated_at  DATETIME     NULL COMMENT '本次汇总生成时间（重算的审计凭据）',
    created_by     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    updated_by     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted        TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_date_group VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(DATE_FORMAT(work_date, '%Y%m%d'), '|', group_id) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：一天一组一条结论（重算走 UPSERT，不允许长出第二行）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_day_active_date_group (active_date_group),
    KEY idx_day_date (work_date, deleted),
    KEY idx_day_dept (dept_id, work_date, deleted),
    CONSTRAINT fk_day_group FOREIGN KEY (group_id) REFERENCES att_group (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤日报（日期×考勤组结论）';

-- -----------------------------------------------------------------------------
-- 9. 月度考勤汇总（薪酬核算的取数出口；draft → frozen → synced 严格单向）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS att_monthly_summary (
    id                   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    stat_month           CHAR(7)      NOT NULL COMMENT '所属月份 YYYY-MM',
    batch_no             VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '批次号（AT+YYYYMM+4位），冻结时生成，供薪酬侧对账引用',
    user_id              BIGINT       NOT NULL COMMENT '员工 sys_user.id',
    emp_no               VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '工号快照',
    emp_name             VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '姓名快照',
    dept_id              BIGINT       NULL COMMENT '部门快照',
    dept_name            VARCHAR(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
    group_id             BIGINT       NULL COMMENT '考勤组快照',
    group_name           VARCHAR(80)  NOT NULL DEFAULT '' COMMENT '考勤组名称快照',
    should_days          DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '應出勤天数',
    actual_days          DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '實出勤天数',
    late_times           INT          NOT NULL DEFAULT 0 COMMENT '遲到次数',
    late_minutes         INT          NOT NULL DEFAULT 0 COMMENT '遲到分钟合计',
    early_times          INT          NOT NULL DEFAULT 0 COMMENT '早退次数',
    missing_times        INT          NOT NULL DEFAULT 0 COMMENT '缺卡次数',
    absent_days          DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '曠工天数',
    annual_days          DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '年假天数',
    sick_days            DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '病假天数',
    personal_days        DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '事假天数',
    workday_ot_hours     DECIMAL(7,1) NOT NULL DEFAULT 0 COMMENT '工作日加班工时',
    restday_ot_hours     DECIMAL(7,1) NOT NULL DEFAULT 0 COMMENT '休息日加班工时',
    holiday_ot_hours     DECIMAL(7,1) NOT NULL DEFAULT 0 COMMENT '法定節假日加班工时',
    attend_rate          DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '出勤率%',
    status               VARCHAR(16)  NOT NULL DEFAULT 'draft' COMMENT '状态：draft=待確認 frozen=已凍結 synced=已同步薪酬',
    frozen_by            VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '冻结人',
    frozen_at            DATETIME     NULL COMMENT '冻结时间',
    synced_at            DATETIME     NULL COMMENT '同步薪酬时间',
    created_by           VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    updated_by           VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted              TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_month_user    VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(stat_month, '|', user_id) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：一人一月一条（重复生成会让薪酬重复取数）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_monthly_active_month_user (active_month_user),
    KEY idx_monthly_status (stat_month, status, deleted),
    KEY idx_monthly_dept (dept_id, stat_month, deleted),
    KEY idx_monthly_batch (batch_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='月度考勤汇总（薪酬取数出口）';

-- -----------------------------------------------------------------------------
-- 10. 编号规则（与既有规则同一登记口径；规则菜单里能查到依据）
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO sys_biz_seq_rule
    (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('attendance_group', '考勤組編號', '考勤假勤-考勤組', 'AG', 'YYYYMM', 4, 1, 1,
        '{prefix} + YYYYMM + {n}位自增序號'),
       ('attendance_monthly_batch', '月度考勤匯總批次號', '考勤假勤-月度匯總', 'AT', 'YYYYMM', 4, 1, 1,
        '{prefix} + YYYYMM + {n}位自增序號；凍結时生成，薪酬側按此對賬');

-- -----------------------------------------------------------------------------
-- 验证
-- -----------------------------------------------------------------------------
-- SELECT TABLE_NAME, TABLE_COMMENT FROM INFORMATION_SCHEMA.TABLES
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'att\_%' ORDER BY TABLE_NAME;
-- SELECT rule_key, prefix, date_format, status FROM sys_biz_seq_rule WHERE rule_key LIKE 'attendance%';

-- =============================================================================
-- 回滚（按需手工执行，禁止随迁移自动跑；新表无历史数据，回滚不影响既有表）
-- =============================================================================
-- DROP TABLE IF EXISTS att_monthly_summary;
-- DROP TABLE IF EXISTS att_day_summary;
-- DROP TABLE IF EXISTS att_exception;
-- DROP TABLE IF EXISTS att_punch_log;
-- DROP TABLE IF EXISTS att_schedule;
-- DROP TABLE IF EXISTS att_group_member;
-- DROP TABLE IF EXISTS att_group;
-- DROP TABLE IF EXISTS att_holiday;
-- DROP TABLE IF EXISTS att_shift;
-- DELETE FROM sys_biz_seq_rule WHERE rule_key IN ('attendance_group', 'attendance_monthly_batch');
-- DELETE FROM sys_schema_version WHERE version_key = 'attendance:schema:v1.0';
