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
 * CPM 岗位模板（通用性来自结构统一，岗位差异只落词表与提示语）。
 * <p>categories_json 同时是条目 category 的服务端白名单与 AI 归类的取值域——
 * 三处共用一份真源，新增岗位=加一行模板，零代码接入。
 */
@Data
@TableName("biz_cpm_template")
public class CpmTemplate {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String templateKey;

    private String name;

    /** 岗位提示（一句话说明该模板服务谁） */
    private String roleHint;

    /** [{key,label,hint}] 分类词表 */
    private String categoriesJson;

    /** 1=记录页显示工时快选（仅分布统计） */
    private Integer workHoursEnabled;

    /** 内置模板不可删除（可停用） */
    private Integer isBuiltin;

    private Integer enabled;

    private String remark;

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
