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
 * CPM 投递/提醒记录（发布送达、截止催办、认定通知统一留痕）。
 * <p>幂等口径：催办按 (event_type, user_id, period_start) 同日只发一次——
 * 「连续漏报不升级不排名」的反内卷红线在这里落地为「催办重发被数据库挡掉」。
 * dry-run（cpm.notify.dry-run=true）全部登记为 skipped：验收要看到「本应发什么」，
 * 而不是只看日志一行字。
 */
@Data
@TableName("biz_cpm_push_record")
public class CpmPushRecord {

    public static final String STATUS_QUEUED = "queued";
    public static final String STATUS_SENT = "sent";
    public static final String STATUS_SKIPPED = "skipped";
    public static final String STATUS_FAILED = "failed";

    @TableId(type = IdType.AUTO)
    private Long id;

    /** report_published/report_deadline_remind/recognition_granted */
    private String eventType;

    /** 接收人 sys_user.id（认定事件=被认定人） */
    private Long userId;

    /** 幂等作用域期初 */
    private LocalDate periodStart;

    /** 关联对象（汇报 id / 认定 id） */
    private Long refId;

    /**
     * 本次通知绑定的正式版本（阶段三）。
     *
     * <p>没有它就无法回答「他收到的那一版写了什么」：修订重发布后如果通知仍指向最新内容，
     * 已发出的卡片链接会随时间改变含义，取证与追责都失去依据。
     */
    private Long revisionId;

    /** queued/sent/skipped/failed */
    private String status;

    private String channel;

    /** skipped/failed 原因（如 未绑定钉钉 / dry-run） */
    private String reason;

    private LocalDateTime sentAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
