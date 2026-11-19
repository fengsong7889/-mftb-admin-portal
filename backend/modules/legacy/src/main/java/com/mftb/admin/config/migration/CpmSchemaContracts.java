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
}
