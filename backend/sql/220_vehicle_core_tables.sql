-- =============================================================================
-- 220_vehicle_core_tables.sql
-- 用车管理 B1 底座：车辆运行档案 + 用车单 + 行程 + 驾驶资格 + 授权关系 + 审计事件
--
-- 归属：物資管理（EAM）域。本文件是 classpath 资源
--       backend/src/main/resources/220_vehicle_core_tables.sql 的参考副本，
--       实际启动期执行由 VehicleSchemaMigrationInitializer 读取 classpath 版本，
--       避免 Java 与 SQL 双份漂移（沿用 RDM 域做法）。
--
-- 幂等：全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE，可重复执行。
--
-- 为什么是 7 张表而不是塞进 biz_eam_asset / biz_eam_claim：
--   1. 资产台账描述"实物归属"（谁长期保管），用车描述"时段资源占用"（同一辆车
--      8-10 点给 A、10-12 点给 B）。把时段调度塞进 claim/borrow 会污染资产台账语义；
--   2. 车辆需要里程、起止时段、实际驾驶人与用车人分离、直接登记原因等字段，
--      与通用资产领用字段集几乎不重叠；
--   3. 但车辆确实是资产，故保留 eam_asset_id 弱关联，购置/入库/报废仍走 EAM。
--
-- 约束策略（为什么外键只在新表之间建）：
--   新表之间用 FK 硬约束（无历史脏数据风险）；跨模块引用 sys_user / sys_department /
--   biz_eam_asset 只建索引不建 FK —— 这三张表存在历史软删与遗留数据，加 FK 会让
--   整个应用启动失败或存量行无法读取，风险大于收益。
--
-- 唯一性与软删：车牌、单号、关联资产都要在"逻辑删除后仍可重新登记"的前提下保持唯一，
--   因此用 STORED 生成列把 deleted 折进唯一键（MySQL 唯一索引不约束 NULL），
--   与 biz_eam_inventory_item.unique_scope_asset 同法。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 车辆运行档案
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle (
    id                    BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    vehicle_code          VARCHAR(32)  NOT NULL COMMENT '车辆编号（VH+6位，系统生成，稳定身份）',
    plate_no              VARCHAR(20)  NOT NULL COMMENT '当前主车牌（换牌留痕，行程表另存发生时时车牌）',
    register_region       VARCHAR(20)  NOT NULL DEFAULT '澳門' COMMENT '车牌登记地区：澳门/中国内地/香港',
    vehicle_type          VARCHAR(32)  NOT NULL COMMENT '车型：轿车/SUV/商务车/货车/新能源车',
    vin                   VARCHAR(32)  NULL COMMENT 'VIN/底盘号，可选，不作业务身份',
    seat_count            INT          NOT NULL COMMENT '核定载客人数（含驾驶人）',
    current_odometer      DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '当前里程(km)，取上次确认的结束里程',
    status                VARCHAR(16)  NOT NULL DEFAULT 'normal' COMMENT '运行状态：normal/repairing/suspended/retired',
    allow_direct_register TINYINT      NOT NULL DEFAULT 0 COMMENT '是否允许授权直接登记：1=允许 0=仅审批用车',
    insurance_valid_until DATE         NULL COMMENT '保险有效期止；未录入或过期禁止新出车',
    inspection_valid_until DATE        NULL COMMENT '检验（年检）有效期止；未录入或过期禁止新出车',
    verify_by             VARCHAR(64)  NULL COMMENT '合规核验人',
    verify_at             DATETIME     NULL COMMENT '合规核验时间',
    owner_company_id      BIGINT       NULL COMMENT '所属法人主体（sys_purchase_company.id），与公司品牌是两个独立维度',
    owner_company_name    VARCHAR(128) NOT NULL DEFAULT '' COMMENT '所属法人名称快照：不因字典改名而改写历史',
    company_brand         TINYINT      NOT NULL DEFAULT 1 COMMENT '公司品牌：1=闪蜂 2=mFood',
    manage_dept_id        BIGINT       NOT NULL COMMENT '管理部门（sys_department.id）',
    manage_dept_name      VARCHAR(128) NOT NULL DEFAULT '' COMMENT '管理部门名称快照',
    eam_asset_id          BIGINT       NULL COMMENT '关联 EAM 资产 ID（可空；关联后资产编号/购置信息以 EAM 为准）',
    eam_asset_no          VARCHAR(40)  NULL COMMENT '关联 EAM 资产编号快照（展示用，真值以 EAM 为准）',
    remark                VARCHAR(500) NULL COMMENT '备注',
    version               BIGINT       NOT NULL DEFAULT 0 COMMENT '乐观锁版本，数据库端递增',
    created_by            VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by            VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted               TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_plate          VARCHAR(64) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(register_region, '|', plate_no) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：登记地区+车牌',
    active_code           VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN vehicle_code ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：车辆编号',
    active_asset          VARCHAR(32) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 AND eam_asset_id IS NOT NULL THEN CAST(eam_asset_id AS CHAR) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：一台资产只能对应一份车辆档案',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_active_plate (active_plate),
    UNIQUE KEY uk_vehicle_active_code (active_code),
    UNIQUE KEY uk_vehicle_active_asset (active_asset),
    KEY idx_vehicle_status (status),
    KEY idx_vehicle_manage_dept (manage_dept_id),
    KEY idx_vehicle_insurance (insurance_valid_until),
    KEY idx_vehicle_inspection (inspection_valid_until),
    CONSTRAINT ck_vehicle_status CHECK (status IN ('normal','repairing','suspended','retired')),
    CONSTRAINT ck_vehicle_seat CHECK (seat_count > 0 AND seat_count <= 60),
    CONSTRAINT ck_vehicle_odometer CHECK (current_odometer >= 0),
    CONSTRAINT ck_vehicle_brand CHECK (company_brand IN (1,2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='车辆运行档案（EAM 车辆域，与资产台账弱关联）';

-- -----------------------------------------------------------------------------
-- 2. 用车单（申请 + 安排 + 审批引用 + 业务状态）
--    审批结论与业务状态分列：直接登记/补录不得伪装成"审批通过"
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_use (
    id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    use_no            VARCHAR(32)  NOT NULL COMMENT '用车单号（审批=YC / 直接登记=ZC / 补录=BL + YYYYMMDD + 4位）',
    source            VARCHAR(20)  NOT NULL COMMENT '数据来源：oa_approval/direct_register/backfill',
    approval_outcome  VARCHAR(20)  NOT NULL COMMENT '审批结论：not_submitted/approving/approved/rejected/cancelled/direct/not_applicable',
    status            VARCHAR(20)  NOT NULL COMMENT '业务状态：draft/approving/to_assign/to_depart/in_use/to_confirm/completed/rejected/cancelled',
    flow_no           VARCHAR(32)  NULL COMMENT '关联 OA 流程编号（审批用车才有）',
    applicant_id      BIGINT       NOT NULL COMMENT '申请人 sys_user.id（服务端从 JWT 取，不信前端传值）',
    applicant_emp_no  VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '申请人工号快照',
    applicant_name    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '申请人姓名快照',
    actual_user_name  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '实际用车人（可与申请人不同，代登记场景必填）',
    department_id     BIGINT       NOT NULL COMMENT '用车部门 sys_department.id',
    department_name   VARCHAR(128) NOT NULL DEFAULT '' COMMENT '用车部门名称快照',
    intent_vehicle_id BIGINT       NULL COMMENT '意向车辆（安排前不代表预约成功）',
    intent_plate_no   VARCHAR(20)  NULL COMMENT '意向车牌快照',
    final_vehicle_id  BIGINT       NULL COMMENT '最终车辆；安排成功才形成有效占用',
    final_plate_no    VARCHAR(20)  NULL COMMENT '最终车牌快照',
    driver_id         BIGINT       NULL COMMENT '实际驾驶人 sys_user.id（与申请人、用车人分列）',
    driver_emp_no     VARCHAR(32)  NULL COMMENT '驾驶人工号快照',
    driver_name       VARCHAR(64)  NULL COMMENT '驾驶人姓名快照',
    driving_mode      VARCHAR(20)  NOT NULL COMMENT '驾驶方式：self/company_driver',
    passenger_count   INT          NOT NULL DEFAULT 1 COMMENT '人数（含驾驶人）',
    purpose           VARCHAR(200) NOT NULL COMMENT '用车事由',
    origin            VARCHAR(120) NOT NULL DEFAULT '' COMMENT '出发地',
    destination       VARCHAR(120) NOT NULL DEFAULT '' COMMENT '目的地',
    planned_start     DATETIME     NOT NULL COMMENT '计划开始时间',
    planned_end       DATETIME     NOT NULL COMMENT '计划结束时间（超时只标记，不倒改）',
    assign_by_id      BIGINT       NULL COMMENT '安排人 sys_user.id',
    assign_by_name    VARCHAR(64)  NULL COMMENT '安排人姓名',
    assign_at         DATETIME     NULL COMMENT '安排时间',
    direct_reason     VARCHAR(300) NULL COMMENT '授权直接登记原因（source=direct_register 时必填）',
    conflict_note     VARCHAR(300) NULL COMMENT '冲突/改派说明（如受前车晚归影响）',
    prev_use_id       BIGINT       NULL COMMENT '重提来源单（驳回/取消后复制重提，保留关联不改写原审批历史）',
    backfill_entry_at DATETIME     NULL COMMENT '补录的"系统登记时间"，与 planned/actual 时间分离',
    request_key       VARCHAR(64)  NULL COMMENT '幂等键（同一操作人 + 同一键只生效一次）',
    request_hash      VARCHAR(64)  NULL COMMENT '请求摘要（同键不同内容要被拒绝）',
    version           INT          NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    created_by        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted           TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_use_no     VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN use_no ELSE NULL END) STORED COMMENT '软删感知唯一作用域：单号',
    active_reservation_vehicle VARCHAR(80) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 AND status IN ('to_depart','in_use','to_confirm') AND final_vehicle_id IS NOT NULL
             THEN CONCAT('V', final_vehicle_id, '|', DATE_FORMAT(planned_start, '%Y%m%d%H%i'),
                         '|', DATE_FORMAT(planned_end, '%Y%m%d%H%i'))
             ELSE NULL END) STORED
        COMMENT '完全相同占用窗口的重复预约兜底（区间重叠仍需服务端锁内当前读判定）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_use_no (active_use_no),
    UNIQUE KEY uk_vehicle_use_request (applicant_id, request_key),
    -- 重复预约兜底：只能挡“完全相同窗口”，区间重叠仍由服务层锁内当前读判定
    UNIQUE KEY uk_vehicle_use_reservation (active_reservation_vehicle),
    KEY idx_vehicle_use_status (status, planned_start),
    KEY idx_vehicle_use_vehicle (final_vehicle_id, status),
    KEY idx_vehicle_use_driver (driver_id, status),
    KEY idx_vehicle_use_dept (department_id, planned_start),
    KEY idx_vehicle_use_flow (flow_no),
    KEY idx_vehicle_use_backfill (source, status),
    CONSTRAINT fk_vehicle_use_intent FOREIGN KEY (intent_vehicle_id) REFERENCES biz_vehicle (id),
    CONSTRAINT fk_vehicle_use_final FOREIGN KEY (final_vehicle_id) REFERENCES biz_vehicle (id),
    CONSTRAINT fk_vehicle_use_prev FOREIGN KEY (prev_use_id) REFERENCES biz_vehicle_use (id),
    CONSTRAINT ck_vehicle_use_source CHECK (source IN ('oa_approval','direct_register','backfill')),
    CONSTRAINT ck_vehicle_use_approval CHECK (approval_outcome IN
        ('not_submitted','approving','approved','rejected','cancelled','direct','not_applicable')),
    CONSTRAINT ck_vehicle_use_status CHECK (status IN
        ('draft','approving','to_assign','to_depart','in_use','to_confirm','completed','rejected','cancelled')),
    CONSTRAINT ck_vehicle_use_mode CHECK (driving_mode IN ('self','company_driver')),
    CONSTRAINT ck_vehicle_use_window CHECK (planned_end > planned_start),
    CONSTRAINT ck_vehicle_use_passenger CHECK (passenger_count > 0),
    -- 语义一致性：直接登记与补录都必须携带审批结论与来源的对应关系，防止用来源标记审批通过
    CONSTRAINT ck_vehicle_use_direct_reason CHECK (
        source <> 'direct_register' OR (approval_outcome = 'direct' AND direct_reason IS NOT NULL)),
    CONSTRAINT ck_vehicle_use_backfill_na CHECK (
        source <> 'backfill' OR approval_outcome = 'not_applicable'),
    CONSTRAINT ck_vehicle_use_oa_source CHECK (
        source <> 'oa_approval' OR approval_outcome IN ('not_submitted','approving','approved','rejected','cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用车单（申请/安排/审批引用/业务状态）';

-- -----------------------------------------------------------------------------
-- 3. 行程（实际发生的事实，一期与用车单 1:1）
--    出车与归还写同一行，避免"出车表/还车表"两份事实
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_trip (
    id                   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    use_id               BIGINT       NOT NULL COMMENT '用车单 ID',
    vehicle_id           BIGINT       NOT NULL COMMENT '车辆 ID',
    vehicle_plate_no     VARCHAR(20)  NOT NULL COMMENT '行程发生时的车牌快照（换牌不改历史）',
    driver_id            BIGINT       NOT NULL COMMENT '实际驾驶人 sys_user.id',
    driver_emp_no        VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '驾驶人工号快照',
    driver_name          VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '驾驶人姓名快照',
    status               VARCHAR(20)  NOT NULL COMMENT '行程状态：departed/returned/confirmed/pending_check/disputed',
    depart_at            DATETIME     NULL COMMENT '实际出车时间',
    start_odometer       DECIMAL(12,2) NULL COMMENT '起始里程',
    key_received         TINYINT      NULL COMMENT '钥匙已领取：1=是 0=否',
    condition_ok         TINYINT      NULL COMMENT '出发前车况已确认：1=是 0=否',
    depart_by_id         BIGINT       NULL COMMENT '出车登记人 sys_user.id',
    depart_by_name       VARCHAR(64)  NULL COMMENT '出车登记人姓名',
    depart_registered_at DATETIME     NULL COMMENT '出车的系统登记时间',
    return_at            DATETIME     NULL COMMENT '实际归还时间',
    end_odometer         DECIMAL(12,2) NULL COMMENT '结束里程',
    return_place         VARCHAR(120) NULL COMMENT '归还地点',
    key_returned         TINYINT      NULL COMMENT '钥匙已交还：1=是 0=否',
    vehicle_condition    VARCHAR(16)  NULL COMMENT '归还车况：normal/abnormal',
    exception_note       VARCHAR(500) NULL COMMENT '异常说明（车况异常/晚归/里程异常时必填）',
    confirm_by_id        BIGINT       NULL COMMENT '归还确认人 sys_user.id',
    confirm_by_name      VARCHAR(64)  NULL COMMENT '归还确认人姓名',
    confirm_at           DATETIME     NULL COMMENT '归还确认时间（确认后才计入正式台账）',
    mileage              DECIMAL(10,2) NULL COMMENT '行驶里程 = 结束 - 起始，由后端计算',
    duration_hours       DECIMAL(8,2)  NULL COMMENT '用车时长 = 实际归还 - 实际出车（小时），不用申请时段代替',
    flags                VARCHAR(200) NULL COMMENT '附加标识，逗号分隔：overdue/backfill/corrected/mileage_anomaly/key_pending/condition_abnormal',
    -- 补录行程的“系统录入时间”：与 depart_at/return_at 分离，否则事后补录看起来像当时登记
    backfill_entry_at    DATETIME     NULL COMMENT '事后补录时的系统登记时间；正常流程为 NULL',
    version              INT          NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    created_by           VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by           VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted              TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_use           BIGINT GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN use_id ELSE NULL END) STORED
        COMMENT '一期一单一行程的唯一作用域',
    active_vehicle_occupy   VARCHAR(32) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 AND status IN ('departed','returned') THEN CONCAT('V', vehicle_id) ELSE NULL END) STORED
        COMMENT '车辆实际占用唯一约束：未确认归还前同车不得有第二条活动行程',
    active_driver_occupy    VARCHAR(32) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 AND status IN ('departed','returned') THEN CONCAT('D', driver_id) ELSE NULL END) STORED
        COMMENT '驾驶人实际占用唯一约束：同驾驶人不得同时执行两段行程',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_trip_use (active_use),
    UNIQUE KEY uk_vehicle_trip_active_vehicle (active_vehicle_occupy),
    UNIQUE KEY uk_vehicle_trip_active_driver (active_driver_occupy),
    KEY idx_vehicle_trip_vehicle_time (vehicle_id, depart_at),
    KEY idx_vehicle_trip_driver_time (driver_id, depart_at),
    KEY idx_vehicle_trip_status (status),
    CONSTRAINT fk_vehicle_trip_use FOREIGN KEY (use_id) REFERENCES biz_vehicle_use (id),
    CONSTRAINT fk_vehicle_trip_vehicle FOREIGN KEY (vehicle_id) REFERENCES biz_vehicle (id),
    CONSTRAINT ck_vehicle_trip_status CHECK (status IN ('departed','returned','confirmed','pending_check','disputed')),
    CONSTRAINT ck_vehicle_trip_condition CHECK (vehicle_condition IS NULL OR vehicle_condition IN ('normal','abnormal')),
    CONSTRAINT ck_vehicle_trip_odometer CHECK (
        (start_odometer IS NULL OR start_odometer >= 0) AND (end_odometer IS NULL OR end_odometer >= 0)),
    CONSTRAINT ck_vehicle_trip_mileage CHECK (mileage IS NULL OR mileage >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用车行程（实际出还车与归还核对，与用车单 1:1）';

-- -----------------------------------------------------------------------------
-- 4. 内部员工驾驶资格（最小核验记录）
--    不收集完整驾驶证号与证件照片：一期只需"能不能开、什么时候失效"
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_driver_qualification (
    id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    user_id      BIGINT      NOT NULL COMMENT '员工 sys_user.id（人员关联用稳定 ID，姓名只作展示）',
    emp_no       VARCHAR(32) NOT NULL DEFAULT '' COMMENT '工号快照',
    emp_name     VARCHAR(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
    region       VARCHAR(20) NOT NULL COMMENT '驾照适用地区：澳門/中國內地/香港',
    license_class VARCHAR(16) NOT NULL COMMENT '准驾范围：A1/B2/C1 …',
    valid_until  DATE        NOT NULL COMMENT '有效期至；过期按失效处理，禁止新出车',
    result       VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '核验结果：verified/pending/expired',
    verified_by  VARCHAR(64) NULL COMMENT '核验人',
    verified_at  DATETIME    NULL COMMENT '核验时间',
    remark       VARCHAR(300) NULL COMMENT '备注',
    created_by   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建人',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted      TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_key   VARCHAR(52) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(user_id, '|', region) ELSE NULL END) STORED
        COMMENT '同一员工在同一地区只保留一条现行资格',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_qual_active (active_key),
    KEY idx_vehicle_qual_user (user_id),
    KEY idx_vehicle_qual_valid (valid_until),
    CONSTRAINT ck_vehicle_qual_region CHECK (region IN ('澳門','中國內地','香港')),
    CONSTRAINT ck_vehicle_qual_result CHECK (result IN ('verified','pending','expired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='内部员工驾驶资格最小核验记录';

-- -----------------------------------------------------------------------------
-- 5. 车辆可使用部门（显式授权，一期不隐式继承子部门）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_use_department (
    id         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    vehicle_id BIGINT      NOT NULL COMMENT '车辆 ID',
    dept_id    BIGINT      NOT NULL COMMENT '被授权部门 sys_department.id',
    dept_name  VARCHAR(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
    created_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '授权人',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
    deleted    TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_key VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(vehicle_id, '|', dept_id) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_dept_active (active_key),
    KEY idx_vehicle_dept_dept (dept_id),
    CONSTRAINT fk_vehicle_dept_vehicle FOREIGN KEY (vehicle_id) REFERENCES biz_vehicle (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='车辆可使用部门授权关系';

-- -----------------------------------------------------------------------------
-- 6. 车辆授权管理人员（管理范围按「车辆×人」判定，不沿用商家集团数据权限）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_manager (
    id         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    vehicle_id BIGINT      NOT NULL COMMENT '车辆 ID',
    user_id    BIGINT      NOT NULL COMMENT '管理人员 sys_user.id',
    emp_no     VARCHAR(32) NOT NULL DEFAULT '' COMMENT '工号快照',
    emp_name   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '姓名快照',
    level      VARCHAR(16) NOT NULL DEFAULT 'manage' COMMENT '权限级别：manage=可办理 view=仅可查阅',
    created_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '授权人',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
    deleted    TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_key VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(vehicle_id, '|', user_id) ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_manager_active (active_key),
    KEY idx_vehicle_manager_user (user_id, level),
    CONSTRAINT fk_vehicle_manager_vehicle FOREIGN KEY (vehicle_id) REFERENCES biz_vehicle (id),
    CONSTRAINT ck_vehicle_manager_level CHECK (level IN ('manage','view'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='车辆授权管理人员关系';

-- -----------------------------------------------------------------------------
-- 7. 用车审计事件（只追加：授权变更、安排、出还车、补录、更正）
--    业务页面不提供删除/修改入口，故不设 deleted/updated 列
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_use_event (
    id              BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    use_id          BIGINT      NULL COMMENT '用车单 ID（车辆级配置变更为空）',
    vehicle_id      BIGINT      NULL COMMENT '车辆 ID',
    target_no       VARCHAR(40) NOT NULL DEFAULT '' COMMENT '对象编号快照（单号或车牌），便于跨表追溯',
    action          VARCHAR(32) NOT NULL COMMENT '动作：apply/approve_snapshot/assign/direct_register/depart/return/confirm/backfill/correct/config_change/qual_verify',
    before_json     TEXT        NULL COMMENT '变更前值 JSON（更正类必填）',
    after_json      TEXT        NULL COMMENT '变更后值 JSON',
    reason          VARCHAR(500) NULL COMMENT '原因/说明（直接登记原因、更正理由、补录说明）',
    operator_id     BIGINT      NULL COMMENT '操作人 sys_user.id',
    operator_name   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '操作人姓名',
    operator_emp_no VARCHAR(32) NOT NULL DEFAULT '' COMMENT '操作人工号',
    request_key     VARCHAR(64) NULL COMMENT '幂等键（重复回调只留一条事件）',
    occurred_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '事件发生时间',
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_event_request (operator_id, request_key),
    KEY idx_vehicle_event_use (use_id, id),
    KEY idx_vehicle_event_vehicle (vehicle_id, id),
    KEY idx_vehicle_event_action (action, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用车审计事件（追加式，不可被业务页面删改）';

-- -----------------------------------------------------------------------------
-- 8. 业务编号规则（接入 BizSeqService，不按记录数生成）
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, prefix, date_format, seq_length, seq_start, status)
VALUES ('vehicle', '车辆编号', 'VH', '', 6, 1, 1),
       ('vehicle_use', '用车单号', 'YC', 'YYYYMMDD', 4, 1, 1),
       ('vehicle_use_direct', '直接登记用车单号', 'ZC', 'YYYYMMDD', 4, 1, 1),
       ('vehicle_use_backfill', '补录用车单号', 'BL', 'YYYYMMDD', 4, 1, 1);
