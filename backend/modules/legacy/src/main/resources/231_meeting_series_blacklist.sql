-- =============================================================================
-- 231: 会议管理 M2 —— 周期会议系列 + 预约黑名单（含 cancel_scope 补列）
-- 参考文档副本；实际幂等真值由 MeetingSeriesSchemaInitializer + catalog.json 保证。
-- 方言：MySQL 8.x（禁止 ADD COLUMN IF NOT EXISTS；CHECK 与 STORED 生成列可用）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 周期会议主表：创建时一次性物化全部实例，实例写 series_id + series_seq
--    为什么不虚拟化展开：周期会议的"这一次"要能单独签到、单独取消、单独通知，
--    虚拟展开就得在读取时算出实例状态，而"改系列只影响未来实例""仅此次及以后"
--    这两种语义都需要有一份已落库的事实可改；虚拟化会让历史实例随模板一起漂移。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_series (
    id                BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    series_no         VARCHAR(32)   NOT NULL COMMENT '系列編號：MS + YYYYMMDD + 4位',
    freq              VARCHAR(16)   NOT NULL COMMENT '频次：daily/weekly',
    interval_n        INT           NOT NULL DEFAULT 1 COMMENT '间隔数：每 N 天/周',
    by_weekday        VARCHAR(32)   NOT NULL DEFAULT '' COMMENT 'weekly 生效的星期集合，逗号包裹 ,1,3,5,（1=周一）',
    time_start        TIME          NOT NULL COMMENT '每日开始时间',
    time_end          TIME          NOT NULL COMMENT '每日结束时间（左闭右开）',
    start_date        DATE          NOT NULL COMMENT '首次生效日期',
    end_date          DATE          NULL COMMENT '最后生效日期（与 occurrence_limit 双上限，任一先到即止）',
    occurrence_limit  INT           NOT NULL DEFAULT 60 COMMENT '计划生成实例上限（硬上限 100，防配置失误生成万场会）',
    generated_count   INT           NOT NULL DEFAULT 0 COMMENT '实际物化实例数（冲突跳过的不计入）',
    skipped_count     INT           NOT NULL DEFAULT 0 COMMENT '因冲突被跳过的实例数（列表要如实显示，不静默少建）',
    room_id           BIGINT        NOT NULL COMMENT '会议室 biz_meeting_room.id',
    room_no           VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '会议室编号快照',
    room_name         VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '会议室名称快照',
    room_location     VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '位置拼接快照',
    title             VARCHAR(200)  NOT NULL COMMENT '会议主题模板',
    description       VARCHAR(1000) NULL COMMENT '议程模板',
    online_meeting_url VARCHAR(500) NULL COMMENT '线上会议链接模板',
    biz_type          VARCHAR(24)   NOT NULL DEFAULT 'general' COMMENT '关联业务类型',
    biz_id            BIGINT        NULL COMMENT '关联业务对象ID',
    biz_no            VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '关联业务编号快照',
    biz_url           VARCHAR(500)  NULL COMMENT '关联业务跳转链接',
    attendee_json     TEXT          NULL COMMENT '参会人快照 JSON（改期新建实例时沿用，不回查 HR）',
    organizer_id      BIGINT        NOT NULL COMMENT '组织者 sys_user.id',
    organizer_emp_no  VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '组织者在册工号快照',
    organizer_name    VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '组织者姓名快照',
    department_id     BIGINT        NULL COMMENT '主办方部门ID',
    department_name   VARCHAR(128)  NOT NULL DEFAULT '' COMMENT '主办方部门名称快照',
    status            VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active/cancelled',
    cancelled_scope   VARCHAR(16)   NULL COMMENT '取消语义：this/future/all（历史实例永不改写，靠这列说明当时选了哪档）',
    cancel_reason     VARCHAR(300)  NULL COMMENT '取消原因',
    cancelled_by      BIGINT        NULL COMMENT '取消操作人',
    cancelled_at      DATETIME      NULL COMMENT '取消时间',
    request_key       VARCHAR(64)   NULL COMMENT '幂等键（同一组织者+同一键只生效一次）',
    request_hash      VARCHAR(64)   NULL COMMENT '请求摘要（同键不同内容要被拒绝）',
    created_by        VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '创建人',
    created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by        VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted           TINYINT       NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    version           INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    active_series_no  VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN series_no ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：系列编号',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_series_no (active_series_no),
    UNIQUE KEY uk_meeting_series_request (organizer_id, request_key),
    KEY idx_meeting_series_room (room_id, start_date),
    KEY idx_meeting_series_organizer (organizer_id, status),
    KEY idx_meeting_series_status (status, end_date),
    CONSTRAINT ck_meeting_series_freq CHECK (freq IN ('daily','weekly')),
    CONSTRAINT ck_meeting_series_interval CHECK (interval_n >= 1 AND interval_n <= 30),
    CONSTRAINT ck_meeting_series_time CHECK (time_end > time_start),
    CONSTRAINT ck_meeting_series_range CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT ck_meeting_series_limit CHECK (occurrence_limit BETWEEN 1 AND 100),
    CONSTRAINT ck_meeting_series_status CHECK (status IN ('active','cancelled')),
    CONSTRAINT ck_meeting_series_cancel CHECK (
        status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL)),
    CONSTRAINT ck_meeting_series_scope CHECK (
        cancelled_scope IS NULL OR cancelled_scope IN ('this','future','all'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='周期会议主表（模板 + 物化进度）';

-- -----------------------------------------------------------------------------
-- 2. 预约黑名单：爽约达阈值自动进入，或行政手动加入
--    一个用户同一时刻只能有一条生效记录（active_user 生成列唯一键），
--    否则"到底哪条在生效、什么时候解除"变成多条互相矛盾的活跃行。
--    status 单独成列而不是靠日期推断：手动撤销必须留行可查，删行等于毁掉处置记录。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_blacklist (
    id                BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    user_id           BIGINT        NOT NULL COMMENT '被限制用户 sys_user.id',
    emp_no            VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '在册工号快照',
    name              VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '姓名快照',
    department_name   VARCHAR(128)  NOT NULL DEFAULT '' COMMENT '部门名称快照',
    reason            VARCHAR(300)  NOT NULL COMMENT '限制原因（自动进入写爽约次数，手动写人工理由）',
    source            VARCHAR(16)   NOT NULL DEFAULT 'admin' COMMENT '来源：auto=系统按阈值判定 / admin=行政手动',
    no_show_count     INT           NOT NULL DEFAULT 0 COMMENT '判定时近30天爽约次数（手动加入为 0）',
    start_date        DATE          NOT NULL COMMENT '生效开始日',
    end_date          DATE          NOT NULL COMMENT '解除日（含当日；到期由查询按日期判定，不需要每日 job 翻状态）',
    status            VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active/revoked（expired 由日期派生，不落库避免每天全表更新）',
    revoked_by        BIGINT        NULL COMMENT '撤销操作人',
    revoked_at        DATETIME      NULL COMMENT '撤销时间',
    revoke_reason     VARCHAR(300)  NULL COMMENT '撤销原因',
    created_by        VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '创建人',
    created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by        VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted           TINYINT       NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    version           INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    active_user       BIGINT GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 AND status = 'active' THEN user_id ELSE NULL END) STORED
        COMMENT '同一用户同时只能有一条生效限制记录',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_blacklist_active (active_user),
    KEY idx_meeting_blacklist_user (user_id, start_date),
    KEY idx_meeting_blacklist_status (status, end_date),
    CONSTRAINT ck_meeting_blacklist_source CHECK (source IN ('auto','admin')),
    CONSTRAINT ck_meeting_blacklist_status CHECK (status IN ('active','revoked')),
    CONSTRAINT ck_meeting_blacklist_range CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议预约黑名单（爽约治理）';

-- -----------------------------------------------------------------------------
-- 3. 预约单补列：cancel_scope（三档取消语义落到单条实例上）
--    230 建表时未包含，这里用 ALTER 补；已存在则跳过（幂等由 Java 迁移保证）。
--    与系列表的 cancelled_scope 分工：系列记"当时选了哪档"，实例记"我是被哪档取消的"。
-- -----------------------------------------------------------------------------
ALTER TABLE biz_meeting_booking
    ADD COLUMN cancel_scope VARCHAR(16) NULL COMMENT '取消範圍：this/future/all（周期會議三檔取消語義留痕）' AFTER cancel_reason;

-- 枚举值与系列表同口径钉成 CHECK：cancel_scope 只在有周期语义时非空，
-- 但一旦写入就必须是三档之一，否则报表按 scope 分组时会冒出未知桶。
ALTER TABLE biz_meeting_booking
    ADD CONSTRAINT ck_meeting_booking_cancel_scope CHECK (
        cancel_scope IS NULL OR cancel_scope IN ('this','future','all'));

ALTER TABLE biz_meeting_booking
    ADD KEY idx_meeting_booking_cancel_scope (cancel_scope);

-- -----------------------------------------------------------------------------
-- 4. 参会人补索引：签到页与提醒投递都要按"我参与的会议 + 时间"取数
-- -----------------------------------------------------------------------------
ALTER TABLE biz_meeting_attendee
    ADD KEY idx_meeting_attendee_notify (booking_id, notify_status);

-- -----------------------------------------------------------------------------
-- 5. 编号规则：系列编号 MS + YYYYMMDD + 4 位（与会议单号同表维护）
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) VALUES
  ('meeting_series', '會議周期系列號', '會議管理', 'MS', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號');

-- -----------------------------------------------------------------------------
-- 6. 菜单：預約規則（M2 新增，规则 Tab + 黑名单 Tab）
--    与 M1 的 4 个叶子同挂在「會議管理」分组下，sort=5 接在預約記錄之後。
--    actions 含 edit 是因为改全局规则与手动拉黑/撤销都是写操作，缺 edit 就等于能力授不出去。
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 回滚说明（禁止 DROP）：
--   停用周期会议与黑名单：UPDATE sys_menu SET deleted=1 WHERE menu_key='meeting-config';
--   黑名单整体停用：把 meeting_no_show_threshold 置 0（不自动拉黑），已生效行由行政逐条撤销；
--   数据完整保留，恢复时反向操作即可。
-- -----------------------------------------------------------------------------
