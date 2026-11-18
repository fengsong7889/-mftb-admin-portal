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
 * CPM 进度流水（只追加，不提供修改/删除入口）。
 *
 * <p>为什么必须只追加：跨周期追踪与周报轨迹都建立「每个业务日的期末值」之上，
 * 允许改历史流水等于允许事后重叙绩效；更正只能再来一条新流水（同日晚于旧值生效）。
 */
@Data
@TableName("biz_cpm_item_update")
public class CpmItemUpdate {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long itemId;

    /** 更新发生的业务日 */
    private LocalDate updateDate;

    private Integer progress;

    /** 当日期末状态 */
    private String status;

    /** 一句话说明（选填） */
    private String note;

    @TableField(fill = FieldFill.INSERT)
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
