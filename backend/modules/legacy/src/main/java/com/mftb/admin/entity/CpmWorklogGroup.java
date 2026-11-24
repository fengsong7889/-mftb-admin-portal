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

import java.time.LocalDateTime;

/**
 * CPM 工作項（台账分组）。
 *
 * <p>它是「这批子任务归属哪条工作主线」，不是分类：分类走岗位模板词表
 * （{@code biz_cpm_item.category}），语义是「这件事属于哪类工作」。两者混用会让
 * 词表被用户的临时需求名污染，模板也就失去统计价值。
 *
 * <p>同一归属人下标题唯一（{@code uk_cpm_group_title}，软删感知）：重复导入或
 * 双击新建都撞数据库约束，而不是靠前端按钮防抖。
 */
@Data
@TableName("biz_cpm_worklog_group")
public class CpmWorklogGroup {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 归属人 sys_user.id：一律服务端由 JWT 注入，请求体没有身份字段的位置 */
    private Long userId;

    private String title;

    /** 合并单元格色相下标，取值域=前端 GROUP_COLORS 长度（令牌色板） */
    private Integer hue;

    /** 台账内排序：行序是用户手工拖出来的事实 */
    private Integer sortOrder;

    /** 可选关联产研需求：工作項等同需求时回填，自由命名为主 */
    private Long rdmRequirementId;

    /* 审计列：@TableField(fill) 只决定这几列进不进 INSERT，而全局 MetaObjectHandler 只填时间列，
       createdBy/updatedBy 由服务层用 JWT 解出的当前用户显式落值（与 CpmItemService 同口径）。
       表单里没有这两个字段的位置，所以身份来源仍是 token；留空只会把 NULL 写进 NOT NULL 列。 */
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
