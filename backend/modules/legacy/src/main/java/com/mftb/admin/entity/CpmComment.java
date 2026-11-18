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
 * CPM 反馈评论（CFR 的 Feedback）。
 * <p>可见即可评：评论资格与阅读范围同一判定（CpmAccessGuard），
 * 不另设「谁能评」的第二套矩阵——留言即辅导，门槛越高越没人留言。
 * parent_id 只允许一层回复，再深拒绝（评论盖楼不是沟通工具的职责）。
 */
@Data
@TableName("biz_cpm_comment")
public class CpmComment {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** item/report */
    private String targetType;

    private Long targetId;

    private Long userId;

    /** 一层回复的父评论 id */
    private Long parentId;

    private String content;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    private Integer deleted;
}
