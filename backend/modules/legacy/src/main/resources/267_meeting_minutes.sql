-- =============================================================================
-- 267: 会议纪要（meeting）—— 3 张 biz_meeting_minutes* 表 + 编号规则 + 通知场景
--
-- 真值位置：backend/src/main/resources/267_meeting_minutes.sql（打进镜像被执行），
--          本文件为 backend/sql/ 下的参考副本，两者内容由结构锁用例断言逐字一致。
--
-- 设计口径（对齐 230 会议底座与既有投递留痕）：
--   1) 一场会议一条纪要（uk on booking_id 的软删感知生成列）：纪要问责要指向单场会，
--      出现两条并列纪要时没人说得清哪条是"这场会的结论"；
--   2) 记录人 = 写入时的登录人，三个快照列（id/工号/姓名）由服务端从 JWT 落，
--      请求体里没有 recorder* 的位置——允许前端传就变成"替别人署名记纪要"；
--   3) 发送批次独立成表并带内容快照：纪要可以改，但"已经发出去的那一版"不能被事后改写，
--      否则钉钉里的正文与点开的链接会互相否定；
--   4) 投递明细群占一行、收件人各占一行，receiver_user_id 用 0 而不是 NULL 承载"群"：
--      MySQL 唯一键里 NULL 不参与去重，拿 NULL 占位等于同一批次能重复插多条群投递；
--   5) 三张表都是新增表，不改动 5 张既有会议表与状态机；回滚只需不接入，禁止自动 DROP。
--
-- 幂等：全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE 守卫，可重复执行。
-- 外键：纪要→预约单 用默认 NO ACTION（本域只做逻辑删除，硬删路径不存在）。
--   注意 230 已实测：MySQL 8.4 拒绝「外键列被生成列引用」与 ON DELETE CASCADE 共存（1215），
--   本表的 active_booking 生成列同样引用 booking_id，因此绝不能写 CASCADE。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 会议纪要主体（一场会一条，正文按模板分区存 JSON）
--    content_json 的分区口径由 MeetingMinutesContent 定义：
--    items(议题/讨论/结论) / actions(行动项，负责人只存 sys_user.id) / openIssues /
--    absentees(缺席) / nextMeetingAt / nextMeetingNote / remark。
--    人员姓名与工号是服务端按 id 回查的快照，前端不自报（防伪造台账）。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_minutes (
    id                 BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    minutes_no         VARCHAR(32)   NOT NULL COMMENT '纪要单号（MJ + YYYYMMDD + 4位）',
    booking_id         BIGINT        NOT NULL COMMENT '会议单 biz_meeting_booking.id（一场会一条纪要）',
    booking_no         VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '会议单号快照',
    meeting_title      VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '会议主题快照（卡片与列表直接展示）',
    meeting_time_text  VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '会议时间文本快照（yyyy-MM-dd HH:mm ~ HH:mm）',
    room_text          VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '会议室与位置快照',
    organizer_name     VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '组织者姓名快照',
    series_id          BIGINT        NULL COMMENT '周期会议系列ID快照（单场为 NULL），系列纪要导航按它取数',
    series_seq         INT           NULL COMMENT '系列内序号快照，从 1 起',
    recorder_user_id   BIGINT        NOT NULL COMMENT '记录人 sys_user.id（服务端从 JWT 取，不信前端传值）',
    recorder_emp_no    VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '记录人在册工号快照',
    recorder_name      VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '记录人姓名快照',
    content_json       TEXT          NOT NULL COMMENT '纪要正文 JSON（议题/行动项/未决/缺席/下次会议/备注）',
    digest             VARCHAR(300)  NOT NULL DEFAULT '' COMMENT '摘要（首条结论或首条行动项），列表与钉钉卡片展示',
    status             VARCHAR(16)   NOT NULL DEFAULT 'draft' COMMENT '状态：draft=未发出 sent=至少发过一批（不是锁版，仍可改后重发）',
    send_count         INT           NOT NULL DEFAULT 0 COMMENT '已发送批次数（与 send 表行数字段冗余，列表免 JOIN）',
    last_send_at       DATETIME      NULL COMMENT '最近一次发送时间',
    token_version      INT           NOT NULL DEFAULT 0 COMMENT '免登链接令牌版本：递增即让全部历史链接失效',
    request_key        VARCHAR(64)   NULL COMMENT '幂等键（同一操作人 + 同一键只生效一次）',
    request_hash       VARCHAR(64)   NULL COMMENT '请求摘要（同键不同内容要被拒绝）',
    created_by         VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '创建人',
    created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by         VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted            TINYINT       NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    version            INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    active_booking     BIGINT GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN booking_id ELSE NULL END) STORED
        COMMENT '软删感知唯一作用域：一场会只能有一条有效纪要',
    active_minutes_no  VARCHAR(40) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN minutes_no ELSE NULL END) STORED COMMENT '软删感知唯一作用域：单号',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_minutes_booking (active_booking),
    UNIQUE KEY uk_meeting_minutes_no (active_minutes_no),
    UNIQUE KEY uk_meeting_minutes_request (recorder_user_id, request_key),
    KEY idx_meeting_minutes_recorder (recorder_user_id, updated_at),
    KEY idx_meeting_minutes_series (series_id, series_seq),
    KEY idx_meeting_minutes_status (status, last_send_at),
    CONSTRAINT fk_meeting_minutes_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id),
    CONSTRAINT ck_meeting_minutes_status CHECK (status IN ('draft','sent')),
    CONSTRAINT ck_meeting_minutes_send_count CHECK (send_count >= 0),
    CONSTRAINT ck_meeting_minutes_token CHECK (token_version >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议纪要（一场会一条，正文按模板分区）';

-- -----------------------------------------------------------------------------
-- 2. 发送批次（一次"发送"动作 = 一批：0/1 个群 + N 个收件人）
--    content_snapshot 与 markdown_snapshot 是"发出去的那一版"的事实，
--    与 minutes.content_json 的关系是快照而非引用：纪要被改之后，历史批次仍要能自证。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_minutes_send (
    id                  BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    minutes_id          BIGINT        NOT NULL COMMENT '纪要 biz_meeting_minutes.id',
    booking_id          BIGINT        NOT NULL COMMENT '会议单ID冗余（按会议查发送记录不绕纪要）',
    booking_no          VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '会议单号快照',
    minutes_no          VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '纪要单号快照',
    batch_seq           INT           NOT NULL DEFAULT 1 COMMENT '第几批（从 1 递增）：卡片尾注用它，同日重发才不会被钉钉按相同内容去重',
    title               VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '发送时的会议主题快照（卡片标题）',
    content_snapshot    TEXT          NOT NULL COMMENT '发送时的纪要正文 JSON 快照（免登页渲染源）',
    markdown_snapshot   TEXT          NULL COMMENT '实际投出去的钉钉卡片正文（可能被截断）',
    scenario            VARCHAR(64)   NOT NULL DEFAULT 'meeting_minutes' COMMENT '工作通知场景（收件人通道）',
    group_channel_id    BIGINT        NULL COMMENT '群机器人渠道 sys_notification_channel.id；NULL=本批不发群',
    group_channel_name  VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '渠道名称快照（渠道改名/删除后仍能读出发给谁）',
    receiver_count      INT           NOT NULL DEFAULT 0 COMMENT '收件人人数（含非参会人）',
    token_version       INT           NOT NULL DEFAULT 0 COMMENT '本批链接使用的纪要令牌版本：低于纪要当前版本即已作废',
    link_expire_at      DATETIME      NULL COMMENT '免登链接到期时间',
    send_status         VARCHAR(16)   NOT NULL DEFAULT 'pending' COMMENT '批次结论：pending/sending/success/partial/failed/skipped',
    success_count       INT           NOT NULL DEFAULT 0 COMMENT '已送达明细数（群按 1 计）',
    failed_count        INT           NOT NULL DEFAULT 0 COMMENT '投递失败数',
    skipped_count       INT           NOT NULL DEFAULT 0 COMMENT '未送达数（未绑定钉钉/场景未启用/渠道停用等）',
    error_msg           VARCHAR(500)  NULL COMMENT '批次级失败原因（明细各自的原因在 delivery 表）',
    operator_id         BIGINT        NULL COMMENT '发送操作人 sys_user.id',
    operator_emp_no     VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '操作人工号快照',
    operator_name       VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '操作人姓名快照',
    request_key         VARCHAR(64)   NULL COMMENT '幂等键（双击不会长出两个批次）',
    sent_at             DATETIME      NULL COMMENT '提交投递时间',
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted             TINYINT       NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_minutes_send_seq (minutes_id, batch_seq),
    UNIQUE KEY uk_meeting_minutes_send_request (operator_id, request_key),
    KEY idx_meeting_minutes_send_minutes (minutes_id, sent_at),
    KEY idx_meeting_minutes_send_booking (booking_id, sent_at),
    KEY idx_meeting_minutes_send_status (send_status, updated_at),
    CONSTRAINT fk_meeting_minutes_send_minutes FOREIGN KEY (minutes_id) REFERENCES biz_meeting_minutes (id),
    CONSTRAINT ck_meeting_minutes_send_status CHECK (
        send_status IN ('pending','sending','success','partial','failed','skipped'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议纪要发送批次（含发出瞬间的内容快照）';

-- -----------------------------------------------------------------------------
-- 3. 投递明细（群一行 + 每个收件人一行；同时充当重试队列）
--    receiver_user_id NOT NULL DEFAULT 0：群投递没有收件人，用 0 占位。
--    拿 NULL 占位的话 uk(send_id, target_type, receiver_user_id) 在 MySQL 里不参与去重，
--    同一批次能被重复插进多条群投递——那是"一条纪要在群里刷屏"的直接成因。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_minutes_delivery (
    id                    BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    send_id               BIGINT        NOT NULL COMMENT '批次 biz_meeting_minutes_send.id',
    minutes_id            BIGINT        NOT NULL COMMENT '纪要ID冗余（按纪要查明细不绕批次表）',
    booking_id            BIGINT        NOT NULL COMMENT '会议单ID冗余',
    target_type           VARCHAR(16)   NOT NULL COMMENT '目标类型：GROUP/USER',
    receiver_user_id      BIGINT        NOT NULL DEFAULT 0 COMMENT '收件人 sys_user.id；群投递固定 0（不能留 NULL，唯一键要参与去重）',
    receiver_name         VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '收件人姓名快照（群行存渠道名称）',
    receiver_emp_no       VARCHAR(32)   NOT NULL DEFAULT '' COMMENT '收件人工号快照',
    receiver_department   VARCHAR(128)  NOT NULL DEFAULT '' COMMENT '部门名称快照（发送历史里区分同名的人）',
    receiver_dingtalk_id  VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '钉钉用户ID快照（排查绑定问题）',
    group_channel_id      BIGINT        NULL COMMENT '群渠道ID（target_type=GROUP 时有值）',
    scenario              VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '工作通知场景（USER 行）；群行走 webhook 不占场景',
    send_status           VARCHAR(16)   NOT NULL DEFAULT 'pending' COMMENT '结果：pending/sending/success/skipped/failed',
    retry_count           INT           NOT NULL DEFAULT 0 COMMENT '已重试次数',
    next_retry_at         DATETIME      NULL COMMENT '下次重试时间（投递作业按此取数）',
    error_msg             VARCHAR(500)  NULL COMMENT '失败/跳过原因',
    created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted               TINYINT       NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_minutes_delivery (send_id, target_type, receiver_user_id),
    KEY idx_meeting_minutes_delivery_due (send_status, next_retry_at),
    KEY idx_meeting_minutes_delivery_minutes (minutes_id, send_status),
    KEY idx_meeting_minutes_delivery_receiver (receiver_user_id, created_at),
    CONSTRAINT fk_meeting_minutes_delivery_send FOREIGN KEY (send_id) REFERENCES biz_meeting_minutes_send (id),
    CONSTRAINT ck_meeting_minutes_delivery_target CHECK (target_type IN ('GROUP','USER')),
    CONSTRAINT ck_meeting_minutes_delivery_status CHECK (
        send_status IN ('pending','sending','success','skipped','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议纪要投递明细（群与收件人各自留痕，兼重试队列）';

-- -----------------------------------------------------------------------------
-- 4. 纪要单号规则（MJ + YYYYMMDD + 4位）
--    与「规则配置 > 编号生成规则」界面同源；ON DUPLICATE 只刷展示元数据，不改序号状态。
-- -----------------------------------------------------------------------------
INSERT INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES ('meeting_minutes', '會議紀要單號', '會議管理', 'MJ', 'YYYYMMDD', 4, 1, 1,
        '{prefix} + YYYYMMDD + {n}位自增序號')
ON DUPLICATE KEY UPDATE rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu),
                        prefix = VALUES(prefix), remark = VALUES(remark);

-- -----------------------------------------------------------------------------
-- 5. 工作通知场景登记（默认 enabled=0：上线不发消息，行政在「通知配置」绑定应用后再开）
--    与 230 第 7 段同一策略：app_id 留 NULL 由管理员选择企业应用，
--    ON DUPLICATE 只回写名称/说明用的键位，不动 enabled/app_id，避免启动把管理员的开关翻回去。
-- -----------------------------------------------------------------------------
INSERT INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by)
SELECT s.k, NULL, 0, 'meeting-minutes' FROM (
    SELECT 'meeting_minutes' AS k
) s
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_scenario n WHERE n.scenario_key = s.k);
