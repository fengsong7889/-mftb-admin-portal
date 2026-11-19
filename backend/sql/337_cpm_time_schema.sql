# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。
-- =============================================================================
-- 337: 持续绩效系统（cpm）阶段三 · 投入时段表
--
-- 真值位置：backend/modules/legacy/src/main/resources/337_cpm_time_schema.sql（打进镜像被执行），
--          backend/sql/ 下同名文件为逐字一致的参考副本。
-- 实际幂等执行由 CpmSchemaMigrationInitializer 的 cpm:schema:v1.1 负责
-- （本脚本只含 CREATE TABLE IF NOT EXISTS，可安全重放；biz_cpm_item 的补列由 Java 迁移器
--   先查 information_schema.COLUMNS 再 ALTER，故不写进本脚本）。
--
-- 为什么要一张「时段表」而不是在条目上加 start_time/end_time 两列（方案 §已定版决策 1）：
--   条目是跨周期的长期事项——延续带入让同一条目在多天各写一笔进度流水。一对起止时间挂在一行上，
--   意味着跨 5 天的事项只能记一次投入，日报的「当日工时」、周报的「日均工时」、
--   月报的「时间分配趋势」全都无源可算；而且第二次保存会覆盖第一次的记录。
--   事实的粒度是「某天某段」，所以存储粒度也必须是「某天某段」。
--
-- 三条与既有口径的对齐说明：
--   1) 时刻用 TIME 而不是 DATETIME：条目已有 work_date，用 DATETIME 会让「日期列」与
--      「时刻自带的日期」打架（跨夜时后者比前者晚一天）；跨夜由 crosses_midnight 显式表达。
--   2) duration_minutes 落库而不是查询时由起止现算：允许显式覆盖（中途离开、补记、只记得时长），
--      算出的值必须固化——否则同一行在不同查询里会给出不同工时。
--   3) 同日允许多段，因此这里刻意不建 UNIQUE(item_id, work_date)：
--      RDM 的 rdm_work_log 是「同人同任务同日唯一 + 重复提交累加」，服务的是当日工时合计；
--      CPM 的时段是区间事实，上午评审与下午开发是两段，合并成一行就丢了时间分配。
--
-- 工时仍是投入侧数据：本表只支撑分布统计与时间成本展示，禁止进任何评价或排名口径（反内卷红线）。
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 投入时段（只追加；条目主表 first_start_at/last_end_at/work_hours 由本表回算）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_time_entry (
    id               BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    item_id          BIGINT       NOT NULL COMMENT '所属条目 biz_cpm_item.id',
    user_id          BIGINT       NOT NULL COMMENT '归属人 sys_user.id（冗余自条目：按人+日聚合免 JOIN，与 rdm_work_log 冗余 req_id 同理）',
    work_date        DATE         NOT NULL COMMENT '投入日（Asia/Shanghai 业务日，与 item.work_date 可不同=补记历史）',
    start_time       TIME         NULL COMMENT '开始时刻 HH:mm；NULL=只记时长不记区间',
    end_time         TIME         NULL COMMENT '结束时刻 HH:mm；跨夜由 crosses_midnight 标记',
    crosses_midnight TINYINT      NOT NULL DEFAULT 0 COMMENT '1=结束时刻属次日（跨夜时段）',
    duration_minutes INT          NOT NULL COMMENT '耗时分钟：服务端由起止算出后固化，允许显式覆盖',
    note             VARCHAR(200) NULL COMMENT '这一段做了什么（选填）',
    created_by       VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by       VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted          TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    version          INT          NOT NULL DEFAULT 0 COMMENT '乐观锁版本：两端同时改同一段只有一边能赢',
    PRIMARY KEY (id),
    KEY idx_cpm_time_user_date (user_id, work_date),
    KEY idx_cpm_time_item (item_id, work_date),
    CONSTRAINT fk_cpm_time_item FOREIGN KEY (item_id) REFERENCES biz_cpm_item (id),
    CONSTRAINT ck_cpm_time_duration CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
    CONSTRAINT ck_cpm_time_range CHECK ((start_time IS NULL) = (end_time IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 投入时段：日/周/月报工时汇总的唯一真源（只追加，同日可多段）';
