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
 * CPM 成果认定（CFR 的 Recognition：上级对条目/汇报的正式认可）。
 *
 * <p>安全口径全部落在数据库与服务层，不依赖前端隐藏按钮：
 * <ul>
 *   <li>to_user_id 由服务端按目标归属推导，请求体没有传「被认定人」的位置（防伪造台账）；</li>
 *   <li>from != to 由 CHECK 约束硬拒，同人同目标唯一键硬拒重复认定；</li>
 *   <li>sync_to_perf 为 HR 绩效考核取证接口的预留位，本期服务端不读取——
 *       过程层（本系统）与结果层（HR 考核）分层不合并，防止「点赞变打分」。</li>
 * </ul>
 */
@Data
@TableName("biz_cpm_recognition")
public class CpmRecognition {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** item/report */
    private String targetType;

    private Long targetId;

    private Long fromUserId;

    /** 被认定人：服务端由目标归属推导 */
    private Long toUserId;

    /** 目标标题快照：档案时间线不依赖目标仍存活 */
    private String targetTitle;

    /** highlight=亮點 milestone=里程碑 */
    private String kind;

    private String comment;

    /** 归属期间标（如 2026-Q4），期末汇总取证口径 */
    private String periodTag;

    /** 预留：HR 绩效考核取证同步标记（本期不读取） */
    private Integer syncToPerf;

    /** 预留：同步时间 */
    private LocalDateTime syncedAt;

    @TableField(fill = FieldFill.INSERT)
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private Integer deleted;
}
