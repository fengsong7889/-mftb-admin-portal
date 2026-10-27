-- =============================================================================
-- 230: 会议管理系统（meeting）B1 底座 —— 5 张 biz_meeting_* 表 + 编号规则 + 通知场景 + 默认规则
--
-- 真值位置：backend/src/main/resources/230_meeting_core_tables.sql（打进镜像被执行），
--          本文件为 backend/sql/ 下的参考副本，两者内容由 CI 结构锁用例保证一致。
--
-- 设计口径（对齐用车域 biz_vehicle* 与钉钉/飞书会议室产品边界）：
--   1) 会议室是"资源档案"，预约单是"占用事实"，两者分离：房间停用/维护不得倒改历史占用；
--   2) 免审批先到先得（approval_required / approval_outcome 字段为未来开启审批预留，本期恒不生效）；
--   3) 人员/部门/房间全部存快照：员工改名、房间改名不得改写历史会议；
--   4) 冲突防护三层：房间行 FOR UPDATE → 锁内当前读区间重叠 → 完全相同窗口的生成列唯一键兜底；
--   5) 审计与投递留痕都是追加式表，业务页面只提供查询不提供删改。
--
-- 幂等：全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE / NOT EXISTS 守卫，可重复执行。
-- 跨模块引用（sys_user / sys_department）只建索引不建 FK：这两张表有历史软删与脏数据，
-- 加 FK 会让启动失败（与用车域同一口径）。新建表之间用 FK 硬约束。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 会议室档案（行政维护的唯一真值源）
--    规则"全局默认 + 房间覆盖"两层：房间列为 NULL 时回落到 sys_config 的 meeting_* 默认值，
--    因此这几列必须可空，不能拿 0 或空串当"未配置"。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_room (
    id                    BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    room_no               VARCHAR(32)   NOT NULL COMMENT '会议室编号（行政可读，如 MR-1F-01）',
    room_name             VARCHAR(64)   NOT NULL COMMENT '会议室名称',
    campus                VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '园区',
    building              VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '楼栋',
    floor_code            VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '楼层',
    location_desc         VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '位置描述（如电梯左侧）',
    capacity              INT           NOT NULL DEFAULT 1 COMMENT '容纳人数（预约人数上限的判定依据）',
    facilities            VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '设备代码，前后带逗号便于 LIKE 精确匹配：,PROJECTION,WHITEBOARD,VIDEO_TERMINAL,PHONE,WIRELESS_CAST,',
    photo_urls            TEXT          NULL COMMENT '照片地址 JSON 数组',
    status                VARCHAR(20)   NOT NULL DEFAULT 'active' COMMENT '状态：active/maintenance/disabled',
    bookable              TINYINT       NOT NULL DEFAULT 1 COMMENT '是否允许预约：0=仅展示不可订',
    bookable_start_time   TIME          NULL COMMENT '每日可预约起始（NULL=回落全局默认 08:00）',
    bookable_end_time     TIME          NULL COMMENT '每日可预约结束（NULL=回落全局默认 22:00）',
    min_duration          INT           NULL COMMENT '单场最短分钟（NULL=回落全局默认）',
    max_duration          INT           NULL COMMENT '单场最长分钟（NULL=回落全局默认）',
    checkin_required      TINYINT       NOT NULL DEFAULT 0 COMMENT '是否需要签到保留（M2 生效，本期只维护不动作）',
    release_after_minutes INT           NULL COMMENT '开始后未签到多少分钟自动释放（NULL=回落全局默认 15）',
    hide_title            TINYINT       NOT NULL DEFAULT 0 COMMENT '忙闲视图是否脱敏主题：1=只显示已占用',
    approval_required     TINYINT       NOT NULL DEFAULT 0 COMMENT '预留：房间是否需要审批（本期不接 OA 引擎，服务端不读取）',
    admin_user_ids        VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '房间管理员 sys_user.id，前后带逗号：,12,35,',
    remark                VARCHAR(500)  NULL COMMENT '备注',
    created_by            VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '创建人',
    created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by            VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted               TINYINT       NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    version               INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    active_room_no        VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN room_no ELSE NULL END) STORED COMMENT '软删感知唯一作用域：编号',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_room_no (active_room_no),
    KEY idx_meeting_room_location (campus, building, floor_code),
    KEY idx_meeting_room_status (status, bookable),
    KEY idx_meeting_room_capacity (capacity),
    CONSTRAINT ck_meeting_room_capacity CHECK (capacity > 0),
    CONSTRAINT ck_meeting_room_status CHECK (status IN ('active','maintenance','disabled')),
    CONSTRAINT ck_meeting_room_window CHECK (
        bookable_start_time IS NULL OR bookable_end_time IS NULL OR bookable_end_time > bookable_start_time),
    CONSTRAINT ck_meeting_room_duration CHECK (
        min_duration IS NULL OR max_duration IS NULL OR max_duration >= min_duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议室档案（资源台账，行政维护）';

-- -----------------------------------------------------------------------------
-- 2. 会议预约单（占用事实 + 业务关联 + 状态机）
--    时间一律 DATETIME，区间语义为左闭右开 [start_time, end_time)：
--    10:00-11:00 与 11:00-12:00 是相邻不是冲突，这条口径必须与 Mapper 里的重叠 SQL 一致。
--    series_id / series_seq 为 M2 周期会议预留：单场会议恒为 NULL。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_booking (
    id                 BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    booking_no         VARCHAR(32)   NOT NULL COMMENT '会议单号（MT + YYYYMMDD + 4位）',
    title              VARCHAR(200)  NOT NULL COMMENT '会议主题',
    biz_type           VARCHAR(24)   NOT NULL DEFAULT 'general' COMMENT '关联业务类型：general/rdm_review/interview/training',
    biz_id             BIGINT        NULL COMMENT '关联业务对象ID（如 rdm 需求ID）',
    biz_no             VARCHAR(32)   NULL COMMENT '关联业务对象编号快照（如 XQ202609120001）',
    biz_url            VARCHAR(500)  NULL COMMENT '关联业务对象跳转链接（详情页深链）',
    room_id            BIGINT        NOT NULL COMMENT '会议室 biz_meeting_room.id',
    room_no            VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '会议室编号快照',
    room_name          VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '会议室名称快照',
    room_location      VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '园区/楼栋/楼层拼接快照（通知卡片与列表直接展示）',
    organizer_id       BIGINT        NOT NULL COMMENT '组织者 sys_user.id（服务端从 JWT 取，不信前端传值）',
    organizer_emp_no   VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '组织者在册工号快照（MFxxxxx）',
    organizer_name     VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '组织者姓名快照',
    department_id      BIGINT        NULL COMMENT '主办方部门 sys_department.id',
    department_name    VARCHAR(128)  NOT NULL DEFAULT '' COMMENT '主办方部门名称快照',
    delegate_for_id    BIGINT        NULL COMMENT '代订的实际使用人 sys_user.id（M2 生效，组织者与使用人分列）',
    delegate_for_name  VARCHAR(64)   NULL COMMENT '实际使用人姓名快照',
    start_time         DATETIME      NOT NULL COMMENT '会议开始时间（区间左闭）',
    end_time           DATETIME      NOT NULL COMMENT '会议结束时间（区间右开）',
    series_id          BIGINT        NULL COMMENT '周期会议主表ID（M2，单场为 NULL）',
    series_seq         INT           NULL COMMENT '周期会议内序号，从 1 起（M2，单场为 NULL）',
    attendee_count     INT           NOT NULL DEFAULT 1 COMMENT '参会人数（含组织者与外部人员）',
    description        VARCHAR(1000) NULL COMMENT '会议议程',
    online_meeting_url VARCHAR(500)  NULL COMMENT '线上会议链接（腾讯会议/钉钉会议等，人工填写）',
    external_attendees VARCHAR(500)  NULL COMMENT '外部参会人姓名快照，逗号分隔（无系统账号）',
    status             VARCHAR(20)   NOT NULL DEFAULT 'booked' COMMENT '业务状态：booked/checked_in/finished/cancelled/released',
    cancel_reason      VARCHAR(300)  NULL COMMENT '取消原因（取消必须留原因）',
    cancelled_by       BIGINT        NULL COMMENT '取消操作人 sys_user.id',
    cancelled_at       DATETIME      NULL COMMENT '取消时间',
    checkin_at         DATETIME      NULL COMMENT '首次签到时间（M2 生效）',
    checkin_by         BIGINT        NULL COMMENT '签到动作的执行人 sys_user.id',
    actual_start_at    DATETIME      NULL COMMENT '实际开始时间（签到即视为开始）',
    actual_end_at      DATETIME      NULL COMMENT '实际结束时间（提前结束时写入，使用率统计取它）',
    release_at         DATETIME      NULL COMMENT '释放时间（自动或行政手动）',
    release_by_id      BIGINT        NULL COMMENT '行政手动释放操作人；自动释放为 NULL（区分两种释放的事实）',
    release_reason     VARCHAR(300)  NULL COMMENT '释放原因（手动必填）',
    no_show_flag       TINYINT       NOT NULL DEFAULT 0 COMMENT '爽约：预约了但未签到即被释放',
    approval_outcome   VARCHAR(20)   NOT NULL DEFAULT 'not_applicable' COMMENT '预留：审批结论（本期恒为 not_applicable）',
    flow_no            VARCHAR(32)   NULL COMMENT '预留：关联 OA 流程编号',
    request_key        VARCHAR(64)   NULL COMMENT '幂等键（同一操作人 + 同一键只生效一次）',
    request_hash       VARCHAR(64)   NULL COMMENT '请求摘要（同键不同内容要被拒绝）',
    created_by         VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '创建人',
    created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by         VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted            TINYINT       NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    version            INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    active_booking_no  VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN booking_no ELSE NULL END) STORED COMMENT '软删感知唯一作用域：单号',
    active_slot        VARCHAR(80) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 AND status IN ('booked','checked_in')
             THEN CONCAT('R', room_id, '|', DATE_FORMAT(start_time, '%Y%m%d%H%i'),
                         '|', DATE_FORMAT(end_time, '%Y%m%d%H%i'))
             ELSE NULL END) STORED
        COMMENT '完全相同占用窗口的重复预约兜底；区间重叠仍由服务层锁内当前读判定',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_booking_no (active_booking_no),
    UNIQUE KEY uk_meeting_booking_request (organizer_id, request_key),
    UNIQUE KEY uk_meeting_booking_slot (active_slot),
    KEY idx_meeting_booking_room (room_id, start_time, status),
    KEY idx_meeting_booking_organizer (organizer_id, start_time),
    KEY idx_meeting_booking_status_start (status, start_time),
    KEY idx_meeting_booking_series (series_id, series_seq),
    KEY idx_meeting_booking_biz (biz_type, biz_id),
    KEY idx_meeting_booking_dept (department_id, start_time),
    CONSTRAINT fk_meeting_booking_room FOREIGN KEY (room_id) REFERENCES biz_meeting_room (id),
    CONSTRAINT ck_meeting_booking_window CHECK (end_time > start_time),
    CONSTRAINT ck_meeting_booking_attendee CHECK (attendee_count > 0),
    CONSTRAINT ck_meeting_booking_status CHECK (
        status IN ('booked','checked_in','finished','cancelled','released')),
    CONSTRAINT ck_meeting_booking_biz_type CHECK (
        biz_type IN ('general','rdm_review','interview','training')),
    -- 语义一致性：释放必须留下释放时间与爽约事实的对应关系，防止"无原因的释放"
    CONSTRAINT ck_meeting_booking_release CHECK (
        status <> 'released' OR (release_at IS NOT NULL AND no_show_flag = 1)),
    CONSTRAINT ck_meeting_booking_cancel CHECK (
        status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议预约单（占用事实/业务关联/状态机）';

-- -----------------------------------------------------------------------------
-- 3. 参会人（邀约对象与响应状态；通知投递与日程可见性的锚点）
--    组织者也会作为 attendee_type=organizer 落一行：日程查询只需 JOIN 这一张表，
--    不必在 SQL 里到处拼"我发起的 OR 我参与的"两套条件。
--    外部参会人无 sys_user 账号，user_id 为 NULL，只留姓名快照。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_attendee (
    id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    booking_id        BIGINT       NOT NULL COMMENT '预约单 biz_meeting_booking.id',
    user_id           BIGINT       NULL COMMENT '参会人 sys_user.id（外部人员为 NULL）',
    emp_no            VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '在册工号快照',
    name              VARCHAR(64)  NOT NULL COMMENT '姓名快照',
    department_name   VARCHAR(128) NOT NULL DEFAULT '' COMMENT '部门名称快照',
    attendee_type     VARCHAR(16)  NOT NULL DEFAULT 'required' COMMENT '角色：organizer/required/optional/external',
    response          VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '响应：pending/accepted/declined/invalid',
    respond_at        DATETIME     NULL COMMENT '响应时间',
    notify_status     VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '邀约投递态：pending/sent/skipped/failed',
    notify_note       VARCHAR(200) NULL COMMENT '投递说明（如"未綁定釘釘"/"場景未啟用"）',
    checkin_at        DATETIME     NULL COMMENT '个人签到时间（M2 生效）',
    invalid_reason    VARCHAR(64)  NULL COMMENT '失效原因（如"離職"），历史会议只标不改',
    created_by        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted           TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_attendee   VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 AND user_id IS NOT NULL THEN CONCAT(booking_id, '|', user_id)
             ELSE NULL END) STORED COMMENT '同一会议同一员工只能有一行（外部人无唯一身份不参与约束）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_attendee (active_attendee),
    KEY idx_meeting_attendee_user (user_id, response),
    KEY idx_meeting_attendee_booking (booking_id, attendee_type),
    -- 不写 ON DELETE CASCADE：MySQL 8.4 实测拒绝「外键列被生成列引用」与 CASCADE 共存
    -- （报 1215 Cannot add foreign key constraint）。本域只做逻辑删除，硬删预约单的路径不存在，
    -- 保留默认的 NO ACTION 反而更安全：真出现孤儿引用时启动即失败，而不是静默级联 wipe 名单。
    CONSTRAINT fk_meeting_attendee_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id),
    CONSTRAINT ck_meeting_attendee_type CHECK (attendee_type IN ('organizer','required','optional','external')),
    CONSTRAINT ck_meeting_attendee_response CHECK (response IN ('pending','accepted','declined','invalid')),
    CONSTRAINT ck_meeting_attendee_notify CHECK (notify_status IN ('pending','sent','skipped','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议参会人（邀约对象/响应/投递态）';

-- -----------------------------------------------------------------------------
-- 4. 审计事件（追加式，业务页面只提供查询，禁止删改）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_event (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    booking_id      BIGINT       NULL COMMENT '预约单ID；会议室档案类事件为 NULL',
    room_id         BIGINT       NULL COMMENT '会议室ID（改房对比前后；档案事件为被操作房间）',
    target_no       VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '会议单号快照',
    event_code      VARCHAR(32)  NOT NULL COMMENT '事件：create/update/cancel/checkin/release/finish/notify/reject',
    reason          VARCHAR(300) NULL COMMENT '原因（取消/释放必填）',
    before_json     TEXT         NULL COMMENT '变更前快照',
    after_json      TEXT         NULL COMMENT '变更后快照',
    operator_id     BIGINT       NULL COMMENT '操作人 sys_user.id（系统动作如自动释放为 NULL）',
    operator_name   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作人姓名，系统动作写 SYSTEM',
    operator_emp_no VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '操作人工号快照',
    request_key     VARCHAR(64)  NULL COMMENT '幂等键（同键只落一条事件，防重复点击长出两条轨迹）',
    occurred_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_event_request (operator_id, request_key),
    KEY idx_meeting_event_booking (booking_id, occurred_at),
    KEY idx_meeting_event_room (room_id, occurred_at),
    CONSTRAINT fk_meeting_event_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议审计事件（追加式，不可被业务页面删改）';

-- -----------------------------------------------------------------------------
-- 5. 通知投递留痕（可排查漏通知/重发；重试队列与幂等底线同表）
--    UNIQUE(booking_id, event_code, receiver_user_id) 是"开始前提醒只发一次"的硬保证：
--    Job 每次扫到同一场会议都会撞这个键，靠 ON DUPLICATE 只回写失败信息，不会重复投递。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_notify_log (
    id                    BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    booking_id            BIGINT       NOT NULL COMMENT '预约单ID',
    booking_no            VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '会议单号快照',
    event_code            VARCHAR(32)  NOT NULL COMMENT '事件编码（见 MeetingConstants.EVENT_*）',
    scenario              VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '通知场景（meeting_invite/meeting_remind/meeting_ops）',
    channel               VARCHAR(16)  NOT NULL DEFAULT 'DINGTALK' COMMENT '渠道：DINGTALK/INBOX',
    receiver_user_id      BIGINT       NULL COMMENT '接收人 sys_user.id',
    receiver_name         VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '接收人姓名快照',
    receiver_emp_no       VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '接收人工号快照',
    receiver_dingtalk_id  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '钉钉用户ID快照（排查绑定问题）',
    send_status           VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '结果：pending/sending/success/skipped/failed',
    retry_count           INT          NOT NULL DEFAULT 0 COMMENT '已重试次数',
    next_retry_at         DATETIME     NULL COMMENT '下次重试时间（投递任务按此取数）',
    error_msg             VARCHAR(500) NULL COMMENT '失败/跳过原因',
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted               TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_notify_dedup (booking_id, event_code, receiver_user_id),
    KEY idx_meeting_notify_due (send_status, next_retry_at),
    KEY idx_meeting_notify_booking (booking_id, event_code),
    CONSTRAINT fk_meeting_notify_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id) ON DELETE CASCADE,
    CONSTRAINT ck_meeting_notify_status CHECK (send_status IN ('pending','sending','success','skipped','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议通知投递留痕与重试队列';

-- -----------------------------------------------------------------------------
-- 6. 会议单号规则（MT + YYYYMMDD + 4位）
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) VALUES
  ('meeting_booking', '會議單號', '會議管理', 'MT', 'YYYYMMDD', 4, 1, 1, '{prefix} + YYYYMMDD + {n}位自增序號');

-- -----------------------------------------------------------------------------
-- 7. 通知场景登记（默认 enabled=0：上线不发消息，行政在「通知配置」绑定应用后再开启）
--    app_id 留 NULL 由管理员选择企业应用；ON DUPLICATE 只回写名称/说明，不动 enabled，
--    避免每次启动把管理员关掉的场景又打开。
-- -----------------------------------------------------------------------------
INSERT INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by)
SELECT s.k, NULL, 0, 'meeting-b1' FROM (
    SELECT 'meeting_invite' AS k UNION ALL SELECT 'meeting_remind' UNION ALL SELECT 'meeting_ops'
) s
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_scenario t WHERE t.scenario_key = s.k);

-- -----------------------------------------------------------------------------
-- 8. 全局预约规则默认值（房间级列为 NULL 时回落这里；INSERT IGNORE 不覆盖管理员改动）
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO sys_config (config_key, config_value, description) VALUES
  ('meeting_advance_days', '30', '最可提前预约天数'),
  ('meeting_min_lead_minutes', '0', '最少需提前多少分钟预约（0=允许即时预定）'),
  ('meeting_default_duration', '60', '新建预约的默认时长（分钟）'),
  ('meeting_max_duration_minutes', '240', '单场会议最长时长（分钟，房间未单独配置时的上限）'),
  ('meeting_time_granularity', '15', '预约时间粒度（分钟）'),
  ('meeting_bookable_start_time', '08:00', '每日默认可预约起始时间'),
  ('meeting_bookable_end_time', '22:00', '每日默认可预约结束时间'),
  ('meeting_remind_minutes', '15', '会议开始前多少分钟发提醒'),
  ('meeting_checkin_open_minutes', '5', '允许提前多少分钟签到'),
  ('meeting_release_after_minutes', '15', '开始后未签到多少分钟自动释放'),
  ('meeting_no_show_threshold', '3', '近30天爽约达该次数则自动限制预约（0=不自动拉黑）'),
  ('meeting_blacklist_days', '7', '自动限制预约的天数');

-- -----------------------------------------------------------------------------
-- 9. 示例会议室（仅在表完全为空时写入，已有真实档案的环境绝不注入假数据）
--    行政核对后可直接改名/停用，编号保持 MR-* 口径。
-- -----------------------------------------------------------------------------
INSERT INTO biz_meeting_room
    (room_no, room_name, campus, building, floor_code, location_desc, capacity, facilities,
     status, bookable, created_by, updated_by, remark)
SELECT r.room_no, r.room_name, r.campus, r.building, r.floor_code, r.location_desc,
       r.capacity, r.facilities, 'active', 1, 'system', 'system', r.remark
FROM (
    SELECT 'MR-1F-01' AS room_no, '會議室 A' AS room_name, '總部' AS campus, '1 棟' AS building,
           '1F' AS floor_code, '電梯左側' AS location_desc, 8 AS capacity,
           ',WHITEBOARD,WIRELESS_CAST,' AS facilities,
           '示例資料，請行政核實後修改名稱與設備' AS remark
    UNION ALL SELECT 'MR-1F-02', '會議室 B', '總部', '1 棟', '1F', '電梯右側', 4,
           ',WHITEBOARD,', '示例資料，請行政核實後修改名稱與設備'
    UNION ALL SELECT 'MR-2F-01', '大會議室', '總部', '1 棟', '2F', '走廊盡頭', 20,
           ',PROJECTION,WHITEBOARD,VIDEO_TERMINAL,', '示例資料，請行政核實後修改名稱與設備'
    UNION ALL SELECT 'MR-2F-02', '訪談室', '總部', '1 棟', '2F', '靠窗', 3,
           ',', '示例資料，請行政核實後修改名稱與設備'
) r
WHERE NOT EXISTS (SELECT 1 FROM biz_meeting_room);
