# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。
-- =============================================================================
-- 344: 持续绩效系统（cpm）· 工作台账底座（工作項分组 + 工时口径日历）
--
-- 真值位置：backend/modules/legacy/src/main/resources/344_cpm_worklog_ledger.sql（打进镜像被执行），
--          backend/sql/ 下同名文件为逐字一致的参考副本。
-- 实际幂等执行由 CpmSchemaMigrationInitializer 的 cpm:schema:v1.3 负责
-- （biz_cpm_item 的补列由 Java 迁移器先查 information_schema.COLUMNS 再 ALTER，不写进本脚本）。
--
-- 为什么要这两张表（用户诉求：Excel 台账 =「工作項 × 子任務 × 排期 × 进度 × 工作日口径」）：
--   1) 子任務本来就是 biz_cpm_item（日/周/报的共同事实原子），不再另立任务表——
--      否则同一条工作会长在两张表里，汇报与日报必然分叉，正是用户要求打破的双源问题。
--   2) 「工作項」是分组而不是分类：category 走岗位模板词表（需求評審/開發…），
--      语义是「这件事属于哪类工作」；工作項语义是「这批子任务归属哪个需求」，
--      两者混用会让词表被用户的临时需求名污染，模板也就失去统计价值。
--   3) 排期（计划起止）与投入时段是两件事：first_start_at/last_end_at 由
--      biz_cpm_time_entry 回算，是「实际什么时候干了」；甘特条要的是「计划哪天到哪天」，
--      用回算列去画计划条会把「还没开始的任务」显示成已经干过。故新增 plan_start/plan_end。
--   4) 工时口径（節假日/補班/調休/請假）必须服务端算：耗时决定汇报里的数字，
--      只存在浏览器 localStorage 会让同一任务在两台设备给出两个工时，
--      也让通知/Word/页面三处口径无法对齐。
--
-- user_id=0 的哨兵含义（而不是 NULL）：
--   全局法定名单（節假日/補班）不属于任何个人，但 MySQL 的唯一键含 NULL 时
--   允许多行并存——用 NULL 表达「全局」会让同一天长出两条重复名单，
--   所以用 0 作为「全局」哨兵，唯一键 (active_user, work_date) 才能真正兜住重复。
--   0 不是合法 sys_user.id（自增从 1 起），因此不会与任何真实用户冲突。
--
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 工作項（台账分组）：一个需求/一条工作主线，下挂若干 biz_cpm_item 子任务
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_worklog_group (
    id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    user_id      BIGINT       NOT NULL COMMENT '归属人 sys_user.id（一律服务端由 JWT 注入，请求体无身份字段位置）',
    title        VARCHAR(200) NOT NULL COMMENT '工作項标题（界面即「需求标题」列）',
    hue          TINYINT      NOT NULL DEFAULT 0 COMMENT '合并单元格色相下标，取值域=前端 GROUP_COLORS 长度（令牌色板，不是裸色）',
    sort_order   INT          NOT NULL DEFAULT 0 COMMENT '台账内排序：行序是用户手工拖出来的事实，必须落库',
    rdm_requirement_id BIGINT NULL COMMENT '可选关联产研需求 rdm_requirement.id；自由命名为主，等同需求是例外',
    created_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted      TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_user  BIGINT GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN user_id END) STORED COMMENT '软删感知唯一作用域：归属人',
    active_title VARCHAR(200) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN title END) STORED COMMENT '软删感知唯一作用域：标题',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_group_title (active_user, active_title),
    KEY idx_cpm_group_user_sort (user_id, sort_order),
    CONSTRAINT ck_cpm_group_hue CHECK (hue >= 0 AND hue <= 7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 工作項（台账分组）：子任务 biz_cpm_item 的归属主线';

-- -----------------------------------------------------------------------------
-- 工时口径日历：節假日/補班（全局）与 調休/請假（个人）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_work_calendar (
    id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    user_id      BIGINT      NOT NULL DEFAULT 0 COMMENT '0=全局法定名单（節假日/補班）；其他=本人（調休/請假）。不用 NULL 是因为唯一键含 NULL 可并存多行',
    work_date    DATE        NOT NULL COMMENT '被标记的日期（Asia/Shanghai 业务日）',
    day_type     VARCHAR(16) NOT NULL COMMENT 'holiday=節假日 makeup=補班 comp_off=調休 leave=請假（只有補班计工时）',
    note         VARCHAR(200) NULL COMMENT '备注（如「春节」「年假」），只作解释不参与计算',
    created_by   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建人',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by   VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted      TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    active_user  BIGINT GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN user_id END) STORED COMMENT '软删感知唯一作用域：归属人（含 0=全局）',
    active_date  DATE GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN work_date END) STORED COMMENT '软删感知唯一作用域：日期',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_calendar_day (active_user, active_date),
    KEY idx_cpm_calendar_date (work_date),
    CONSTRAINT ck_cpm_calendar_type CHECK (day_type IN ('holiday', 'makeup', 'comp_off', 'leave'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 工时口径日历：工作日判定唯一真源（周末默认休，補班例外计，其余三类扣减）';
