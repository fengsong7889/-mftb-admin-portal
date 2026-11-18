/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * CPM 汇报（周/月/季；日报不建实体=条目日视图）。
 *
 * <p>发布即提交：published 后 content_json 冻结不可改（对齐纪要草稿/正式版本隔离），
 * 修订只能重新生成草稿再覆盖。UNIQUE(user_id, period_type, period_start) 保证
 * 每人每期恰一份，「重新生成」的语义是覆盖草稿，不是长出第二份互相矛盾的口径。
 *
 * <p>ai_summary 是披露义务：摘要文字可能来自模型，但任何数字只来自聚合，
 * 界面与导出都必须标出「含 AI 生成内容」。
 */
@Data
@TableName("biz_cpm_report")
public class CpmReport {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** week/month/quarter */
    private String periodType;

    /** 周期起点（周=周一，业务时区 Asia/Shanghai） */
    private LocalDate periodStart;

    private LocalDate periodEnd;

    /** 快照 schemaVersion=1：items[]（itemId/期末状态/进度轨迹）+ totals */
    private String contentJson;

    /** 汇总摘要（人工写或 AI 起草后人工确认） */
    private String summary;

    /** 1=摘要含 AI 生成内容（披露标记） */
    private Integer aiSummary;

    /** draft/published */
    private String status;

    private LocalDateTime publishedAt;

    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    private Integer deleted;
}
