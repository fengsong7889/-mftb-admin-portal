-- 331: 会议类型扩充 —— 放宽 ck_meeting_booking_biz_type 白名单
--
-- 本文件仅作参考文档：实际执行、幂等与后置校验由
-- MeetingSchemaMigrationInitializer.doBizTypeExpand() / verifyBizTypeExpand() 负责，
-- 版本键 meeting:schema:v1.2（已登记 db/migrations/catalog.json）。
--
-- 背景：原白名单只有 general / rdm_review / interview / training 四项，运营找产品对需求、
-- 项目启动、例会週会、复盘、方案评审、1:1、对外商务这些高频场景只能全塞进「一般會議」。
-- 后果不只是不好选：会议类型作为统计维度时，几乎所有会都落在 general，这个字段等于没有。
--
-- 新增 8 项取值后，白名单唯一真值是 MeetingConstants.BIZ_TYPES：Java 拼出的 IN 列表与本脚本
-- 字面量必须同源，否则会出现两种方向相反的错误 ——「下拉里选得到、提交被服务端拒」
-- 与「服务端放行、写库被 CHECK 打回成『數據庫操作異常』」。
--
-- MySQL 8 没有 DROP CHECK IF EXISTS，Java 侧先查 information_schema.TABLE_CONSTRAINTS
-- 且要求 ENFORCED='YES'（不被强制的 CHECK 等于不存在，登记成已迁移比没有更危险）。
-- 顺序固定为 DROP → MODIFY → ADD：列注释里写着旧的四种取值，不刷新会误导后来人；
-- 而带 CHECK 依赖直接 MODIFY 在 MySQL 8 上并非所有版本都放行，先摘掉约束再改列最稳。

ALTER TABLE biz_meeting_booking DROP CHECK ck_meeting_booking_biz_type;

ALTER TABLE biz_meeting_booking
    MODIFY COLUMN biz_type VARCHAR(24) NOT NULL DEFAULT 'general'
    COMMENT '關聯業務類型：general/rdm_review/interview/training/requirement_alignment/project_kickoff/team_sync/retrospective/design_review/brainstorm/one_on_one/customer_meeting';

ALTER TABLE biz_meeting_booking
    ADD CONSTRAINT ck_meeting_booking_biz_type CHECK (biz_type IN ('brainstorm','customer_meeting','design_review','general','interview','one_on_one','project_kickoff','rdm_review','requirement_alignment','retrospective','team_sync','training'));
