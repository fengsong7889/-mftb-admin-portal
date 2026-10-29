-- 308: 正式会议纪要版本、工作草稿隔离、稳定事项及卡片快照。
-- classpath 文件为执行真值，backend/sql 同名文件为逐字一致的参考副本。
-- CREATE/种子可重放，ALTER 由 Java 迁移器先查 information_schema 再执行。
-- 不回填或追认历史正式版本，不修改既有正文、批次、事项身份与处理结果。

CREATE TABLE IF NOT EXISTS biz_meeting_minutes_revision (
    id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '不可变发布版本主键',
    minutes_id        BIGINT       NOT NULL COMMENT '所属纪要',
    revision_no       INT          NOT NULL COMMENT '正式版本号，从 1 递增，与发送批次无关',
    schema_version    INT          NOT NULL DEFAULT 2 COMMENT '文档结构版本',
    document_snapshot JSON         NOT NULL COMMENT '会议资料、人员、正文、事项约定及引用的完整快照',
    digest            VARCHAR(300) NOT NULL COMMENT '发布时摘要',
    change_note       VARCHAR(200) NOT NULL DEFAULT '' COMMENT '修订说明',
    publisher_user_id BIGINT       NOT NULL COMMENT '实际发布人，由登录身份确定',
    publisher_name    VARCHAR(64)  NOT NULL COMMENT '发布人姓名快照',
    publisher_emp_no  VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '发布人工号快照',
    published_at      DATETIME     NOT NULL COMMENT '发布时间',
    draft_version     INT          NOT NULL COMMENT '本次发布锁定的草稿版本',
    draft_hash        CHAR(64)     NOT NULL COMMENT '发布时工作草稿摘要，用于判定后续草稿变动',
    request_key       VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '发布幂等键',
    request_hash      CHAR(64)     NOT NULL COMMENT '幂等请求内容摘要',
    created_by        VARCHAR(64)  NOT NULL COMMENT '创建人',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by        VARCHAR(64)  NOT NULL COMMENT '创建时固定，不提供版本修改接口',
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_minutes_revision_no (minutes_id, revision_no),
    UNIQUE KEY uk_meeting_minutes_revision_request (minutes_id, request_key),
    UNIQUE KEY uk_meeting_minutes_revision_owner (minutes_id, id),
    CONSTRAINT fk_meeting_minutes_revision_minutes FOREIGN KEY (minutes_id) REFERENCES biz_meeting_minutes (id),
    CONSTRAINT fk_meeting_minutes_revision_publisher FOREIGN KEY (publisher_user_id) REFERENCES sys_user (id),
    CONSTRAINT ck_meeting_minutes_revision_no CHECK (revision_no > 0),
    CONSTRAINT ck_meeting_minutes_revision_schema CHECK (schema_version >= 2),
    CONSTRAINT ck_meeting_minutes_revision_draft CHECK (draft_version >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='正式会议纪要版本（发布后不可覆盖）';

ALTER TABLE biz_meeting_minutes ADD COLUMN published_revision_id BIGINT NULL COMMENT '当前正式版本，NULL=尚无新版正式发布';
ALTER TABLE biz_meeting_minutes ADD COLUMN draft_hash CHAR(64) NULL COMMENT '当前工作草稿与引用的内容摘要';
ALTER TABLE biz_meeting_minutes ADD CONSTRAINT fk_meeting_minutes_published_revision FOREIGN KEY (id, published_revision_id) REFERENCES biz_meeting_minutes_revision (minutes_id, id);

ALTER TABLE biz_meeting_minutes_send ADD COLUMN revision_id BIGINT NULL COMMENT '本次通知绑定的正式版本，旧批次为 NULL';
ALTER TABLE biz_meeting_minutes_send ADD COLUMN message_type VARCHAR(16) NOT NULL DEFAULT 'markdown' COMMENT 'markdown=历史通知，action_card=新版发布通知';
ALTER TABLE biz_meeting_minutes_send ADD COLUMN button_title VARCHAR(20) NULL COMMENT '通知按钮文案快照';
ALTER TABLE biz_meeting_minutes_send ADD COLUMN button_url VARCHAR(500) NULL COMMENT '本次签发的按钮地址，禁止记录日志';
ALTER TABLE biz_meeting_minutes_send ADD COLUMN template_version VARCHAR(64) NULL COMMENT '生成此卡片的模板标识及版本';
ALTER TABLE biz_meeting_minutes_send ADD COLUMN request_hash CHAR(64) NULL COMMENT '新版发送幂等请求摘要';
ALTER TABLE biz_meeting_minutes_send ADD CONSTRAINT fk_meeting_minutes_send_revision FOREIGN KEY (minutes_id, revision_id) REFERENCES biz_meeting_minutes_revision (minutes_id, id);
ALTER TABLE biz_meeting_minutes_send ADD CONSTRAINT ck_meeting_minutes_send_message_type CHECK (message_type IN ('markdown', 'action_card'));

ALTER TABLE biz_meeting_minutes_item ADD COLUMN display_order INT NOT NULL DEFAULT 0 COMMENT '展示排序，0=旧版按 seq 展示，新版 seq 不再重排';
ALTER TABLE biz_meeting_minutes_item ADD COLUMN topic_key VARCHAR(64) NULL COMMENT '关联议题稳定键';
ALTER TABLE biz_meeting_minutes_item ADD COLUMN deliverable VARCHAR(300) NOT NULL DEFAULT '' COMMENT '交付物或验收标准';
ALTER TABLE biz_meeting_minutes_item ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '事项定义与办理共用的并发校验版本';
ALTER TABLE biz_meeting_minutes_item ADD COLUMN published_revision_id BIGINT NULL COMMENT '最近发布此事项约定的版本';
ALTER TABLE biz_meeting_minutes_item ADD CONSTRAINT fk_meeting_minutes_item_revision FOREIGN KEY (minutes_id, published_revision_id) REFERENCES biz_meeting_minutes_revision (minutes_id, id);
ALTER TABLE biz_meeting_minutes_item ADD CONSTRAINT ck_meeting_minutes_item_order CHECK (display_order >= 0 AND version >= 0);

-- 新模板仅提供通知摘要，旧模板及其管理员修改内容全部保留。
INSERT INTO sys_notification_template (scene_key, scene_name, title_tpl, body_tpl, variables, updated_by)
SELECT 'meeting_minutes_published', '會議紀要發布通知', '會議紀要已發布｜${meetingTitle}',
       '**${meetingTitle}**\n\n會議時間：${meetingTime}\n\n紀要編號：${minutesNo}　版本：V${revisionNo}\n\n發布人：${publisher}\n\n議題 ${topicCount} 項 · 行動 ${actionCount} 項 · 跟進 ${followCount} 項\n\n${batchNote}',
       '${meetingTitle},${meetingTime},${minutesNo},${revisionNo},${publisher},${topicCount},${actionCount},${followCount},${batchNote}',
       'meeting-publication-v2'
WHERE NOT EXISTS (SELECT 1 FROM sys_notification_template WHERE scene_key = 'meeting_minutes_published');
