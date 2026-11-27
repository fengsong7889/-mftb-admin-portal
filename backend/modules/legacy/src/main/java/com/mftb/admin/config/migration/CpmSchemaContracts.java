// Copyright (c) 2026 fengsong7889. All Rights Reserved.
// 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
// 完整许可条款见仓库根目录 LICENSE 文件。
package com.mftb.admin.config.migration;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 持續績效系統（cpm）阶段三关键写入路径的结构契约登记。
 *
 * <p>为什么要登记而不是只靠 {@code applyOnce}：版本键一旦在某环境记成功，迁移就不再重跑；
 * 之后任何一次人工运维（误删表、把列改回 NOT NULL、只建了半张表）都不会被启动流程发现，
 * 缺陷要等到用户点「記時」写不进人才暴露。契约由 SchemaContractValidator 每次启动实查，
 * 缺表可自愈建表、缺列可自愈补列，补不上就报漂移卡住 ready。
 *
 * <p>登记范围刻意只收**新增事实的写入路径**（时段表、版本表）与阶段三给既有表补的指针列：
 * 阶段二的 12 张 cpm 表已在 {@code cpm:schema:v1.0} 落地并被页面长期使用，
 * 把它们的建表 DDL 再抄一份进这里等于制造第二份真源（RdmSchemaContracts 同一口径）。
 */
@Component
public class CpmSchemaContracts implements SchemaContractProvider {

    @Override
    public List<ContractSpec> contracts() {
        List<ContractSpec> list = new ArrayList<>();
        list.add(timeEntryContract());
        list.add(reportRevisionContract());
        list.add(reportRevisionPointerContract());
        list.add(pushRecordRevisionContract());
        list.add(worklogGroupContract());
        list.add(workCalendarContract());
        list.add(worklogMarksContract());
        list.add(worklogCapacityIndexContract());
        return list;
    }

    /**
     * 时段表：一次投入一段，同日允许多段（与 rdm_work_log「同日唯一累加」是两种语义）。
     * <p>这里的 DDL 必须与 337_cpm_time_schema.sql **逐字一致**（索引名、CHECK 名、注释都算）：
     * 副本一旦漂开，自愈建出来的表就和迁移建出来的表不是同一张，而这两种结构在同一个库里
     * 会长期共存且都"能用"——这正是纪要域当年「通知版少一列」的成因。改 337 必须同批改这里。
     */
    private ContractSpec timeEntryContract() {
        return new ContractSpec(
                "cpm-time-entry-table",
                "biz_cpm_time_entry",
                "CREATE TABLE IF NOT EXISTS biz_cpm_time_entry ( "
                        + "id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键', "
                        + "item_id BIGINT NOT NULL COMMENT '所属条目 biz_cpm_item.id', "
                        + "user_id BIGINT NOT NULL COMMENT '归属人 sys_user.id（冗余自条目：按人+日聚合免 JOIN，与 rdm_work_log 冗余 req_id 同理）', "
                        + "work_date DATE NOT NULL COMMENT '投入日（Asia/Shanghai 业务日，与 item.work_date 可不同=补记历史）', "
                        + "start_time TIME NULL COMMENT '开始时刻 HH:mm；NULL=只记时长不记区间', "
                        + "end_time TIME NULL COMMENT '结束时刻 HH:mm；跨夜由 crosses_midnight 标记', "
                        + "crosses_midnight TINYINT NOT NULL DEFAULT 0 COMMENT '1=结束时刻属次日（跨夜时段）', "
                        + "duration_minutes INT NOT NULL COMMENT '耗时分钟：服务端由起止算出后固化，允许显式覆盖', "
                        + "note VARCHAR(200) NULL COMMENT '这一段做了什么（选填）', "
                        + "created_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建人', "
                        + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人', "
                        + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删', "
                        + "version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本：两端同时改同一段只有一边能赢', "
                        + "PRIMARY KEY (id), "
                        + "KEY idx_cpm_time_user_date (user_id, work_date), "
                        + "KEY idx_cpm_time_item (item_id, work_date), "
                        + "CONSTRAINT fk_cpm_time_item FOREIGN KEY (item_id) REFERENCES biz_cpm_item (id), "
                        + "CONSTRAINT ck_cpm_time_duration CHECK (duration_minutes > 0 AND duration_minutes <= 1440), "
                        + "CONSTRAINT ck_cpm_time_range CHECK ((start_time IS NULL) = (end_time IS NULL))"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 投入时段：日/周/月报工时汇总的唯一真源（只追加，同日可多段）'",
                List.of(
                        new ContractSpec.ColumnSpec("item_id", null),
                        new ContractSpec.ColumnSpec("user_id", null),
                        new ContractSpec.ColumnSpec("work_date", null),
                        new ContractSpec.ColumnSpec("duration_minutes", null),
                        new ContractSpec.ColumnSpec("crosses_midnight",
                                "ALTER TABLE biz_cpm_time_entry ADD COLUMN crosses_midnight TINYINT NOT NULL DEFAULT 0"
                                        + " COMMENT '1=结束时刻属次日（跨夜时段）' AFTER end_time")));
    }

    /**
     * 版本表：修订不覆盖旧版，取证链靠这张表。
     * <p>缺列 DDL 一律留 null：这张表列很多且带 JSON 快照，逐列给自愈 ALTER 会形成
     * 与 338 脚本并存的第二份真源；缺列属于结构性破坏，宁可报漂移也不要猜一个默认值补上。
     */
    private ContractSpec reportRevisionContract() {
        return new ContractSpec(
                "cpm-report-revision-table",
                "biz_cpm_report_revision",
                null,
                List.of(
                        new ContractSpec.ColumnSpec("report_id", null),
                        new ContractSpec.ColumnSpec("revision_no", null),
                        new ContractSpec.ColumnSpec("document_snapshot", null),
                        new ContractSpec.ColumnSpec("draft_hash", null),
                        new ContractSpec.ColumnSpec("request_key", null),
                        new ContractSpec.ColumnSpec("request_hash", null)));
    }

    /** 「当前生效哪一版」的单点指针；NULL 是阶段二遗留发布的如实表达，所以必须可空。 */
    private ContractSpec reportRevisionPointerContract() {
        return new ContractSpec(
                "cpm-report-published-revision",
                "biz_cpm_report",
                null,
                List.of(new ContractSpec.ColumnSpec("published_revision_id",
                        "ALTER TABLE biz_cpm_report ADD COLUMN published_revision_id BIGINT NULL"
                                + " COMMENT '當前正式版本，NULL=階段二遺留的舊發布（無版本行）'"),
                        new ContractSpec.ColumnSpec("draft_hash",
                                "ALTER TABLE biz_cpm_report ADD COLUMN draft_hash CHAR(64) NULL"
                                        + " COMMENT '當前工作草稿與快照的內容摘要，用於判定是否存在未發布變更'")));
    }

    /** 通知绑定版本：历史卡片指向的是当时那一版，缺这列就会把旧通知读成新版本。 */
    private ContractSpec pushRecordRevisionContract() {
        return new ContractSpec(
                "cpm-push-record-revision",
                "biz_cpm_push_record",
                null,
                List.of(new ContractSpec.ColumnSpec("revision_id",
                        "ALTER TABLE biz_cpm_push_record ADD COLUMN revision_id BIGINT NULL"
                                + " COMMENT '本次通知綁定的正式版本；歷史連結指向當時那一版'")));
    }

    /**
     * biz_cpm_worklog_group：台账工作項分组的结构契约。
     *
     * <p>这里的 DDL 必须与 344_cpm_worklog_ledger.sql **逐字一致**（索引名、CHECK 名、注释都算）：
     * 副本一旦漂开，自愈建出来的表就和迁移建出来的表不是同一张，两处口径会长期共存且都"能用"。
     */
    private ContractSpec worklogGroupContract() {
        return new ContractSpec(
                "cpm-worklog-group-table",
                "biz_cpm_worklog_group",
                "CREATE TABLE IF NOT EXISTS biz_cpm_worklog_group ( id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键', "
                        + "user_id BIGINT NOT NULL COMMENT '归属人 sys_user.id（一律服务端由 JWT 注入，请求体无身份字段位置）', "
                        + "title VARCHAR(200) NOT NULL COMMENT '工作項标题（界面即「需求标题」列）', "
                        + "hue TINYINT NOT NULL DEFAULT 0 COMMENT '合并单元格色相下标，取值域=前端 GROUP_COLORS 长度（令牌色板，不是裸色）', "
                        + "sort_order INT NOT NULL DEFAULT 0 COMMENT '台账内排序：行序是用户手工拖出来的事实，必须落库', "
                        + "rdm_requirement_id BIGINT NULL COMMENT '可选关联产研需求 rdm_requirement.id；自由命名为主，等同需求是例外', "
                        + "created_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建人', "
                        + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人', "
                        + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删', "
                        + "active_user BIGINT GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN user_id END) STORED COMMENT '软删感知唯一作用域：归属人', "
                        + "active_title VARCHAR(200) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN title END) STORED COMMENT '软删感知唯一作用域：标题', "
                        + "PRIMARY KEY (id), UNIQUE KEY uk_cpm_group_title (active_user, active_title), "
                        + "KEY idx_cpm_group_user_sort (user_id, sort_order), "
                        + "CONSTRAINT ck_cpm_group_hue CHECK (hue >= 0 AND hue <= 7) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 工作項（台账分组）：子任务 biz_cpm_item 的归属主线",
                List.of(
                        new ContractSpec.ColumnSpec("user_id", null),
                        new ContractSpec.ColumnSpec("title", null),
                        new ContractSpec.ColumnSpec("hue", null),
                        new ContractSpec.ColumnSpec("sort_order", null)));
    }

    /**
     * biz_cpm_work_calendar：台账工时口径日历的结构契约。
     *
     * <p>这里的 DDL 必须与 344_cpm_worklog_ledger.sql **逐字一致**（索引名、CHECK 名、注释都算）：
     * 副本一旦漂开，自愈建出来的表就和迁移建出来的表不是同一张，两处口径会长期共存且都"能用"。
     */
    private ContractSpec workCalendarContract() {
        return new ContractSpec(
                "cpm-work-calendar-table",
                "biz_cpm_work_calendar",
                "CREATE TABLE IF NOT EXISTS biz_cpm_work_calendar ( id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键', "
                        + "user_id BIGINT NOT NULL DEFAULT 0 COMMENT '0=全局法定名单（節假日/補班）；其他=本人（調休/請假）。不用 NULL 是因为唯一键含 NULL 可并存多行', "
                        + "work_date DATE NOT NULL COMMENT '被标记的日期（Asia/Shanghai 业务日，与 item.work_date 可不同=补记历史）', "
                        + "day_type VARCHAR(16) NOT NULL COMMENT 'holiday=節假日 makeup=補班 comp_off=調休 leave=請假（只有補班计工时）', "
                        + "note VARCHAR(200) NULL COMMENT '备注（如「春节」「年假」），只作解释不参与计算', "
                        + "created_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建人', "
                        + "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人', "
                        + "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间', "
                        + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删', "
                        + "active_user BIGINT GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN user_id END) STORED COMMENT '软删感知唯一作用域：归属人（含 0=全局）', "
                        + "active_date DATE GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN work_date END) STORED COMMENT '软删感知唯一作用域：日期', "
                        + "PRIMARY KEY (id), UNIQUE KEY uk_cpm_calendar_day (active_user, active_date), "
                        + "KEY idx_cpm_calendar_date (work_date), CONSTRAINT ck_cpm_calendar_type CHECK (day_type IN ('holiday', "
                        + "'makeup', 'comp_off', 'leave')) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 工时口径日历：工作日判定唯一真源（周末默认休，補班例外计，其余三类扣减）",
                List.of(
                        new ContractSpec.ColumnSpec("user_id", null),
                        new ContractSpec.ColumnSpec("work_date", null),
                        new ContractSpec.ColumnSpec("day_type", null)));
    }

    /**
     * biz_cpm_item 标记列（cpm:schema:v1.5）：跟进/阻塞/原因列。
     * <p>DDL 必须与 346_cpm_worklog_marks.sql 一致；四列允许 SchemaContractValidator
     * 在版本键已记但列被误删时自愈，避免下次查询 select * 才暴露 bad SQL grammar。
     */
    private ContractSpec worklogMarksContract() {
        return new ContractSpec(
                "cpm-worklog-marks-columns",
                "biz_cpm_item",
                null,
                List.of(
                        new ContractSpec.ColumnSpec("follow_up",
                                "ALTER TABLE biz_cpm_item ADD COLUMN follow_up TINYINT NOT NULL DEFAULT 0"
                                        + " COMMENT '1=跟进工作（与 planType 正交的独立维度）'"),
                        new ContractSpec.ColumnSpec("blocked",
                                "ALTER TABLE biz_cpm_item ADD COLUMN blocked TINYINT NOT NULL DEFAULT 0"
                                        + " COMMENT '1=阻塞（只作标记，不冻结进度/备注/排期编辑）'"),
                        new ContractSpec.ColumnSpec("blocked_reason",
                                "ALTER TABLE biz_cpm_item ADD COLUMN blocked_reason VARCHAR(200) NULL"
                                        + " COMMENT '阻塞原因（服务端必填校验，解除时清空）'"),
                        new ContractSpec.ColumnSpec("cancel_reason",
                                "ALTER TABLE biz_cpm_item ADD COLUMN cancel_reason VARCHAR(200) NULL"
                                        + " COMMENT '人工取消原因（会议来源取消为空，由 source_type 区分）'")));
    }

    /**
     * biz_cpm_item 容量窗口与归档游标索引（cpm:schema:v1.6）。
     * <p>索引缺失不会报语法错，但会让窗口/归档查询随用户历史量放大扫描；
     * 因此必须和列一样进入启动契约，缺索引时按同一份 DDL 自愈。
     */
    private ContractSpec worklogCapacityIndexContract() {
        return new ContractSpec(
                "cpm-worklog-capacity-indexes",
                "biz_cpm_item",
                null,
                List.of(),
                List.of(
                        new ContractSpec.IndexSpec("idx_cpm_item_user_deleted_status_updated",
                                "ALTER TABLE biz_cpm_item ADD INDEX idx_cpm_item_user_deleted_status_updated "
                                        + "(user_id, deleted, status, updated_at)"),
                        new ContractSpec.IndexSpec("idx_cpm_item_user_deleted_plan_start",
                                "ALTER TABLE biz_cpm_item ADD INDEX idx_cpm_item_user_deleted_plan_start "
                                        + "(user_id, deleted, plan_start, work_date, id)")));
    }
}
