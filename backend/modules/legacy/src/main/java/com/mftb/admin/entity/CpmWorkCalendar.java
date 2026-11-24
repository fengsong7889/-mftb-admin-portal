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
 * CPM 工时口径日历：工作日判定的唯一真源。
 *
 * <p>四种类型只回答一个问题——「这天算不算工时」：
 * {@code holiday}/{@code comp_off}/{@code leave} 都扣减，只有 {@code makeup}（周末上班）计入。
 * 判定规则见 {@code CpmWorkdays}，与前端台账共用同一份口径表（结构锁用例逐日比对）。
 *
 * <p>{@code userId = 0} 是「全局法定名单」哨兵而不是 NULL：MySQL 唯一键含 NULL 时
 * 允许多行并存，用 NULL 表达全局会让同一天长出两条重复名单，
 * 而 0 不是合法的 sys_user.id（自增从 1 起），不会与真实用户冲突。
 */
@Data
@TableName("biz_cpm_work_calendar")
public class CpmWorkCalendar {

    /** 全局名单哨兵：节假日与补班属于所有人，不挂在任何用户名下 */
    public static final long GLOBAL_USER = 0L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 0=全局（節假日/補班）；其他=本人（調休/請假） */
    private Long userId;

    private LocalDate workDate;

    /** holiday/makeup/comp_off/leave（CpmConstants.DAY_TYPE_*） */
    private String dayType;

    /** 只作解释（如「春节」「年假」），不参与计算 */
    private String note;

    /* 审计列同 CpmWorklogGroup：fill 注解只决定进不进 INSERT，
       createdBy/updatedBy 由服务层显式落当前用户（全局 handler 只填时间列） */
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
