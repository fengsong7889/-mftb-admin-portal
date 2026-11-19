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
import java.time.LocalTime;

/**
 * CPM 投入时段（阶段三，日/周/月报工时汇总的唯一真源）。
 *
 * <p>为什么不把起止时间挂在 {@code biz_cpm_item} 上：条目是跨周期事项——延续带入让同一条目
 * 在多天各写一笔进度流水，一对起止时间只能记一次投入，「当日工时」「日均」「趋势」全部无源，
 * 而第二次保存还会把第一次的事实覆盖掉。事实的粒度是「某天某段」，存储粒度也必须是它。
 *
 * <p>时刻用 {@code TIME} 而不是 {@code DATETIME}：日期已经由 {@code workDate} 表达，
 * 跨夜由 {@code crossesMidnight} 显式声明。用 DATETIME 会让「日期列」与「时刻自带的日期」
 * 在跨夜时互相打架（后者比前者晚一天），而按日切工时恰恰是最常见的读法。
 *
 * <p>{@code durationMinutes} 落库而不是查询时现算：允许显式覆盖（中途离开、补记、只记得时长），
 * 覆盖后的值必须固化，否则同一行在不同查询里给出不同工时。
 */
@Data
@TableName("biz_cpm_time_entry")
public class CpmTimeEntry {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long itemId;

    /** 归属人：冗余自条目，让「按人+日聚合」不必 JOIN（与 rdm_work_log 冗余 req_id 同理） */
    private Long userId;

    /** 投入日，可与 item.workDate 不同 = 补记历史 */
    private LocalDate workDate;

    private LocalTime startTime;

    private LocalTime endTime;

    /** 1 = 结束时刻属次日 */
    private Integer crossesMidnight;

    private Integer durationMinutes;

    private String note;

    @TableField(fill = FieldFill.INSERT)
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    private Integer deleted;

    /**
     * 乐观锁版本。与 {@code CpmItem} 同款刻意<b>不</b>标 {@code @Version}：
     * 自动填充器只会补 `version = ?`，不会把归属人补进 WHERE，
     * 而本域的 IDOR 防线要求「归属人 + 版本」出现在同一条语句里（见 Mapper.updateOwned）。
     */
    private Integer version;
}
