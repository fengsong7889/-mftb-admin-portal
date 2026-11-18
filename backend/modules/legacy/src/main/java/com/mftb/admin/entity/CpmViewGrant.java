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
 * CPM 团队可见性授权。
 * <p>阅读范围 = 本人 + dept_manager 推导行（部门主管关系，由同步作业幂等重建）
 * + explicit 显式授权行（授权页人工增删）。判定一律在服务层用本表 + 部门关系算，
 * 不接受前端传 scope——「看谁的汇报」从来不是调用方能决定的参数。
 */
@Data
@TableName("biz_cpm_view_grant")
public class CpmViewGrant {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long viewerUserId;

    private Long targetUserId;

    /** dept_manager / explicit */
    private String grantType;

    @TableField(fill = FieldFill.INSERT)
    private String grantedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private Integer deleted;
}
