-- =============================================================================
-- 268: 会议纪要 v2 —— 可跟踪事项 / 关联纪要 / 通知模板 / 推送开关
--
-- 真值位置：backend/src/main/resources/268_meeting_minutes_v2.sql（打进镜像被执行），
--          backend/sql/ 下同名文件为参考副本，由结构锁用例断言逐字一致。
--
-- 为什么把「行动项 / 跟进事项」从 content_json 里搬出来独立成表：
--   1) 它们要能被负责人单独更新状态（已完成/部分完成/无法完成 + 原因），
--      JSON 里改一个字段要整行覆盖，两个人同时更新必然互相抹掉；
--   2) 逾期扫描、提醒去重（last_notified_at）、完成通知都要按行查与按行更新，
--      JSON 只能全表读出来在内存里筛，数据一多就不可用；
--   3) content_json 继续承担"会议内容"（议题/缺席/下次会议/备注），职责按可写主体拆开。
--
-- 关联纪要单独成表并带快照：被关联的纪要可能后来被改，引入方展示的"引自哪场会"必须是
-- 引用当时的事实，因此存 booking_no/title/time_text 快照，只留 minutes_id 供跳转。
--
-- 通知模板与推送开关分表：模板是"怎么写"，开关是"发不发"。合成一行会让
-- 「改文案的人」与「决定静音的人」被迫互相覆盖；分表后各自有独立的 updated_by/at 可追责。
--
-- 幂等：全部 CREATE TABLE IF NOT EXISTS / 守卫式 INSERT，可重复执行。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 可跟踪事项（行动项 + 跟进事项）
--    status: pending=待处理 done=已完成
--    result: completed=已完成 partial=部分完成 cannot=无法完成（done 时必填，用于回答"办到什么程度"）
--    last_notified_at: 逾期提醒去重（同一天只提醒一次；值只用来判断"今天提醒过没有"）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_minutes_item (
    id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    minutes_id        BIGINT       NOT NULL COMMENT '纪要 biz_meeting_minutes.id',
    booking_id        BIGINT       NOT NULL COMMENT '会议单ID冗余（按会议查待办不绕纪要）',
    kind              VARCHAR(16)  NOT NULL COMMENT '类型：ACTION=行動項 FOLLOW=跟進事項',
    seq               INT          NOT NULL DEFAULT 1 COMMENT '同类事项内序号（从 1 起，保存时按顺序重排）',
    content           VARCHAR(500) NOT NULL COMMENT '事项内容',
    owner_user_id     BIGINT       NULL COMMENT '负责人 sys_user.id（服务端回查姓名/工号快照）',
    owner_name        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '负责人姓名快照',
    owner_emp_no      VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '负责人工号快照',
    due_date          DATE         NULL COMMENT '完成时限；NULL=未定时限（不参与逾期扫描）',
    status            VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '状态：pending/done',
    result            VARCHAR(16)  NULL COMMENT '处理结果：completed/partial/cannot',
    resolution_note   VARCHAR(500) NULL COMMENT '结果说明（cannot 必填：为什么没办成）',
    done_at           DATETIME     NULL COMMENT '完成时间',
    done_by           BIGINT       NULL COMMENT '更新人 sys_user.id',
    done_by_name      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '更新人姓名快照',
    last_notified_at  DATETIME     NULL COMMENT '最近一次逾期提醒时间（同一天只提醒一次）',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted           TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_minutes_item (minutes_id, kind, seq),
    KEY idx_meeting_minutes_item_owner (owner_user_id, status, due_date),
    KEY idx_meeting_minutes_item_due (status, due_date, last_notified_at),
    CONSTRAINT fk_meeting_minutes_item_minutes FOREIGN KEY (minutes_id) REFERENCES biz_meeting_minutes (id),
    CONSTRAINT ck_meeting_minutes_item_kind CHECK (kind IN ('ACTION','FOLLOW')),
    CONSTRAINT ck_meeting_minutes_item_status CHECK (status IN ('pending','done')),
    CONSTRAINT ck_meeting_minutes_item_result CHECK (
        result IS NULL OR result IN ('completed','partial','cannot')),
    CONSTRAINT ck_meeting_minutes_item_seq CHECK (seq > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='纪要可跟踪事项（行动项/跟进事项，支持状态更新与逾期提醒）';

-- -----------------------------------------------------------------------------
-- 2. 关联纪要（当前纪要引用其它会议的纪要）
--    快照列不可省略：被引用纪要改名/改期/被删后，引用方仍要能说清"引自哪场会"。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_minutes_link (
    id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    minutes_id        BIGINT       NOT NULL COMMENT '引用方纪要 biz_meeting_minutes.id',
    linked_minutes_id BIGINT       NOT NULL COMMENT '被引用的纪要ID（仅供跳转，展示一律用快照）',
    linked_minutes_no VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '被引用纪要单号快照',
    linked_booking_no VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '被引用会议单号快照',
    linked_title      VARCHAR(200) NOT NULL DEFAULT '' COMMENT '被引用会议主题快照',
    linked_time_text  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '被引用会议时间快照',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_minutes_link (minutes_id, linked_minutes_id),
    KEY idx_meeting_minutes_link_target (linked_minutes_id),
    CONSTRAINT fk_meeting_minutes_link_minutes FOREIGN KEY (minutes_id) REFERENCES biz_meeting_minutes (id),
    CONSTRAINT ck_meeting_minutes_link_self CHECK (minutes_id <> linked_minutes_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='纪要关联（引用其它会议纪要，带来源快照）';

-- -----------------------------------------------------------------------------
-- 3. 通知模板（按场景一行；变量用 ${var} 占位）
--    body_tpl 是钉钉 markdown：只允许加粗/标题/列表/引用/链接（钉钉不支持表格与字体颜色）。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_notification_template (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    scene_key     VARCHAR(64)  NOT NULL COMMENT '通知场景键（与 sys_notification_scenario.scenario_key 对齐）',
    scene_name    VARCHAR(64)  NOT NULL COMMENT '场景名称（展示用，随模板保存刷新）',
    title_tpl     VARCHAR(200) NOT NULL COMMENT '标题模板',
    body_tpl      TEXT         NOT NULL COMMENT '正文模板（钉钉 markdown）',
    variables     VARCHAR(500) NOT NULL DEFAULT '' COMMENT '可用变量说明（逗号分隔，仅提示，不参与渲染）',
    enabled       TINYINT      NOT NULL DEFAULT 1 COMMENT '模板启用：0=回落内置默认文案',
    updated_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_notification_template_scene (scene_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知模板（钉钉 markdown，按场景一行）';

-- -----------------------------------------------------------------------------
-- 4. 推送开关（按场景 × 渠道；关掉即整类不发，留痕仍照常写 skipped）
--    与 sys_notification_scenario.enabled 的分工：那边是"这个场景有没有绑定应用"，
--    这里是"现在这一刻要不要发"——临时静音不该去动绑定关系。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_notification_switch (
    id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    scene_key   VARCHAR(64) NOT NULL COMMENT '通知场景键',
    channel     VARCHAR(16) NOT NULL COMMENT '渠道：DINGTALK_WORK=工作通知 DINGTALK_GROUP=群机器人',
    enabled     TINYINT     NOT NULL DEFAULT 1 COMMENT '是否发送：0=静音 1=发送',
    updated_by  VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_notification_switch (scene_key, channel),
    CONSTRAINT ck_notification_switch_channel CHECK (channel IN ('DINGTALK_WORK','DINGTALK_GROUP'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知推送开关（按场景×渠道临时静音）';

-- -----------------------------------------------------------------------------
-- 5. 默认模板种子（全部幂等：已存在则不动，管理员改过的文案不能被发版打回）
--    层次口径：标题行加粗 → 关键信息逐行"标签：值" → 分区用加粗小标题 + 空行 → 事项用列表，
--    负责人统一 `👤 **姓名（工号）**`（钉钉不支持字体颜色，只能用加粗+符号做区分）。
-- -----------------------------------------------------------------------------
INSERT INTO sys_notification_template (scene_key, scene_name, title_tpl, body_tpl, variables, updated_by)
SELECT s.k, s.n, s.t, s.b, s.v, 'meeting-v2' FROM (
    SELECT 'meeting_invite' AS k, '會議邀約' AS n, '【會議邀約】${meetingTitle}' AS t,
           '**您有一個新的會議邀約**\n\n'
           '**${meetingTitle}**\n\n'
           '會議單號：${meetingNo}\n'
           '會議時間：**${startTime} ~ ${endTime}**\n'
           '會議室：${roomName}${roomLocation}\n'
           '組織者：**${organizer}**\n'
           '${delegateLine}'
           '${agendaLine}'
           '${onlineLine}'
           '${extraLine}'
           '\n[查看會議詳情](${viewUrl})' AS b,
           '${meetingTitle},${meetingNo},${startTime},${endTime},${roomName},${roomLocation},${organizer},${delegateLine},${agendaLine},${onlineLine},${viewUrl}' AS v
    UNION ALL SELECT 'meeting_remind', '會議開始前提醒', '【會議提醒】${meetingTitle}',
           '**會議即將開始**\n\n'
           '**${meetingTitle}**\n\n'
           '開始時間：**${startTime}**\n'
           '會議室：${roomName}${roomLocation}\n'
           '組織者：**${organizer}**\n'
           '${extraLine}'
           '\n[查看會議詳情](${viewUrl})',
           '${meetingTitle},${startTime},${roomName},${roomLocation},${organizer},${viewUrl}'
    UNION ALL SELECT 'meeting_ops', '會議室釋放告知', '【會議室釋放】${meetingTitle}',
           '**會議室已被釋放**\n\n'
           '**${meetingTitle}**\n\n'
           '會議時間：${startTime} ~ ${endTime}\n'
           '會議室：${roomName}${roomLocation}\n'
           '原因：**${reason}**\n'
           '${extraLine}'
           '\n如仍需使用，請重新預約。\n[查看會議詳情](${viewUrl})',
           '${meetingTitle},${startTime},${endTime},${roomName},${roomLocation},${reason},${viewUrl}'
    UNION ALL SELECT 'meeting_minutes', '會議紀要', '【會議紀要】${meetingTitle}',
           '**會議紀要**\n\n'
           '**${meetingTitle}**\n\n'
           '會議單號：${meetingNo}｜紀要單號：${minutesNo}\n'
           '會議時間：${meetingTime}\n'
           '會議室：${roomName}\n'
           '組織者：**${organizer}**｜記錄人：**${recorder}**\n'
           '${absenteeLine}\n'
           '**議程與結論**\n'
           '${agenda}\n\n'
           '**行動項**\n'
           '${actions}\n\n'
           '**跟進事項**\n'
           '${followUps}\n\n'
           '${nextMeetingLine}'
           '${remarkLine}'
           '${linksLine}'
           '\n${batchNote}\n'
           '[查看完整紀要](${viewUrl})',
           '${meetingTitle},${meetingNo},${minutesNo},${meetingTime},${roomName},${organizer},${recorder},${absenteeLine},${agenda},${actions},${followUps},${nextMeetingLine},${remarkLine},${linksLine},${batchNote},${viewUrl}'
    UNION ALL SELECT 'follow_overdue', '跟進事項逾期提醒', '【待辦逾期】${itemContent}',
           '**你有一項會議待辦已逾期**\n\n'
           '事項：**${itemContent}**\n\n'
           '來源會議：${meetingTitle}（${meetingTime}）\n'
           '完成時限：**${dueDate}**（已逾期 ${overdueDays} 天）\n'
           '負責人：👤 **${ownerName}（${ownerEmpNo}）**\n'
           '\n請更新處理狀態；如已完成，請在紀要頁填寫處理結果。\n'
           '[打開紀要](${viewUrl})',
           '${itemContent},${meetingTitle},${meetingTime},${dueDate},${overdueDays},${ownerName},${ownerEmpNo},${viewUrl}'
    UNION ALL SELECT 'follow_done', '跟進事項完成通知', '【待辦完成】${itemContent}',
           '**會議待辦已更新**\n\n'
           '事項：**${itemContent}**\n\n'
           '來源會議：${meetingTitle}（${meetingTime}）\n'
           '處理結果：**${resultLabel}**\n'
           '負責人：👤 **${ownerName}（${ownerEmpNo}）**\n'
           '更新人：${doneByName}\n'
           '${noteLine}'
           '\n[查看紀要](${viewUrl})',
           '${itemContent},${meetingTitle},${meetingTime},${resultLabel},${ownerName},${ownerEmpNo},${doneByName},${noteLine},${viewUrl}'
) s
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_template t WHERE t.scene_key = s.k);

-- -----------------------------------------------------------------------------
-- 6. 推送开关种子（幂等；默认全开，管理员在「推送開關」页临时静音）
-- -----------------------------------------------------------------------------
INSERT INTO sys_notification_switch (scene_key, channel, enabled, updated_by)
SELECT s.k, s.c, 1, 'meeting-v2' FROM (
    SELECT 'meeting_invite' AS k, 'DINGTALK_WORK' AS c
    UNION ALL SELECT 'meeting_remind', 'DINGTALK_WORK'
    UNION ALL SELECT 'meeting_ops', 'DINGTALK_WORK'
    UNION ALL SELECT 'meeting_minutes', 'DINGTALK_WORK'
    UNION ALL SELECT 'meeting_minutes', 'DINGTALK_GROUP'
    UNION ALL SELECT 'follow_overdue', 'DINGTALK_WORK'
    UNION ALL SELECT 'follow_done', 'DINGTALK_GROUP'
) s
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_switch w
                  WHERE w.scene_key = s.k AND w.channel = s.c);

-- -----------------------------------------------------------------------------
-- 7. 通知场景登记：新增两个（默认 enabled=0，行政在「通知渠道配置」绑定应用后开启）
-- -----------------------------------------------------------------------------
INSERT INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by)
SELECT s.k, NULL, 0, 'meeting-v2' FROM (
    SELECT 'follow_overdue' AS k UNION ALL SELECT 'follow_done'
) s
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_scenario n WHERE n.scenario_key = s.k);
