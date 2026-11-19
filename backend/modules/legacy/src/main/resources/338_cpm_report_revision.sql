# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。
-- =============================================================================
-- 338: 持续绩效系统（cpm）阶段三 · 汇报正式版本（发布即冻结，修订不覆盖）
--
-- 真值位置：backend/modules/legacy/src/main/resources/338_cpm_report_revision.sql（打进镜像被执行），
--          backend/sql/ 下同名文件为逐字一致的参考副本。
-- 实际幂等执行由 CpmSchemaMigrationInitializer 的 cpm:report-revision:v1.0 负责
-- （本脚本只含 CREATE TABLE IF NOT EXISTS，可安全重放；biz_cpm_report / biz_cpm_push_record 的
--   补列与指向版本行的外键由 Java 迁移器先查 information_schema 再 ALTER。
--   推送记录侧是单列外键 (revision_id)：该表只有 ref_id 而没有 report_id，
--   复合键 (report_id, revision_id) 在 MySQL 会直接报 "Key column 'report_id' doesn't exist in table"）。
--
-- 为什么阶段二要把 published 做成终态、阶段三又必须打开（方案 §已定版决策与验收复盘）：
--   阶段二的口径是「发布即提交，published 后不可改」，用来消灭「汇报可以事后偷偷改」这条缝隙，
--   方向是对的；但它顺带把「补录」也堵死了——周五晚上想起来周一的时段没记，
--   唯一出路是整期作废重发，而已经发出的钉钉卡片链接还指着旧内容。
--   会议纪要为同一个矛盾建了不可变版本表（biz_meeting_minutes_revision），本表照此收敛：
--   每次发布冻结一个版本，修订产生 V(n+1)，V1 永远还在，通知绑定到具体版本。
--
-- 三条设计约束：
--   1) revision_no 与发送批次无关：批次是「同一版内容发给谁」，版本是「内容本身」，
--      混在一起就会重演纪要早期的「重发一次就多一个版本」的口径污染；
--   2) 不建 deleted 列：版本是不可变事实，软删一个版本等于毁掉取证链，
--      「当前生效哪一版」由 biz_cpm_report.published_revision_id 单点指向；
--   3) request_key + request_hash 双列：与条目/纪要同一套幂等协议——
--      同键同哈希返回原版本（超时重发不该长出 V3），同键不同哈希拒绝（键复用是客户端缺陷）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。
-- =============================================================================

CREATE TABLE IF NOT EXISTS biz_cpm_report_revision (
    id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '不可变发布版本主键',
    report_id         BIGINT       NOT NULL COMMENT '所属汇报 biz_cpm_report.id',
    revision_no       INT          NOT NULL COMMENT '正式版本号，从 1 递增，与推送批次无关',
    schema_version    INT          NOT NULL DEFAULT 1 COMMENT '快照结构版本（阶段三起为 2：含工时维度）',
    document_snapshot JSON         NOT NULL COMMENT '该次发布的聚合快照全文（条目/轨迹/工时/totals），发布即冻结',
    digest            VARCHAR(2000) NULL COMMENT '该次发布的汇总摘要',
    ai_summary        TINYINT      NOT NULL DEFAULT 0 COMMENT '摘要是否 AI 生成：1=阅读面与导出必须披露',
    change_note       VARCHAR(200) NOT NULL DEFAULT '' COMMENT '修订说明（V1 固定为「首次發布」）',
    publisher_user_id BIGINT       NOT NULL COMMENT '实际发布人，由登录身份确定',
    publisher_name    VARCHAR(64)  NOT NULL COMMENT '发布人姓名快照',
    publisher_emp_no  VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '发布人工号快照',
    published_at      DATETIME     NOT NULL COMMENT '发布时间',
    draft_version     INT          NOT NULL COMMENT '本次发布锁定的草稿版本',
    draft_hash        CHAR(64)     NOT NULL COMMENT '发布时草稿与快照的内容摘要，用于判定后续草稿变动',
    request_key       VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '发布幂等键',
    request_hash      CHAR(64)     NOT NULL COMMENT '幂等请求内容摘要',
    created_by        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by        VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建时固定，不提供版本修改接口',
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时固定',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_revision_no (report_id, revision_no),
    UNIQUE KEY uk_cpm_revision_request (report_id, request_key),
    UNIQUE KEY uk_cpm_revision_owner (report_id, id),
    CONSTRAINT fk_cpm_revision_report FOREIGN KEY (report_id) REFERENCES biz_cpm_report (id),
    CONSTRAINT ck_cpm_revision_no CHECK (revision_no > 0),
    CONSTRAINT ck_cpm_revision_schema CHECK (schema_version >= 1),
    CONSTRAINT ck_cpm_revision_draft CHECK (draft_version >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 汇报正式版本（发布后不可覆盖；修订产生新版本）';
