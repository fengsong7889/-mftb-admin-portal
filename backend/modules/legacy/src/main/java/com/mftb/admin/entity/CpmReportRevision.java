/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * CPM 汇报正式版本（阶段三；发布即冻结，修订产生新版本而不是覆盖旧版）。
 *
 * <p>为什么阶段二把 published 做成终态、阶段三必须打开：终态消灭了「事后偷偷改」，
 * 方向没错，但它顺带堵死了补录——唯一出路是整期作废重发，而已发出的钉钉卡片链接仍指着旧内容。
 * 会议纪要为同一个矛盾建了不可变版本表，本表照此收敛。
 *
 * <p>刻意没有 {@code deleted} 列：版本是不可变事实，软删一个版本等于毁掉取证链；
 * 「当前生效哪一版」由 {@code biz_cpm_report.published_revision_id} 单点指向。
 *
 * <p>{@code revisionNo} 与推送批次无关：批次回答「这一版发给了谁」，版本回答「内容本身是什么」，
 * 混在一起会重演纪要早期「重发一次就多一个版本」的口径污染。
 */
@Data
@TableName("biz_cpm_report_revision")
public class CpmReportRevision {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long reportId;

    /** 从 1 递增 */
    private Integer revisionNo;

    /** 快照结构版本：阶段三起为 2（含工时维度） */
    private Integer schemaVersion;

    /** 该次发布的聚合快照全文（JSON 列） */
    @TableField("document_snapshot")
    private String documentSnapshot;

    private String digest;

    /** 摘要是否 AI 生成：1 = 阅读面与导出必须披露 */
    private Integer aiSummary;

    /** 修订说明；V1 固定为「首次發布」 */
    private String changeNote;

    private Long publisherUserId;

    private String publisherName;

    private String publisherEmpNo;

    private LocalDateTime publishedAt;

    /** 本次发布锁定的草稿版本 */
    private Integer draftVersion;

    /** 发布时草稿与快照的内容摘要，用于判定后续草稿变动 */
    private String draftHash;

    private String requestKey;

    private String requestHash;

    private String createdBy;

    private LocalDateTime createdAt;

    /** 创建时固定，不提供版本修改接口 */
    private String updatedBy;

    private LocalDateTime updatedAt;
}
