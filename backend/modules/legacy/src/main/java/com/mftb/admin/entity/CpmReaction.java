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
 * CPM 点赞（轻量认可）。
 * <p>与成果认定分层：点赞无通知成本压力、随时可撤（软删），
 * 认定才是进绩效档案的证据——两层混同会让「认可」通胀成「打分」。
 */
@Data
@TableName("biz_cpm_reaction")
public class CpmReaction {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** item/report */
    private String targetType;

    private Long targetId;

    private Long userId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private Integer deleted;
}
